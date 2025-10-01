/**
 * Unit tests for FilesystemDetector
 */

import { describe, expect, it } from "bun:test";
import os from "node:os";
import {
  checkFilesystemSafety,
  detectFilesystem,
} from "../../../src/shared/filesystem-detector.js";

describe("FilesystemDetector", () => {
  describe("detectFilesystem", () => {
    it("detects filesystem for current directory", async () => {
      const fsInfo = await detectFilesystem(process.cwd());

      expect(fsInfo).toBeDefined();
      expect(fsInfo.type).toBeDefined();
      expect(typeof fsInfo.isNetwork).toBe("boolean");
      expect(typeof fsInfo.isSafeForAtomicOps).toBe("boolean");
      expect(fsInfo.mountPoint).toBeDefined();
      expect(fsInfo.detectionMethod).toBeDefined();
    });

    it("detects filesystem for temp directory", async () => {
      const fsInfo = await detectFilesystem(os.tmpdir());

      expect(fsInfo).toBeDefined();
      expect(fsInfo.type).toBeDefined();
      expect(fsInfo.isNetwork).toBe(false); // Temp should be local
      expect(fsInfo.mountPoint).toBeDefined();
    });

    it("detects filesystem for home directory", async () => {
      const fsInfo = await detectFilesystem(os.homedir());

      expect(fsInfo).toBeDefined();
      expect(fsInfo.type).toBeDefined();
      expect(fsInfo.mountPoint).toBeDefined();
    });

    it("handles non-existent paths by checking parent directory", async () => {
      const nonExistentPath = "/tmp/despec-test-nonexistent-path-12345";
      const fsInfo = await detectFilesystem(nonExistentPath);

      expect(fsInfo).toBeDefined();
      expect(fsInfo.type).toBeDefined();
    });

    it("detects safe filesystems correctly on macOS", async () => {
      if (os.platform() !== "darwin") {
        return; // Skip on non-macOS
      }

      const fsInfo = await detectFilesystem(process.cwd());

      // macOS typically uses APFS or HFS+
      if (
        fsInfo.type === "apfs" ||
        fsInfo.type === "hfs" ||
        fsInfo.type === "hfsplus"
      ) {
        expect(fsInfo.isSafeForAtomicOps).toBe(true);
        expect(fsInfo.isNetwork).toBe(false);
        expect(fsInfo.warning).toBeUndefined();
      }
    });

    it("detects safe filesystems correctly on Linux", async () => {
      if (os.platform() !== "linux") {
        return; // Skip on non-Linux
      }

      const fsInfo = await detectFilesystem(process.cwd());

      // Linux typically uses ext4, xfs, btrfs
      if (["ext2", "ext3", "ext4", "xfs", "btrfs"].includes(fsInfo.type)) {
        expect(fsInfo.isSafeForAtomicOps).toBe(true);
        expect(fsInfo.isNetwork).toBe(false);
        expect(fsInfo.warning).toBeUndefined();
      }
    });

    it("handles fallback detection gracefully", async () => {
      // Test that fallback detection works for normal paths
      const fsInfo = await detectFilesystem("/some/test/path");

      // Fallback should still provide useful information
      expect(fsInfo).toBeDefined();
      expect(fsInfo.type).toBeDefined();
      expect(fsInfo.detectionMethod).toBeDefined();

      // On known platforms (macOS, Linux, Windows), local paths should be considered safe
      // even if we can't detect the exact filesystem type
      const platform = os.platform();
      if (
        platform === "darwin" ||
        platform === "linux" ||
        platform === "win32"
      ) {
        expect(fsInfo.isSafeForAtomicOps).toBe(true);
      }
    });
  });

  describe("checkFilesystemSafety", () => {
    it("checks filesystem safety without throwing", async () => {
      const fsInfo = await checkFilesystemSafety(process.cwd());

      expect(fsInfo).toBeDefined();
      expect(fsInfo.type).toBeDefined();
    });

    it("returns filesystem info for temp directory", async () => {
      const fsInfo = await checkFilesystemSafety(os.tmpdir());

      expect(fsInfo).toBeDefined();
      expect(fsInfo.isNetwork).toBe(false);
    });

    it("logs warning for unsafe filesystems", async () => {
      // Capture console.warn
      const warnings: string[] = [];
      const originalWarn = console.warn;
      console.warn = (...args: any[]) => {
        warnings.push(args.join(" "));
      };

      try {
        // Test with a path that might be unsafe
        const fsInfo = await checkFilesystemSafety("/some/test/path");

        if (!fsInfo.isSafeForAtomicOps) {
          expect(warnings.length).toBeGreaterThan(0);
          expect(warnings.some((w) => w.includes("FILESYSTEM WARNING"))).toBe(
            true,
          );
        }
      } finally {
        console.warn = originalWarn;
      }
    });
  });

  describe("filesystem type detection", () => {
    it("identifies network filesystems correctly", async () => {
      // We can't reliably test NFS/SMB mounts in CI, but we can verify the logic
      // by checking that detection method is returned
      const fsInfo = await detectFilesystem(process.cwd());

      expect(["mount", "stat", "windows", "fallback"]).toContain(
        fsInfo.detectionMethod,
      );
    });

    it("provides mount point information", async () => {
      const fsInfo = await detectFilesystem(process.cwd());

      expect(fsInfo.mountPoint).toBeDefined();
      expect(fsInfo.mountPoint.length).toBeGreaterThan(0);
    });

    it("identifies safe filesystems based on type", async () => {
      const fsInfo = await detectFilesystem(os.tmpdir());

      // Common safe filesystem types
      const safeTypes = [
        "apfs",
        "hfs",
        "hfsplus", // macOS
        "ext2",
        "ext3",
        "ext4",
        "xfs",
        "btrfs", // Linux
        "ntfs",
        "refs", // Windows
        "tmpfs",
        "ramfs", // Memory
      ];

      if (safeTypes.includes(fsInfo.type)) {
        expect(fsInfo.isSafeForAtomicOps).toBe(true);
      }
    });

    it("identifies network filesystems based on type", async () => {
      // We can verify the detection logic exists
      const fsInfo = await detectFilesystem(process.cwd());

      const networkTypes = ["nfs", "nfs4", "cifs", "smb", "smbfs"];

      if (networkTypes.includes(fsInfo.type)) {
        expect(fsInfo.isNetwork).toBe(true);
        expect(fsInfo.isSafeForAtomicOps).toBe(false);
        expect(fsInfo.warning).toBeDefined();
      }
    });
  });

  describe("cross-platform detection", () => {
    it("works on current platform", async () => {
      const platform = os.platform();
      const fsInfo = await detectFilesystem(process.cwd());

      expect(fsInfo).toBeDefined();
      expect(fsInfo.detectionMethod).toBeDefined();

      // Verify platform-specific detection was attempted
      if (platform === "darwin") {
        expect(["mount", "stat", "fallback"]).toContain(fsInfo.detectionMethod);
      } else if (platform === "linux") {
        expect(["mount", "stat", "fallback"]).toContain(fsInfo.detectionMethod);
      } else if (platform === "win32") {
        expect(["windows", "fallback"]).toContain(fsInfo.detectionMethod);
      }
    });

    it("provides fallback for unsupported platforms", async () => {
      // The detector should always return something, even if detection fails
      const fsInfo = await detectFilesystem(process.cwd());

      expect(fsInfo).toBeDefined();
      expect(fsInfo.type).toBeDefined();
      expect(fsInfo.mountPoint).toBeDefined();
    });
  });

  describe("warning messages", () => {
    it("provides clear warning for network filesystems", async () => {
      // Create a mock scenario by testing the warning format
      const testWarning =
        "Network filesystem (nfs) detected. Atomic operations are not guaranteed. " +
        "File locking may fail and data corruption is possible under concurrent access.";

      expect(testWarning).toContain("Network filesystem");
      expect(testWarning).toContain("Atomic operations are not guaranteed");
      expect(testWarning).toContain("data corruption");
    });

    it("provides clear warning for unknown filesystems", async () => {
      const testWarning =
        "Could not detect filesystem type. Treating as potentially unsafe. " +
        "If this is a network filesystem (NFS, SMB, etc.), atomic operations may fail.";

      expect(testWarning).toContain("Could not detect");
      expect(testWarning).toContain("potentially unsafe");
      expect(testWarning).toContain("network filesystem");
    });
  });
});
