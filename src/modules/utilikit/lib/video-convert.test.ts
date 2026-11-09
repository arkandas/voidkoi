import { describe, expect, it } from 'vitest';

import { MEDIA_DEMUXERS } from '@/lib/media-input';
import type { MediaInfo } from '@/modules/utilikit/lib/ffmpeg';
import { buildVideoArgs, isWideGamut, resolveResolution, VIDEO_CODECS, VideoOptions } from '@/modules/utilikit/lib/video-convert';

const source = (overrides: Partial<NonNullable<MediaInfo['video']>> = {}): NonNullable<MediaInfo['video']> => ({
  codec: 'h264',
  width: 1920,
  height: 1080,
  bitrate: 8_000_000,
  colorSpace: 'bt709',
  colorTransfer: 'bt709',
  colorPrimaries: 'bt709',
  rotation: 0,
  ...overrides,
});

const info = (video = source(), audio: MediaInfo['audio'] = { codec: 'aac', bitrate: 160_000, sampleRate: 48_000 }): MediaInfo => ({
  duration: 10,
  bitrate: 8_200_000,
  video,
  audio,
});

const options = (overrides: Partial<VideoOptions> = {}): VideoOptions => ({
  quality: 100,
  resolution: 'original',
  preset: 'medium',
  keepAudio: true,
  ...overrides,
});

const valueAfter = (args: string[], flag: string) => args[args.indexOf(flag) + 1];

describe('resolveResolution', () => {
  it('keeps the original size', () => {
    expect(resolveResolution(source(), options())).toEqual({ width: 1920, height: 1080 });
  });

  it('scales the short side of landscape video to the preset', () => {
    expect(resolveResolution(source(), options({ resolution: '720' }))).toEqual({ width: 1280, height: 720 });
    expect(resolveResolution(source(), options({ resolution: '360' }))).toEqual({ width: 640, height: 360 });
  });

  it('scales the short side of portrait video to the preset', () => {
    expect(resolveResolution(source({ width: 1080, height: 1920 }), options({ resolution: '1080' }))).toEqual({ width: 1080, height: 1920 });
    expect(resolveResolution(source({ width: 1080, height: 1920 }), options({ resolution: '720' }))).toEqual({ width: 720, height: 1280 });
  });

  it('handles ultrawide video', () => {
    expect(resolveResolution(source({ width: 2560, height: 1080 }), options({ resolution: '720' }))).toEqual({ width: 1706, height: 720 });
  });

  it('never upscales', () => {
    expect(resolveResolution(source({ width: 640, height: 360 }), options({ resolution: '1080' }))).toEqual({ width: 640, height: 360 });
  });

  it('always produces even dimensions', () => {
    expect(resolveResolution(source({ width: 1919, height: 1079 }), options())).toEqual({ width: 1918, height: 1078 });
    const { width, height } = resolveResolution(source({ width: 1000, height: 562 }), options({ resolution: '480' }));
    expect(width % 2).toBe(0);
    expect(height % 2).toBe(0);
  });

  it('clamps custom sizes to the source', () => {
    expect(resolveResolution(source(), options({ resolution: 'custom', customWidth: 1280, customHeight: 720 }))).toEqual({ width: 1280, height: 720 });
    expect(resolveResolution(source(), options({ resolution: 'custom', customWidth: 4000, customHeight: 3000 }))).toEqual({ width: 1920, height: 1080 });
    expect(resolveResolution(source(), options({ resolution: 'custom', customWidth: 853 }))).toEqual({ width: 852, height: 1080 });
  });

  it('ignores unknown presets, including inherited object keys', () => {
    expect(resolveResolution(source(), options({ resolution: '4320' }))).toEqual({ width: 1920, height: 1080 });
    expect(resolveResolution(source(), options({ resolution: 'constructor' }))).toEqual({ width: 1920, height: 1080 });
  });
});

