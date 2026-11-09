import { spawnSync } from 'child_process'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AUDIO_FORMATS, buildAudioArgs, buildLoudnessProbeArgs, parseLoudness } from '@/modules/utilikit/lib/audio-convert'
import { probeMedia, runFfmpeg } from '@/modules/utilikit/lib/ffmpeg'
import { buildVideoArgs, VIDEO_CODECS } from '@/modules/utilikit/lib/video-convert'

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0

describe.skipIf(!hasFfmpeg)('trimming, loudness and GIF with ffmpeg', () => {
  let dir = ''
  let quiet = ''
  let clip = ''

  const ffmpeg = (args: string[]) => {
    const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args])
    if (result.status !== 0) throw new Error(result.stderr.toString())
  }

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'utilikit-media-edit-'))
    quiet = path.join(dir, 'quiet.wav')
    clip = path.join(dir, 'clip.mp4')
    ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=6:sample_rate=44100', '-af', 'volume=0.03', '-y', quiet])
    ffmpeg(['-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=25:duration=3', '-c:v', 'mpeg4', '-y', clip])
  })

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('keeps only the trimmed part of the audio', async () => {
    const output = path.join(dir, 'trimmed.flac')
    await runFfmpeg(buildAudioArgs(quiet, output, AUDIO_FORMATS.flac, { bitrate: 0, trim: { start: 1, duration: 2.5 } }))
    expect((await probeMedia(output)).duration).toBeCloseTo(2.5, 1)
  })

  it('levels quiet audio to the target loudness in two passes', async () => {
    const measurement = parseLoudness(await runFfmpeg(buildLoudnessProbeArgs(quiet)))
    expect(measurement).not.toBeNull()
    expect(Number(measurement!.input_i)).toBeLessThan(-25)

    const output = path.join(dir, 'leveled.wav')
    await runFfmpeg(buildAudioArgs(quiet, output, AUDIO_FORMATS.wav, { bitrate: 0, loudness: measurement, sampleRate: 44100 }))

    const after = parseLoudness(await runFfmpeg(buildLoudnessProbeArgs(output)))
    expect(Number(after!.input_i)).toBeCloseTo(-16, 0)
    expect((await probeMedia(output)).audio?.sampleRate).toBe(44100)
  })

  it('turns part of a video into an animated GIF', async () => {
    const output = path.join(dir, 'clip.gif')
    const info = await probeMedia(clip)
    await runFfmpeg(
      buildVideoArgs(clip, output, VIDEO_CODECS.gif, info, {
        quality: 100,
        resolution: 'original',
        preset: 'medium',
        keepAudio: false,
        trim: { start: 0.5, duration: 1 },
        gifFrameRate: 10,
      }),
    )

    const probed = await probeMedia(output)
    expect(probed.video).toMatchObject({ codec: 'gif', width: 320, height: 240 })
    expect(probed.duration).toBeCloseTo(1, 0)
  })
})
