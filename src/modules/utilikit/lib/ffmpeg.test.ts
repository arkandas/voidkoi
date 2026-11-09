import { spawnSync } from 'child_process';
import http from 'http';
import type { AddressInfo } from 'net';
import { mkdtemp, rm, stat, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AUDIO_FORMATS, buildAudioArgs, buildExtractArgs } from '@/modules/utilikit/lib/audio-convert';
import { toToolError } from '@/modules/utilikit/lib/tool-error';
import { parseProbeOutput, parseTimemark, probeMedia, runFfmpeg } from '@/modules/utilikit/lib/ffmpeg';
import { buildVideoArgs, VIDEO_CODECS } from '@/modules/utilikit/lib/video-convert';

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;
const encoders = hasFfmpeg ? spawnSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' }).stdout : '';
const hasEncoder = (name: string) => new RegExp(`\\s${name}\\s`).test(encoders);

describe('parseProbeOutput', () => {
  it('reads video and audio streams', () => {
    const output = JSON.stringify({
      streams: [
        { codec_type: 'video', codec_name: 'hevc', width: 3840, height: 2160, bit_rate: '20000000', color_space: 'bt2020nc', color_transfer: 'arib-std-b67', color_primaries: 'bt2020' },
        { codec_type: 'audio', codec_name: 'aac', bit_rate: '256000', sample_rate: '48000' },
      ],
      format: { duration: '12.345', bit_rate: '20300000' },
    });

    expect(parseProbeOutput(output)).toEqual({
      duration: 12.345,
      bitrate: 20_300_000,
      video: { codec: 'hevc', width: 3840, height: 2160, bitrate: 20_000_000, colorSpace: 'bt2020nc', colorTransfer: 'arib-std-b67', colorPrimaries: 'bt2020', rotation: 0 },
      audio: { codec: 'aac', bitrate: 256_000, sampleRate: 48_000 },
    });
  });

  it('fills in defaults for missing stream fields', () => {
    const parsed = parseProbeOutput(JSON.stringify({ streams: [{ codec_type: 'video' }, { codec_type: 'audio' }], format: { bit_rate: '3000000' } }));
    expect(parsed.duration).toBe(0);
    expect(parsed.video).toMatchObject({ codec: 'unknown', width: 1920, height: 1080, bitrate: 3_000_000, colorSpace: 'unknown' });
    expect(parsed.audio).toEqual({ codec: 'unknown', bitrate: 192_000, sampleRate: 0 });
  });

  it('reports the display size of rotated phone videos', () => {
    const stream = (extra: object) => JSON.stringify({ streams: [{ codec_type: 'video', width: 1920, height: 1080, ...extra }] });
    expect(parseProbeOutput(stream({ side_data_list: [{ side_data_type: 'Display Matrix', rotation: -90 }] })).video).toMatchObject({ width: 1080, height: 1920, rotation: 270 });
    expect(parseProbeOutput(stream({ side_data_list: [{ rotation: 90 }] })).video).toMatchObject({ width: 1080, height: 1920, rotation: 90 });
    expect(parseProbeOutput(stream({ tags: { rotate: '270' } })).video).toMatchObject({ width: 1080, height: 1920, rotation: 270 });
    expect(parseProbeOutput(stream({ side_data_list: [{ rotation: 180 }] })).video).toMatchObject({ width: 1920, height: 1080, rotation: 180 });
    expect(parseProbeOutput(stream({})).video).toMatchObject({ width: 1920, height: 1080, rotation: 0 });
  });

  it('handles audio-only files and empty output', () => {
    expect(parseProbeOutput(JSON.stringify({ streams: [{ codec_type: 'audio', codec_name: 'mp3' }] })).video).toBeUndefined();
    expect(parseProbeOutput('{}')).toEqual({ duration: 0, bitrate: 0, video: undefined, audio: undefined });
  });

  it('throws on invalid JSON', () => {
    expect(() => parseProbeOutput('not json')).toThrow();
  });
});

