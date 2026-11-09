import { existsSync } from 'fs';
import { mkdir, readdir, rm, utimes, writeFile } from 'fs/promises';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { dataPath } from '@/lib/storage';
import { getTempDir, removeFiles, safeExtension, sweepTempDir, tempFolder, tempPath } from '@/modules/utilikit/lib/temp';

describe('safeExtension', () => {
  it('keeps simple extensions in lower case', () => {
    expect(safeExtension('clip.MP4', 'bin')).toBe('mp4');
    expect(safeExtension('archive.tar.gz', 'bin')).toBe('gz');
  });

  it('falls back for missing or suspicious extensions', () => {
    expect(safeExtension('noextension', 'bin')).toBe('bin');
    expect(safeExtension('trailing.', 'bin')).toBe('bin');
    expect(safeExtension('evil.mp4/../../etc', 'bin')).toBe('bin');
    expect(safeExtension('name.with space', 'bin')).toBe('bin');
    expect(safeExtension('long.abcdefghijk', 'bin')).toBe('bin');
  });
});

describe('tempPath and removeFiles', () => {
  it('keeps the temp directory in Utilikit’s own data folder', () => {
    expect(getTempDir()).toBe(dataPath('utilikit', 'tmp'));
  });

  it('creates paths inside the temp directory and removes them', async () => {
    const file = await tempPath(`test-${process.pid}-${Date.now()}.txt`);
    expect(path.dirname(file)).toBe(getTempDir());

    await writeFile(file, 'x');
    expect(existsSync(file)).toBe(true);

    await removeFiles(file, null, undefined, `${file}.missing`);
    expect(existsSync(file)).toBe(false);
  });
});

describe('tempFolder', () => {
  it('makes a new, empty folder in the temp directory every time', async () => {
    const [first, second] = [await tempFolder('test-folder-'), await tempFolder('test-folder-')];
    try {
      expect(path.dirname(first)).toBe(getTempDir());
      expect(path.basename(first).startsWith('test-folder-')).toBe(true);
      expect(second).not.toBe(first);
      expect(await readdir(first)).toEqual([]);
    } finally {
      await rm(first, { recursive: true, force: true });
      await rm(second, { recursive: true, force: true });
    }
  });
});

describe('sweepTempDir', () => {
  it('removes old leftovers and keeps recent files and those of running jobs', async () => {
    const stamp = `${process.pid}-${Date.now()}`;
    const old = await tempPath(`sweep-old-${stamp}.mp4`);
    const running = await tempPath(`video-input-running-${stamp}.mp4`);
    const recent = await tempPath(`sweep-recent-${stamp}.mp4`);
    const folder = await tempPath(`pdf-sweep-${stamp}`);
    await mkdir(folder);
    await writeFile(path.join(folder, 'page-1.pdf'), 'x');
    for (const file of [old, running, recent]) await writeFile(file, 'x');

    const longAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    for (const entry of [old, running, folder]) await utimes(entry, longAgo, longAgo);

    await sweepTempDir(60 * 60 * 1000, [`running-${stamp}`]);
    expect(existsSync(old)).toBe(false);
    expect(existsSync(folder)).toBe(false);
    expect(existsSync(running)).toBe(true);
    expect(existsSync(recent)).toBe(true);

    await removeFiles(running, recent);
  });
});