describe('isWideGamut', () => {
  it('detects BT.2020 and HDR transfer functions', () => {
    expect(isWideGamut(source({ colorPrimaries: 'bt2020' }))).toBe(true);
    expect(isWideGamut(source({ colorSpace: 'bt2020nc' }))).toBe(true);
    expect(isWideGamut(source({ colorTransfer: 'smpte2084' }))).toBe(true);
    expect(isWideGamut(source({ colorTransfer: 'arib-std-b67' }))).toBe(true);
  });

  it('treats BT.709 and unknown metadata as SDR', () => {
    expect(isWideGamut(source())).toBe(false);
    expect(isWideGamut(source({ colorSpace: 'unknown', colorTransfer: 'unknown', colorPrimaries: 'unknown' }))).toBe(false);
  });
});

describe('buildVideoArgs', () => {
  it('copies the streams when nothing needs re-encoding', () => {
    const args = buildVideoArgs('in.mov', 'out.mp4', VIDEO_CODECS['mp4-h264'], info(), options());
    expect(args.slice(0, 8)).toEqual(['-protocol_whitelist', 'file', '-format_whitelist', MEDIA_DEMUXERS, '-i', 'in.mov', '-f', 'mp4']);
    expect(valueAfter(args, '-c:v')).toBe('copy');
    expect(valueAfter(args, '-c:a')).toBe('copy');
    expect(valueAfter(args, '-movflags')).toBe('+faststart');
    expect(args).not.toContain('-b:v');
    expect(args.slice(-2)).toEqual(['-y', 'out.mp4']);
  });

  it('drops the audio when asked, even when copying', () => {
    const args = buildVideoArgs('in.mp4', 'out.mp4', VIDEO_CODECS['mp4-h264'], info(), options({ keepAudio: false }));
    expect(args).toContain('-an');
    expect(args).not.toContain('-c:a');
  });

  it('re-encodes with a scaled bitrate below 100% quality', () => {
    const args = buildVideoArgs('in.mp4', 'out.mp4', VIDEO_CODECS['mp4-h264'], info(), options({ quality: 50 }));
    expect(valueAfter(args, '-c:v')).toBe('libx264');
    expect(valueAfter(args, '-s')).toBe('1920x1080');
    expect(valueAfter(args, '-pix_fmt')).toBe('yuv420p');
    expect(valueAfter(args, '-b:v')).toBe('4000k');
    expect(valueAfter(args, '-preset')).toBe('medium');
    expect(valueAfter(args, '-c:a')).toBe('aac');
    expect(valueAfter(args, '-b:a')).toBe('128k');
  });

  it('keeps the source audio bitrate at 100% quality', () => {
    const args = buildVideoArgs('in.mp4', 'out.webm', VIDEO_CODECS['webm-vp9'], info(), options());
    expect(valueAfter(args, '-b:a')).toBe('160k');
  });

  it('re-encodes when the size changes', () => {
    const args = buildVideoArgs('in.mp4', 'out.mp4', VIDEO_CODECS['mp4-h264'], info(), options({ resolution: '720' }));
    expect(valueAfter(args, '-c:v')).toBe('libx264');
    expect(valueAfter(args, '-s')).toBe('1280x720');
  });

  it('tags HEVC as hvc1 for Apple players', () => {
    const args = buildVideoArgs('in.mp4', 'out.mp4', VIDEO_CODECS['mp4-h265'], info(), options());
    expect(valueAfter(args, '-tag:v')).toBe('hvc1');
    expect(valueAfter(args, '-c:v')).toBe('libx265');
  });

  it('tone maps HDR sources instead of copying them', () => {
    const hdr = source({ colorPrimaries: 'bt2020', colorSpace: 'bt2020nc', colorTransfer: 'arib-std-b67' });
    const args = buildVideoArgs('in.mov', 'out.mp4', VIDEO_CODECS['mp4-h264'], info(hdr), options());
    expect(valueAfter(args, '-c:v')).toBe('libx264');
    expect(valueAfter(args, '-vf')).toBe('colorspace=all=bt709:iall=bt2020,format=yuv420p');
    expect(valueAfter(args, '-color_primaries')).toBe('bt709');
    expect(args).not.toContain('-pix_fmt');
  });

  it('maps the speed preset to cpu-used for VP9 and AV1', () => {
    const vp9 = buildVideoArgs('in.mp4', 'out.webm', VIDEO_CODECS['webm-vp9'], info(), options({ preset: 'faster' }));
    expect(valueAfter(vp9, '-cpu-used')).toBe('4');
    expect(vp9).not.toContain('-preset');
    expect(valueAfter(vp9, '-c:a')).toBe('libopus');

    const av1 = buildVideoArgs('in.mp4', 'out.webm', VIDEO_CODECS['webm-av1'], info(), options({ preset: 'slower' }));
    expect(valueAfter(av1, '-cpu-used')).toBe('4');
    expect(valueAfter(av1, '-row-mt')).toBe('1');
  });

  it('skips the audio encoder when the source has no audio', () => {
    const silent: MediaInfo = { duration: 10, bitrate: 8_000_000, video: source() };
    const args = buildVideoArgs('in.mp4', 'out.mp4', VIDEO_CODECS['mp4-h264'], silent, options({ quality: 80 }));
    expect(args).toContain('-an');
    expect(args).not.toContain('-c:a');
  });

  it('refuses files without a video stream', () => {
    expect(() => buildVideoArgs('in.mp3', 'out.mp4', VIDEO_CODECS['mp4-h264'], { duration: 1, bitrate: 1, audio: { codec: 'mp3', bitrate: 1, sampleRate: 44_100 } }, options())).toThrow();
  });
});

