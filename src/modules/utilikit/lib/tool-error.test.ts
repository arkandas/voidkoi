import { describe, expect, it } from 'vitest';
import { ApiError, errorOwner, isApiErrorCode } from '@/lib/error-codes';
import { ERRORS } from '@/modules/utilikit/errors';
import { toToolError, ToolError } from '@/modules/utilikit/lib/tool-error';

describe('Utilikit error codes', () => {
  it('are known API error codes owned by Utilikit', () => {
    for (const code of ERRORS) {
      expect(isApiErrorCode(code)).toBe(true);
      expect(errorOwner(code), code).toBe('utilikit');
    }
  });

  it('have no duplicates', () => {
    expect(new Set(ERRORS).size).toBe(ERRORS.length);
  });
});

describe('ToolError', () => {
  it('keeps what a program printed out of the detail, for the log only', () => {
    const error = new ToolError('conversionFailed', 'ffmpeg exited with code 1', 400, '/data/tmp/in.mp4: Invalid data');
    expect(error.detail).toBe('ffmpeg exited with code 1');
    expect(error.message).toBe('conversionFailed: ffmpeg exited with code 1: /data/tmp/in.mp4: Invalid data');
  });
});

describe('toToolError', () => {
  it('keeps a ToolError as it is', () => {
    const error = new ToolError('noAudioTrack', 'detail');
    expect(toToolError(error, 'generic')).toBe(error);
  });

  it('keeps the code and status of a plain ApiError', () => {
    const error = toToolError(new ApiError('unauthorized', 401), 'generic');
    expect(error.code).toBe('unauthorized');
    expect(error.status).toBe(401);
  });

  it('wraps plain errors with the fallback code and keeps the message as detail', () => {
    const error = toToolError(new Error('ffmpeg exited with code 1'), 'conversionFailed');
    expect(error.code).toBe('conversionFailed');
    expect(error.detail).toBe('ffmpeg exited with code 1');
  });

  it('reports a missing binary as toolMissing', () => {
    const spawnError = Object.assign(new Error('spawn ffmpeg ENOENT'), { code: 'ENOENT', syscall: 'spawn ffmpeg' });
    expect(toToolError(spawnError, 'conversionFailed').code).toBe('toolMissing');
  });

  it('does not treat a missing input file as a missing binary', () => {
    const fileError = Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' });
    expect(toToolError(fileError, 'conversionFailed').code).toBe('conversionFailed');
  });

  it('handles non-error values', () => {
    const error = toToolError('boom', 'generic');
    expect(error.code).toBe('generic');
    expect(error.detail).toBeUndefined();
  });
});
