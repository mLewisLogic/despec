import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { AtomicWriter } from '../../../src/shared/atomic-writer.js';

const TEST_DIR = '/tmp/despec-atomic-writer-tests';

describe('AtomicWriter', () => {
  let writer: AtomicWriter;

  beforeEach(async () => {
    writer = new AtomicWriter();
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  test('writes a single file atomically', async () => {
    const filePath = path.join(TEST_DIR, 'test.txt');
    const content = 'Hello, World!';

    await writer.writeFile(filePath, content);

    const written = await fs.readFile(filePath, 'utf8');
    expect(written).toBe(content);
  });

  test('writes multiple files atomically', async () => {
    const files = [
      { path: path.join(TEST_DIR, 'file1.txt'), content: 'Content 1' },
      { path: path.join(TEST_DIR, 'file2.txt'), content: 'Content 2' },
      { path: path.join(TEST_DIR, 'file3.txt'), content: 'Content 3' },
    ];

    await writer.writeFiles(files);

    for (const file of files) {
      const written = await fs.readFile(file.path, 'utf8');
      expect(written).toBe(file.content);
    }
  });

  test('creates parent directories if they do not exist', async () => {
    const filePath = path.join(TEST_DIR, 'nested', 'deep', 'file.txt');
    const content = 'Nested content';

    await writer.writeFile(filePath, content);

    const written = await fs.readFile(filePath, 'utf8');
    expect(written).toBe(content);
  });

  test('overwrites existing files', async () => {
    const filePath = path.join(TEST_DIR, 'overwrite.txt');
    await fs.writeFile(filePath, 'Old content');

    await writer.writeFile(filePath, 'New content');

    const written = await fs.readFile(filePath, 'utf8');
    expect(written).toBe('New content');
  });

  test('cleans up temp files on failure', async () => {
    const readonlyDir = path.join(TEST_DIR, 'readonly');

    await fs.mkdir(readonlyDir);
    await fs.chmod(readonlyDir, 0o444); // Read-only

    const readonlyFilePath = path.join(readonlyDir, 'file.txt');

    try {
      await writer.writeFile(readonlyFilePath, 'content');
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error).toBeDefined();
      // Verify no temp files remain in parent directory
      const files = await fs.readdir(TEST_DIR);
      const tempFiles = files.filter((f) => f.includes('.tmp.'));
      expect(tempFiles.length).toBe(0);
    } finally {
      // Cleanup: restore permissions
      await fs.chmod(readonlyDir, 0o755);
    }
  });

  test('handles empty file list', async () => {
    await writer.writeFiles([]);
    // Should not throw
  });

  test('writeFilesSafe returns success result', async () => {
    const files = [
      { path: path.join(TEST_DIR, 'safe1.txt'), content: 'Content 1' },
      { path: path.join(TEST_DIR, 'safe2.txt'), content: 'Content 2' },
    ];

    const result = await writer.writeFilesSafe(files);

    expect(result.success).toBe(true);
    expect(result.filesWritten).toEqual(files.map((f) => f.path));
    expect(result.error).toBeUndefined();
  });

  test('writeFilesSafe returns error result on failure', async () => {
    const readonlyDir = path.join(TEST_DIR, 'readonly-safe');
    await fs.mkdir(readonlyDir);
    await fs.chmod(readonlyDir, 0o444);

    const files = [{ path: path.join(readonlyDir, 'fail.txt'), content: 'content' }];

    const result = await writer.writeFilesSafe(files);

    expect(result.success).toBe(false);
    expect(result.filesWritten).toEqual([]);
    expect(result.error).toBeDefined();

    // Cleanup
    await fs.chmod(readonlyDir, 0o755);
  });

  test('writes files with special characters in content', async () => {
    const filePath = path.join(TEST_DIR, 'special.txt');
    const content = 'Special: \n\t\r"\'`$' + '{test}';

    await writer.writeFile(filePath, content);

    const written = await fs.readFile(filePath, 'utf8');
    expect(written).toBe(content);
  });

  test('handles concurrent writes to different files', async () => {
    const files = Array.from({ length: 10 }, (_, i) => ({
      path: path.join(TEST_DIR, `concurrent-${i}.txt`),
      content: `Content ${i}`,
    }));

    await Promise.all(files.map((f) => writer.writeFile(f.path, f.content)));

    for (const file of files) {
      const written = await fs.readFile(file.path, 'utf8');
      expect(written).toBe(file.content);
    }
  });
});