describe('ffmpeg input', () => {
  it('is only ever read as a local file', () => {
    const hdr = source({ colorPrimaries: 'bt2020', colorTransfer: 'smpte2084' });
    const runs = [
      buildVideoArgs('in.mp4', 'out.mp4', VIDEO_CODECS['mp4-h264'], info(), options()),
      buildVideoArgs('in.mp4', 'out.webm', VIDEO_CODECS['webm-vp9'], info(hdr), options({ quality: 50, trim: { start: 1, duration: 2 } })),
      buildVideoArgs('in.mp4', 'out.gif', VIDEO_CODECS.gif, info(), options({ trim: { start: 1, duration: 2 } })),
    ];
    for (const args of runs) {
      const input = args.indexOf('-i');
      expect(args.slice(input - 4, input)).toEqual(['-protocol_whitelist', 'file', '-format_whitelist', MEDIA_DEMUXERS]);
      expect(args.lastIndexOf('-i')).toBe(input);
    }
  });
});

describe('trimming and GIF output', () => {
  it('seeks before the input, limits the length and never copies the stream', () => {
    const args = buildVideoArgs('in.mp4', 'out.mp4', VIDEO_CODECS['mp4-h264'], info(), options({ trim: { start: 2.5, duration: 4 } }));
    expect(args.slice(0, 9)).toEqual(['-ss', '2.500', '-protocol_whitelist', 'file', '-format_whitelist', MEDIA_DEMUXERS, '-i', 'in.mp4', '-t']);
    expect(valueAfter(args, '-t')).toBe('4.000');
    expect(valueAfter(args, '-c:v')).toBe('libx264');
  });

  it('builds an animated GIF with its own palette, frame rate and size', () => {
    const args = buildVideoArgs('in.mp4', 'out.gif', VIDEO_CODECS.gif, info(), options({ resolution: '480', gifFrameRate: 10 }));
    expect(valueAfter(args, '-filter_complex')).toBe(
      'fps=10,scale=852:480:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[palette];[b][palette]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle'
    );
    expect(valueAfter(args, '-loop')).toBe('0');
    expect(args).toContain('-an');
    expect(valueAfter(args, '-f')).toBe('gif');
    expect(args).not.toContain('-b:v');
  });

  it('trims and tone maps GIFs too', () => {
    const hdr = source({ colorPrimaries: 'bt2020', colorTransfer: 'smpte2084' });
    const args = buildVideoArgs('in.mov', 'out.gif', VIDEO_CODECS.gif, info(hdr), options({ trim: { start: 1, duration: 3 } }));
    expect(args.slice(0, 2)).toEqual(['-ss', '1.000']);
    expect(valueAfter(args, '-filter_complex')).toMatch(/^colorspace=all=bt709:iall=bt2020,fps=15,/);
  });
});
