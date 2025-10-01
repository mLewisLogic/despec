import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Filesystem type information
 */
export interface FilesystemInfo {
  /** The filesystem type (e.g., 'apfs', 'ext4', 'ntfs', 'nfs', 'smb') */
  type: string;
  /** Whether this is a network filesystem */
  isNetwork: boolean;
  /** Whether this filesystem is safe for atomic operations */
  isSafeForAtomicOps: boolean;
  /** Warning message if filesystem is problematic */
  warning?: string;
  /** The mount point for this filesystem */
  mountPoint: string;
  /** Detection method used */
  detectionMethod: "mount" | "stat" | "windows" | "fallback";
}

/**
 * Known network filesystems that don't support atomic operations reliably
 */
const NETWORK_FILESYSTEMS = new Set([
  "nfs",
  "nfs4",
  "cifs",
  "smb",
  "smbfs",
  "afp",
  "webdav",
  "sshfs",
  "fuse.sshfs",
  "fuse.rclone",
  "9p",
]);

/**
 * Known local filesystems that support atomic operations
 */
const SAFE_FILESYSTEMS = new Set([
  // macOS
  "apfs",
  "hfs",
  "hfsplus",
  // Linux
  "ext2",
  "ext3",
  "ext4",
  "xfs",
  "btrfs",
  "zfs",
  "reiserfs",
  "jfs",
  // Windows
  "ntfs",
  "refs",
  // Generic
  "tmpfs",
  "ramfs",
]);

/**
 * Sanitizes a filesystem path to prevent command injection.
 * Only allows characters safe for shell commands.
 *
 * @param unsafePath - The potentially unsafe path
 * @returns Sanitized path safe for use in shell commands
 * @throws {Error} If path contains dangerous characters
 */
