import { describe, expect, it } from 'vitest';

import { MEDIA_DEMUXERS } from '@/lib/media-input';
import {
  AUDIO_FORMATS,
  buildAudioArgs,
  buildExtractArgs,
  buildLoudnessProbeArgs,
  clampBitrate,
  EXTRACT_FORMATS,
  isExtractFormat,
  loudnormFilter,
  parseLoudness,
} from '@/modules/utilikit/lib/audio-convert';

describe('buildAudioArgs', () => {
  it('drops the video and sets the bitrate for lossy formats', () => {
    expect(buildAudioArgs('in.mp4', 'out.mp3', AUDIO_FORMATS.mp3, { bitrate: 192 })).toEqual([
      '-protocol_whitelist', 'file', '-format_whitelist', MEDIA_DEMUXERS, '-i', 'in.mp4', '-vn', '-c:a', 'libmp3lame', '-b:a', '192k', '-y', 'out.mp3',
    ]);
  });

  it('omits the bitrate for lossless formats', () => {
    for (const format of [AUDIO_FORMATS.flac, AUDIO_FORMATS.wav]) {
      expect(buildAudioArgs('in.wav', 'out', format, { bitrate: 320 })).not.toContain('-b:a');
    }
  });

  it('uses the matching container extension for each codec', () => {
    expect(AUDIO_FORMATS.aac.extension).toBe('m4a');
    expect(AUDIO_FORMATS.vorbis.extension).toBe('ogg');
    expect(AUDIO_FORMATS.opus.codec).toBe('libopus');
  });
});

describe('ffmpeg inputs', () => {
  it('only ever read the input as a local file', () => {
    const measurement = { input_i: '-20', input_tp: '-2', input_lra: '5', input_thresh: '-30', target_offset: '0' };
    const runs = [
      buildAudioArgs('in.wav', 'out.mp3', AUDIO_FORMATS.mp3, { bitrate: 128, trim: { start: 1, duration: 2 }, loudness: measurement }),
      buildLoudnessProbeArgs('in.wav', { start: 1, duration: 2 }),
      ...EXTRACT_FORMATS.map(format => buildExtractArgs('in.mp4', `out.${format}`, format)),
    ];
    for (const args of runs) {
      const input = args.indexOf('-i');
      expect(input).toBeGreaterThan(1);
      expect(args.slice(input - 4, input)).toEqual(['-protocol_whitelist', 'file', '-format_whitelist', MEDIA_DEMUXERS]);
      expect(args.lastIndexOf('-i')).toBe(input);
    }
  });
});

describe('clampBitrate', () => {
  it('keeps sensible values and rounds them', () => {
    expect(clampBitrate(128)).toBe(128);
    expect(clampBitrate(127.6)).toBe(128);
  });

  it('clamps to 32–512 kbps', () => {
    expect(clampBitrate(8)).toBe(32);
    expect(clampBitrate(-50)).toBe(32);
    expect(clampBitrate(2000)).toBe(512);
  });

  it('falls back to 192 kbps for missing values', () => {
    expect(clampBitrate(0)).toBe(192);
    expect(clampBitrate(NaN)).toBe(192);
  });
});

describe('buildExtractArgs', () => {
  it('has settings for every extract format', () => {
    for (const format of EXTRACT_FORMATS) {
      const args = buildExtractArgs('in.mp4', `out.${format}`, format);
      expect(args.slice(0, 7)).toEqual(['-protocol_whitelist', 'file', '-format_whitelist', MEDIA_DEMUXERS, '-i', 'in.mp4', '-vn']);
      expect(args).toContain('-codec:a');
      expect(args.slice(-2)).toEqual(['-y', `out.${format}`]);
    }
  });

  it('recognises extract formats', () => {
    expect(isExtractFormat('mp3')).toBe(true);
    expect(isExtractFormat('flac')).toBe(false);
    expect(isExtractFormat(undefined)).toBe(false);
  });
});

const MEASUREMENT = {
  input_i: '-27.61',
  input_tp: '-4.47',
  input_lra: '18.06',
  input_thresh: '-39.20',
  target_offset: '0.58',
};

const LOUDNORM_OUTPUT = `[Parsed_loudnorm_0 @ 0x7f8] 
{
	"input_i" : "-27.61",
	"input_tp" : "-4.47",
	"input_lra" : "18.06",
	"input_thresh" : "-39.20",
	"output_i" : "-16.58",
	"output_tp" : "-1.50",
	"output_lra" : "14.78",
	"output_thresh" : "-27.71",
	"normalization_type" : "dynamic",
	"target_offset" : "0.58"
}
`;

describe('loudness normalization', () => {
  it('reads the measurement printed by the first pass', () => {
    expect(parseLoudness(`size=N/A time=00:01:00.00\n${LOUDNORM_OUTPUT}`)).toEqual(MEASUREMENT);
    expect(parseLoudness('no json here')).toBeNull();
    expect(parseLoudness('{"input_i": "-inf"}')).toBeNull();
  });

  it('measures first, then applies a linear correction with the measured values', () => {
    expect(loudnormFilter()).toBe('loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json');
    expect(loudnormFilter(MEASUREMENT)).toBe(
      'loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=-27.61:measured_TP=-4.47:measured_LRA=18.06:measured_thresh=-39.20:offset=0.58:linear=true'
    );
  });

  it('measures only the trimmed part', () => {
    expect(buildLoudnessProbeArgs('in.wav', { start: 5, duration: 10 })).toEqual([
      '-ss', '5.000', '-protocol_whitelist', 'file', '-format_whitelist', MEDIA_DEMUXERS, '-i', 'in.wav', '-t', '10.000', '-vn', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-',
    ]);
  });

  it('keeps the source sample rate, except for Opus', () => {
    const options = { bitrate: 192, loudness: MEASUREMENT, sampleRate: 44100 };
    const valueAfter = (args: string[], flag: string) => args[args.indexOf(flag) + 1];
    expect(valueAfter(buildAudioArgs('in.wav', 'out.mp3', AUDIO_FORMATS.mp3, options), '-ar')).toBe('44100');
    expect(valueAfter(buildAudioArgs('in.wav', 'out.opus', AUDIO_FORMATS.opus, options), '-ar')).toBe('48000');
    expect(valueAfter(buildAudioArgs('in.wav', 'out.flac', AUDIO_FORMATS.flac, { ...options, sampleRate: 0 }), '-ar')).toBe('48000');
  });

  it('trims without normalizing', () => {
    expect(buildAudioArgs('in.mp3', 'out.mp3', AUDIO_FORMATS.mp3, { bitrate: 128, trim: { start: 60, duration: 30 } })).toEqual([
      '-ss', '60.000', '-protocol_whitelist', 'file', '-format_whitelist', MEDIA_DEMUXERS, '-i', 'in.mp3', '-t', '30.000', '-vn', '-c:a', 'libmp3lame', '-b:a', '128k', '-y', 'out.mp3',
    ]);
  });
});
