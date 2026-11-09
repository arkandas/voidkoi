import { describe, expect, it, vi } from 'vitest'
import { readProbe, startStream, streamArgs, streamType, type MediaInfo } from './playback'

// ffmpeg stands in as a process that runs until it is killed.
vi.mock('node:child_process', async () => {
  const { EventEmitter } = await import('node:events')
  const { PassThrough } = await import('node:stream')
  return {
    spawn: () => {
      const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), kill: () => child.emit('close', null) })
      return child
    },
  }
})

const after = (args: string[], flag: string) => args[args.indexOf(flag) + 1]

describe('readProbe', () => {
  it('takes the video, the audio and the tags', () => {
    const info = readProbe({
      streams: [
        { index: 0, codec_type: 'video', codec_name: 'hevc', width: 3840, height: 2160, pix_fmt: 'yuv420p10le', profile: 'Main 10', level: 153 },
        { index: 1, codec_type: 'audio', codec_name: 'ac3' },
        { index: 2, codec_type: 'subtitle', codec_name: 'subrip' },
      ],
      format: { duration: '5400.5', tags: { TITLE: 'A Film', ARTIST: 'Someone' } },
    })
    expect(info).toEqual({
      duration: 5400.5,
      video: { index: 0, codec: 'hevc', width: 3840, height: 2160, pixFmt: 'yuv420p10le', profile: 'Main 10', level: 153 },
      audio: { index: 1, codec: 'ac3', profile: null },
      title: 'A Film',
      artist: 'Someone',
      album: null,
    })
  })

  it('does not take album art for a video', () => {
    const info = readProbe({
      streams: [
        { index: 0, codec_type: 'audio', codec_name: 'mp3' },
        { index: 1, codec_type: 'video', codec_name: 'mjpeg', disposition: { attached_pic: 1 } },
      ],
      format: { duration: '201', tags: { title: 'Song', album_artist: 'Band', album: 'Record' } },
    })
    expect(info.video).toBeNull()
    expect(info.audio).toEqual({ index: 0, codec: 'mp3', profile: null })
    expect(info).toMatchObject({ title: 'Song', artist: 'Band', album: 'Record' })
  })

  it('gives the size as shown for a video turned on its side', () => {
    const turned = (data: object) =>
      readProbe({ streams: [{ index: 0, codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080, ...data }] }).video
    expect(turned({ side_data_list: [{ side_data_type: 'Display Matrix', rotation: -90 }] })).toMatchObject({ width: 1080, height: 1920 })
    expect(turned({ tags: { rotate: '270' } })).toMatchObject({ width: 1080, height: 1920 })
    expect(turned({ side_data_list: [{ rotation: 180 }] })).toMatchObject({ width: 1920, height: 1080 })
  })

  it('has no length when the file gives none', () => {
    expect(readProbe({ streams: [], format: { duration: 'N/A' } }).duration).toBeNull()
  })
})

const video = (codec: string, pixFmt = 'yuv420p', profile: string | null = 'High'): MediaInfo => ({
  duration: 60,
  video: { index: 0, codec, width: 1920, height: 1080, pixFmt, profile, level: 40 },
  audio: { index: 1, codec: 'aac', profile: 'LC' },
  title: null,
  artist: null,
  album: null,
})

describe('streamArgs', () => {
  it('copies H.264 and AAC into fragmented MP4', () => {
    const args = streamArgs(video('h264'), '/f/x', 0)
    expect(after(args, '-c:v')).toBe('copy')
    expect(after(args, '-c:a')).toBe('copy')
    expect(after(args, '-f')).toBe('mp4')
    expect(after(args, '-movflags')).toContain('frag_keyframe')
    expect(args).not.toContain('-ss')
  })

  it('converts other video to H.264, and other audio to AAC', () => {
    const info = { ...video('hevc', 'yuv420p10le'), audio: { index: 1, codec: 'ac3', profile: null } }
    const args = streamArgs(info, '/f/x', 0)
    expect(after(args, '-c:v')).toBe('libx264')
    expect(after(args, '-pix_fmt')).toBe('yuv420p')
    expect(after(args, '-c:a')).toBe('aac')
    expect(after(args, '-ac')).toBe('2')
  })

  it('converts 10-bit H.264, which browsers do not play', () => {
    expect(after(streamArgs(video('h264', 'yuv420p10le'), '/f/x', 0), '-c:v')).toBe('libx264')
  })

  it('starts where asked, before opening the file', () => {
    const args = streamArgs(video('h264'), '/f/x', 90.5)
    expect(after(args, '-ss')).toBe('90.500')
    expect(args.indexOf('-ss')).toBeLessThan(args.indexOf('-i'))
  })

  it('makes MP3 from audio, copying MP3 as it is', () => {
    const audio = (codec: string): MediaInfo => ({ ...video('h264'), video: null, audio: { index: 0, codec, profile: null } })
    const flac = streamArgs(audio('flac'), '/f/x', 0)
    expect(after(flac, '-c:a')).toBe('libmp3lame')
    expect(after(flac, '-f')).toBe('mp3')
    expect(after(streamArgs(audio('mp3'), '/f/x', 0), '-c:a')).toBe('copy')
  })

  it('converts H.264 profiles browsers may not play', () => {
    expect(after(streamArgs(video('h264', 'yuv420p', 'High 4:4:4 Predictive'), '/f/x', 0), '-c:v')).toBe('libx264')
    expect(after(streamArgs(video('h264', 'yuv420p', 'Main'), '/f/x', 0), '-c:v')).toBe('copy')
  })

  it('only opens plain media files', () => {
    const args = streamArgs(video('h264'), '/f/x', 0)
    expect(after(args, '-protocol_whitelist')).toBe('file')
    expect(after(args, '-format_whitelist')).not.toMatch(/concat|hls|image2/)
  })
})

describe('streamType', () => {
  it('names the copied profile and level', () => {
    expect(streamType(video('h264'))).toBe('video/mp4; codecs="avc1.640028,mp4a.40.2"')
    expect(streamType({ ...video('h264', 'yuv420p', 'Constrained Baseline'), audio: null })).toBe('video/mp4; codecs="avc1.42e028"')
  })

  it('names converted video, and HE-AAC as it is', () => {
    const info = { ...video('hevc', 'yuv420p10le'), audio: { index: 1, codec: 'aac', profile: 'HE-AAC' } }
    expect(streamType(info)).toBe('video/mp4; codecs="avc1.64002a,mp4a.40.5"')
  })

  it('is MP3 for audio', () => {
    expect(streamType({ ...video('h264'), video: null })).toBe('audio/mpeg')
  })
})

describe('startStream', () => {
  it('keeps a stream for people signed in when links want them all', () => {
    const viewers = Array.from({ length: 4 }, () => new AbortController())
    const start = (viaLink: boolean, viewer: AbortController) => startStream('/f/x', video('h264'), 0, viewer.signal, viaLink)

    expect(start(true, viewers[0]!)).not.toBe('busy')
    expect(start(true, viewers[1]!)).not.toBe('busy')
    expect(start(true, viewers[2]!)).toBe('busy')
    expect(start(false, viewers[2]!)).not.toBe('busy')
    expect(start(false, viewers[3]!)).toBe('busy')

    // A link's viewer leaves: its stream ends, and another link may start one.
    viewers[0]!.abort()
    expect(start(true, viewers[3]!)).not.toBe('busy')
    for (const viewer of viewers) viewer.abort()
  })
})