function sanitizePathForShell(unsafePath: string): string {
  // Check for dangerous shell metacharacters
  const dangerousChars = /[;&|`$()<>'"\\!*?[\]{}~]/;
  if (dangerousChars.test(unsafePath)) {
    throw new Error(
      `Path contains dangerous characters that could lead to command injection: ${unsafePath}`,
    );
  }
  return unsafePath;
}

/**
 * Detects the filesystem type for a given path and determines if it's safe for atomic operations.
 *
 * CRITICAL: Network filesystems (NFS, SMB/CIFS, etc.) do not guarantee atomic mkdir() operations,
 * which breaks our locking mechanism. This detector helps identify such filesystems to prevent
 * data corruption in distributed environments.
 *
 * @param targetPath - The path to check
 * @returns Filesystem information including safety assessment
 * @throws {Error} If path contains dangerous characters
 */
export async function detectFilesystem(
  targetPath: string,
): Promise<FilesystemInfo> {
  // Resolve to absolute path
  const absolutePath = path.resolve(targetPath);

  // Sanitize path to prevent command injection
  const safePath = sanitizePathForShell(absolutePath);

  // Ensure parent directory exists for non-existent paths
  let checkPath = safePath;
  try {
    await fs.access(safePath);
  } catch {
    // If path doesn't exist, check parent directory
    checkPath = sanitizePathForShell(path.dirname(safePath));
  }

  const platform = os.platform();

  try {
    if (platform === "darwin") {
      return await detectMacOSFilesystem(checkPath);
    } else if (platform === "linux") {
      return await detectLinuxFilesystem(checkPath);
    } else if (platform === "win32") {
      return await detectWindowsFilesystem(checkPath);
    } else {
      return createFallbackInfo(checkPath);
    }
  } catch (error) {
    console.warn(`Failed to detect filesystem type: ${error}`);
    return createFallbackInfo(checkPath);
  }
}

/**
 * Detects filesystem on macOS using mount command
 */
async function detectMacOSFilesystem(
  checkPath: string,
): Promise<FilesystemInfo> {
  try {
    // Use mount command to get filesystem info
    const mountOutput = execSync("mount", { encoding: "utf8" });
    const lines = mountOutput.split("\n");

    // Find the mount point for this path
    let bestMatch = { mountPoint: "", type: "unknown", line: "" };

    for (const line of lines) {
      // Format: /dev/disk1s1 on / (apfs, local, journaled)
      // Note: Use \s+ to handle multiple spaces
      const match = line.match(/^(.+?)\s+on\s+(.+?)\s+\((.+?)\)$/);
      if (match?.[2] && match[3]) {
        const mountPoint = match[2];
        const options = match[3];
        if (
          checkPath.startsWith(mountPoint) &&
          mountPoint.length > bestMatch.mountPoint.length
        ) {
          const type = options.split(",")[0]?.trim().toLowerCase() || "unknown";
          bestMatch = { mountPoint, type, line };
        }
      }
    }

    // If no match found, default to root mount point
    if (bestMatch.mountPoint === "") {
      bestMatch.mountPoint = "/";
    }

    const isNetwork =
      NETWORK_FILESYSTEMS.has(bestMatch.type) ||
      bestMatch.line.includes("remote") ||
      bestMatch.line.includes("network");

    return {
      type: bestMatch.type,
      isNetwork,
      isSafeForAtomicOps: !isNetwork && SAFE_FILESYSTEMS.has(bestMatch.type),
      mountPoint: bestMatch.mountPoint,
      detectionMethod: "mount",
      ...(isNetwork && {
        warning:
          `Network filesystem (${bestMatch.type}) detected. Atomic operations are not guaranteed. ` +
          `File locking may fail and data corruption is possible under concurrent access.`,
      }),
    };
  } catch (_error) {
    // Fallback to stat-based detection
    return await detectUsingStatFS(checkPath);
  }
}

/**
 * Detects filesystem on Linux using findmnt or mount command
 */
async function detectLinuxFilesystem(
  checkPath: string,
): Promise<FilesystemInfo> {
  try {
    // Try findmnt first (more reliable)
    try {
      const findmntOutput = execSync(
        `findmnt -n -o FSTYPE,TARGET --target "${checkPath}"`,
        { encoding: "utf8" },
      );
      const parts = findmntOutput.trim().split(/\s+/);
      const type = parts[0];
      const mountPoint = parts[1];

      if (!type || !mountPoint) {
        throw new Error("Invalid findmnt output");
      }

      const fsType = type.toLowerCase();
      const isNetwork = NETWORK_FILESYSTEMS.has(fsType);

      return {
        type: fsType,
        isNetwork,
        isSafeForAtomicOps: !isNetwork && SAFE_FILESYSTEMS.has(fsType),
        mountPoint,
        detectionMethod: "mount",
        ...(isNetwork && {
          warning:
            `Network filesystem (${fsType}) detected. Atomic operations are not guaranteed. ` +
            `File locking may fail and data corruption is possible under concurrent access.`,
        }),
      };
    } catch {
      // Fallback to mount command
      const mountOutput = execSync("mount", { encoding: "utf8" });
      const lines = mountOutput.split("\n");

      let bestMatch = { mountPoint: "", type: "unknown" };

      for (const line of lines) {
        // Format: /dev/sda1 on / type ext4 (rw,relatime)
        const match = line.match(/^(.+?)\s+on\s+(.+?)\s+type\s+(.+?)\s+\(/);
        if (match?.[2] && match[3]) {
          const mountPoint = match[2];
          const type = match[3];
          if (
            checkPath.startsWith(mountPoint) &&
            mountPoint.length > bestMatch.mountPoint.length
          ) {
            bestMatch = { mountPoint, type: type.toLowerCase() };
          }
        }
      }

      // If no match found, default to root mount point
      if (bestMatch.mountPoint === "") {
        bestMatch.mountPoint = "/";
      }

      const isNetwork = NETWORK_FILESYSTEMS.has(bestMatch.type);

      return {
        type: bestMatch.type,
        isNetwork,
        isSafeForAtomicOps: !isNetwork && SAFE_FILESYSTEMS.has(bestMatch.type),
        mountPoint: bestMatch.mountPoint,
        detectionMethod: "mount",
        ...(isNetwork && {
          warning:
            `Network filesystem (${bestMatch.type}) detected. Atomic operations are not guaranteed. ` +
            `File locking may fail and data corruption is possible under concurrent access.`,
        }),
      };
    }
  } catch (_error) {
    // Fallback to stat-based detection
    return await detectUsingStatFS(checkPath);
  }
}

/**
 * Detects filesystem on Windows using wmic
 */
async function detectWindowsFilesystem(
  checkPath: string,
): Promise<FilesystemInfo> {
  try {
    const drive = path.parse(checkPath).root;
    const wmicOutput = execSync(
      `wmic volume where "DriveLetter='${drive.replace("\\", "")}'" get FileSystem,DriveLetter /format:list`,
      { encoding: "utf8" },
    );

    const lines = wmicOutput.split("\n");
    let fsType = "unknown";

    for (const line of lines) {
      if (line.startsWith("FileSystem=")) {
        const parts = line.split("=");
        fsType = parts[1]?.trim().toLowerCase() || "unknown";
        break;
      }
    }

    // Check if it's a network drive
    const isNetwork = checkPath.startsWith("\\\\") || fsType === "unknown";

    return {
      type: fsType,
      isNetwork,
      isSafeForAtomicOps:
        !isNetwork && (fsType === "ntfs" || fsType === "refs"),
      mountPoint: drive,
      detectionMethod: "windows",
      ...(isNetwork && {
        warning:
          `Network filesystem detected. Atomic operations are not guaranteed. ` +
          `File locking may fail and data corruption is possible under concurrent access.`,
      }),
    };
  } catch (_error) {
    // Windows fallback
    const isNetwork = checkPath.startsWith("\\\\");
    return {
      type: isNetwork ? "smb" : "ntfs",
      isNetwork,
      isSafeForAtomicOps: !isNetwork,
      mountPoint: path.parse(checkPath).root,
      detectionMethod: "fallback",
      ...(isNetwork && {
        warning:
          `Network filesystem detected. Atomic operations are not guaranteed. ` +
          `File locking may fail and data corruption is possible under concurrent access.`,
      }),
    };
  }
}

/**
 * Uses statfs/statvfs system call via Node.js fs.statfs (Node 18.15+)
 * Falls back to basic detection if not available
 */
async function detectUsingStatFS(checkPath: string): Promise<FilesystemInfo> {
  try {
    // Try to use fs.statfs if available (Node 18.15+)
    // biome-ignore lint/suspicious/noExplicitAny: fs.statfs is not in Node.js types yet but exists in Node 18.15+
    const statfs = (fs as any).statfs;
    if (typeof statfs === "function") {
      await statfs(checkPath);
      // The type field contains filesystem type as a number
      // We'd need to map these to filesystem names, but for now treat as unknown
      return createFallbackInfo(checkPath);
    }
  } catch {
    // statfs not available
  }

  return createFallbackInfo(checkPath);
}

/**
 * Creates fallback filesystem info when detection fails
 */
function createFallbackInfo(checkPath: string): FilesystemInfo {
  // Conservative approach: if we can't detect the filesystem, we can't guarantee safety
  // but for local paths on known platforms, we can make educated guesses
  const platform = os.platform();
  const isLikelyLocal =
    !checkPath.startsWith("\\\\") && // Not Windows UNC path
    !checkPath.includes("://"); // Not a URI

  if (isLikelyLocal) {
    // Likely a local filesystem, but we couldn't detect the exact type
    // This is common on systems where mount commands fail or return unexpected formats
    return {
      type: "unknown",
      isNetwork: false,
      isSafeForAtomicOps:
        platform === "darwin" || platform === "linux" || platform === "win32",
      mountPoint: "/",
      detectionMethod: "fallback" as const,
      ...(platform !== "darwin" &&
        platform !== "linux" &&
        platform !== "win32" && {
          warning:
            "Could not detect filesystem type. Atomic operations may not be reliable on this platform.",
        }),
    };
  }

  // Path looks like it might be remote
  return {
    type: "unknown",
    isNetwork: false,
    isSafeForAtomicOps: false,
    mountPoint: "/",
    detectionMethod: "fallback",
    warning:
      "Could not detect filesystem type. Treating as potentially unsafe. " +
      "If this is a network filesystem (NFS, SMB, etc.), atomic operations may fail.",
  };
}

/**
 * Checks if a path is on a safe filesystem and throws if not
 *
 * @param targetPath - The path to check
 * @throws {Error} If the filesystem is not safe for atomic operations
 */
export async function requireSafeFilesystem(targetPath: string): Promise<void> {
  const fsInfo = await detectFilesystem(targetPath);

  if (!fsInfo.isSafeForAtomicOps) {
    const message =
      fsInfo.warning ||
      `Unsafe filesystem detected (${fsInfo.type}). Atomic operations are not guaranteed.`;
    throw new Error(`[FILESYSTEM] ${message}`);
  }
}

/**
 * Checks if a path is on a safe filesystem and logs a warning if not
 *
 * @param targetPath - The path to check
 * @returns The filesystem info
 */
export async function checkFilesystemSafety(
  targetPath: string,
): Promise<FilesystemInfo> {
  const fsInfo = await detectFilesystem(targetPath);

  if (!fsInfo.isSafeForAtomicOps) {
    console.warn(
      `⚠️  [FILESYSTEM WARNING] ${fsInfo.warning || `Unsafe filesystem: ${fsInfo.type}`}`,
    );
    console.warn(`   Path: ${targetPath}`);
    console.warn(`   Mount: ${fsInfo.mountPoint}`);
    console.warn(`   Type: ${fsInfo.type}`);
    console.warn(`   Network: ${fsInfo.isNetwork ? "Yes" : "No"}`);
    console.warn(`   Safe for atomic ops: No`);
    console.warn(
      `   Risk: File locking may fail, data corruption possible under concurrent access`,
    );
  }

  return fsInfo;
}