describe('parseTimemark', () => {
  it('reads the time from ffmpeg progress lines', () => {
    expect(parseTimemark('frame=  250 fps= 50 q=28.0 size=  1024KiB time=00:01:02.50 bitrate=1342.2kbits/s speed=2x')).toBe(62.5);
    expect(parseTimemark('size=N/A time=01:00:00.00 bitrate=N/A')).toBe(3600);
    expect(parseTimemark('time=00:00:07')).toBe(7);
  });

  it('ignores lines without a usable time', () => {
    expect(parseTimemark('size=N/A time=N/A bitrate=N/A')).toBeNull();
    expect(parseTimemark('Stream #0:0: Video: h264')).toBeNull();
  });
});

describe('runFfmpeg without ffmpeg installed', () => {
  it('fails in a way that maps to toolMissing', async () => {
    const originalPath = process.env.PATH;
    process.env.PATH = '';
    try {
      const error = await runFfmpeg(['-version']).catch(caught => caught);
      expect(toToolError(error, 'conversionFailed').code).toBe('toolMissing');
    } finally {
      process.env.PATH = originalPath;
    }
  });
});

describe.skipIf(!hasFfmpeg)('ffmpeg integration', () => {
  let dir: string;
  let tone: string;
  let clip: string;

  const ffmpeg = (args: string[]) => {
    const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args]);
    if (result.status !== 0) throw new Error(result.stderr.toString());
  };

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'utilikit-ffmpeg-'));
    tone = path.join(dir, 'tone.wav');
    clip = path.join(dir, 'clip.mp4');
    ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-y', tone]);
    ffmpeg([
      '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=25:duration=2',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
      '-c:v', 'mpeg4', '-c:a', 'aac', '-shortest', '-y', clip,
    ]);
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('probes audio and video files', async () => {
    const audio = await probeMedia(tone);
    expect(audio.video).toBeUndefined();
    expect(audio.audio?.codec).toBe('pcm_s16le');
    expect(audio.duration).toBeCloseTo(2, 1);

    const video = await probeMedia(clip);
    expect(video.video).toMatchObject({ codec: 'mpeg4', width: 320, height: 240 });
    expect(video.audio?.codec).toBe('aac');
  });

  it('rejects files that are not media', async () => {
    const text = path.join(dir, 'notes.txt');
    await writeFile(text, 'hello');
    await expect(probeMedia(text)).rejects.toThrow('ffprobe exited');
  });

  it.skipIf(!hasEncoder('libmp3lame'))('converts audio and reports progress', async () => {
    const output = path.join(dir, 'tone.mp3');
    const progress: number[] = [];
    await runFfmpeg(buildAudioArgs(tone, output, AUDIO_FORMATS.mp3, { bitrate: 128 }), 2, percent => progress.push(percent));

    expect((await stat(output)).size).toBeGreaterThan(0);
    expect((await probeMedia(output)).audio?.codec).toBe('mp3');
    expect(progress.every(value => value >= 0 && value <= 99)).toBe(true);
  });

  it('converts to lossless FLAC', async () => {
    const output = path.join(dir, 'tone.flac');
    await runFfmpeg(buildAudioArgs(tone, output, AUDIO_FORMATS.flac, { bitrate: 0 }));
    expect((await probeMedia(output)).audio?.codec).toBe('flac');
  });

  it.skipIf(!hasEncoder('libopus'))('extracts the audio track from a video', async () => {
    const output = path.join(dir, 'clip.opus');
    await runFfmpeg(buildExtractArgs(clip, output, 'opus'));
    const probed = await probeMedia(output);
    expect(probed.video).toBeUndefined();
    expect(probed.audio?.codec).toBe('opus');
  });

  it.skipIf(!hasEncoder('libx264'))('re-encodes video to H.264 at a lower resolution', async () => {
    const output = path.join(dir, 'clip-h264.mp4');
    const info = await probeMedia(clip);
    const args = buildVideoArgs(clip, output, VIDEO_CODECS['mp4-h264'], info, {
      quality: 60,
      resolution: '360',
      preset: 'faster',
      keepAudio: true,
    });
    await runFfmpeg(args, info.duration);

    const probed = await probeMedia(output);
    expect(probed.video).toMatchObject({ codec: 'h264', width: 320, height: 240 });
    expect(probed.audio?.codec).toBe('aac');
  });

  it.skipIf(!hasEncoder('libx264'))('stream-copies when the codec already matches', async () => {
    const h264 = path.join(dir, 'source-h264.mp4');
    ffmpeg(['-i', clip, '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'copy', '-y', h264]);
    const info = await probeMedia(h264);

    const output = path.join(dir, 'copy.mkv');
    const args = buildVideoArgs(h264, output, VIDEO_CODECS.mkv, info, { quality: 100, resolution: 'original', preset: 'medium', keepAudio: false });
    expect(args).toContain('copy');
    await runFfmpeg(args, info.duration);

    const probed = await probeMedia(output);
    expect(probed.video?.codec).toBe('h264');
    expect(probed.audio).toBeUndefined();
  });

  it.skipIf(!hasEncoder('libvpx-vp9') || !hasEncoder('libopus'))('encodes WebM with VP9 and Opus', async () => {
    const output = path.join(dir, 'clip.webm');
    const info = await probeMedia(clip);
    await runFfmpeg(buildVideoArgs(clip, output, VIDEO_CODECS['webm-vp9'], info, { quality: 50, resolution: 'original', preset: 'faster', keepAudio: true }), info.duration);

    const probed = await probeMedia(output);
    expect(probed.video?.codec).toBe('vp9');
    expect(probed.audio?.codec).toBe('opus');
  });

  it.skipIf(!hasEncoder('libx264'))('converts rotated phone videos without squashing them', async ctx => {
    const rotated = path.join(dir, 'rotated.mp4');
    try {
      ffmpeg(['-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=25:duration=1', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-y', path.join(dir, 'landscape.mp4')]);
      ffmpeg(['-display_rotation', '90', '-i', path.join(dir, 'landscape.mp4'), '-c', 'copy', '-y', rotated]);
    } catch {
      ctx.skip();
    }

    const info = await probeMedia(rotated);
    expect(info.video).toMatchObject({ width: 360, height: 640, rotation: 90 });

    const output = path.join(dir, 'rotated-out.mp4');
    await runFfmpeg(buildVideoArgs(rotated, output, VIDEO_CODECS['mp4-h264'], info, { quality: 60, resolution: '360', preset: 'faster', keepAudio: false }));
    expect((await probeMedia(output)).video).toMatchObject({ width: 360, height: 640, rotation: 0 });
  });

  it('logs the end of the ffmpeg log when a conversion fails, and shows only the exit code', async () => {
    const missing = path.join(dir, 'missing.wav');
    const error = await runFfmpeg(['-i', missing, '-y', path.join(dir, 'x.mp3')]).catch(caught => caught);
    expect(error.message).toMatch(/ffmpeg exited with code \d+: .*No such file or directory/);
    expect(error).toMatchObject({ code: 'conversionFailed', detail: expect.stringMatching(/^ffmpeg exited with code \d+$/) });
  });

  it('probes only local files: a playlist pointing at the network is refused', async () => {
    let hits = 0;
    const server = http.createServer((_, response) => {
      hits++;
      response.end();
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const playlist = path.join(dir, 'remote.m3u8');
      const { port } = server.address() as AddressInfo;
      await writeFile(playlist, `#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXTINF:2,\nhttp://127.0.0.1:${port}/segment.ts\n#EXT-X-ENDLIST\n`);
      await expect(probeMedia(playlist)).rejects.toThrow('ffprobe exited');
      expect(hits).toBe(0);
    } finally {
      server.close();
    }
  });
});
