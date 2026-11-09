import { chmod, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  availableQualities,
  buildDownloadArgs,
  classifyYtDlpError,
  commonArgs,
  downloadMedia,
  fetchMediaInfo,
  isVideoQuality,
  parseMediaUrl,
  parseYtDlpProgress,
  resolvesPublicly,
  summarizeInfo,
  withCookies,
} from '@/modules/utilikit/lib/ytdlp'
import { mediaProxy } from '@/modules/utilikit/lib/media-proxy'

describe('parseMediaUrl', () => {
  it('accepts links to sites', () => {
    for (const url of [
      'https://www.youtube.com/watch?v=jNQXAC9IVRw',
      'https://x.com/user/status/1790637656616943991',
      'https://www.instagram.com/reel/Chunk8-jurw/',
      'http://vimeo.com/76979871',
      '  https://bsky.app/profile/bsky.app/post/3l3vgf77uco2g  ',
    ]) {
      expect(parseMediaUrl(url), url).not.toBeNull()
    }
  })

  it('rejects addresses on the local network and anything that is not a web link', () => {
    for (const url of [
      'http://192.168.1.1/video.mp4',
      'http://[::1]/x',
      'http://localhost:3000/',
      'http://nas.local/movie.mkv',
      'http://router.lan/',
      'http://intranet/',
      'https://user:pass@example.com/video',
      'ftp://example.com/video.mp4',
      'file:///etc/passwd',
      '--exec=touch /tmp/pwned',
      42,
    ]) {
      expect(parseMediaUrl(url), String(url)).toBeNull()
    }
  })
})

describe('resolvesPublicly', () => {
  it('refuses names that point at this machine', async () => {
    expect(await resolvesPublicly('http://localhost.localdomain/')).toBe(false)
    expect(await resolvesPublicly('http://no-such-host.invalid/')).toBe(false)
  })
})

describe('isVideoQuality', () => {
  it('only accepts the offered qualities', () => {
    expect(isVideoQuality('best')).toBe(true)
    expect(isVideoQuality('720')).toBe(true)
    expect(isVideoQuality('999')).toBe(false)
    expect(isVideoQuality(720)).toBe(false)
  })
})

describe('availableQualities', () => {
  it('offers the qualities close to the real sizes', () => {
    expect(availableQualities([720, 360, 270])).toEqual(['best', '720', '360'])
    expect(availableQualities([352, 264, 238])).toEqual(['best', '360'])
    expect(availableQualities([720, 472])).toEqual(['best', '720', '480'])
    expect(availableQualities([])).toEqual(['best', '2160', '1440', '1080', '720', '480', '360'])
  })
})

describe('commonArgs', () => {
  it('turns off the generic extractor so only known sites are fetched', () => {
    expect(commonArgs(null, null).join(' ')).toContain('--ies default,-generic')
  })

  it('uses Node for YouTube challenges on versions that support it', () => {
    expect(commonArgs('2026.08.19', null)).toContain('--js-runtimes')
    expect(commonArgs('2025.10.22', null)).not.toContain('--js-runtimes')
  })

  it('passes the cookies file', () => {
    const args = commonArgs(null, '/tmp/cookies.txt')
    expect(args[args.indexOf('--cookies') + 1]).toBe('/tmp/cookies.txt')
  })
})

describe('summarizeInfo', () => {
  const url = 'https://example.com/watch'

  it('describes a single video with its resolutions', () => {
    const summary = summarizeInfo(
      {
        title: 'Me at the zoo',
        uploader: 'jawed',
        duration: 19,
        webpage_url_domain: 'youtube.com',
        thumbnail: 'https://i.ytimg.com/vi/x/hq.jpg',
        formats: [
          { vcodec: 'none', acodec: 'opus' },
          { vcodec: 'avc1', width: 320, height: 240 },
          { vcodec: 'vp9', width: 192, height: 144 },
          { vcodec: 'avc1', width: 320, height: 240 },
        ],
      },
      url,
    )
    expect(summary).toEqual({
      url,
      site: 'youtube.com',
      title: 'Me at the zoo',
      thumbnail: 'https://i.ytimg.com/vi/x/hq.jpg',
      duration: 19,
      uploader: 'jawed',
      heights: [240, 144],
      audioOnly: false,
      items: [],
    })
  })

  it('measures portrait videos by their short side', () => {
    const summary = summarizeInfo({ title: 'Reel', formats: [{ vcodec: 'h264', width: 720, height: 1280 }] }, url)
    expect(summary.heights).toEqual([720])
  })

  it('recognizes audio-only sources', () => {
    const summary = summarizeInfo({ title: 'Track', extractor_key: 'Soundcloud', formats: [{ vcodec: 'none', acodec: 'mp3' }] }, url)
    expect(summary).toMatchObject({ audioOnly: true, heights: [], site: 'Soundcloud' })
  })

  it('lists the videos of a post with several', () => {
    const summary = summarizeInfo(
      {
        _type: 'playlist',
        title: 'Two clips',
        entries: [
          { title: 'First', duration: 5, thumbnails: [{ url: 'https://img/small.jpg' }, { url: 'https://img/large.jpg' }], formats: [{ vcodec: 'avc1', height: 720, width: 1280 }] },
          null,
          { title: 'Second', formats: [{ vcodec: 'avc1', height: 360, width: 640 }] },
        ],
      },
      url,
    )
    expect(summary.items).toEqual([
      { index: 1, title: 'First', thumbnail: 'https://img/large.jpg', duration: 5 },
      { index: 2, title: 'Second', thumbnail: undefined, duration: undefined },
    ])
    expect(summary.heights).toEqual([720, 360])
    expect(summary.thumbnail).toBe('https://img/large.jpg')
  })

  it('ignores thumbnails that are not web links', () => {
    expect(summarizeInfo({ title: 'x', thumbnail: 'javascript:alert(1)' }, url).thumbnail).toBeUndefined()
  })

  it('refuses live streams', () => {
    expect(() => summarizeInfo({ title: 'Live', is_live: true }, url)).toThrow(expect.objectContaining({ code: 'liveNotSupported' }))
    expect(() => summarizeInfo({ title: 'Soon', live_status: 'is_upcoming' }, url)).toThrow(expect.objectContaining({ code: 'liveNotSupported' }))
  })
})

describe('classifyYtDlpError', () => {
  it('maps yt-dlp messages to error codes', () => {
    const cases: Array<[string, string]> = [
      ['Unsupported URL: https://example.com/', 'unsupportedUrl'],
      ['No suitable extractor found for URL http://x.test', 'unsupportedUrl'],
      ['[vimeo] 76979871: The web client only works when logged-in. Use --cookies', 'loginRequired'],
      ['[youtube] x: Sign in to confirm your age', 'loginRequired'],
      ['[youtube] x: Private video. Sign in if you have been granted access', 'mediaUnavailable'],
      ['[youtube] x: Video unavailable', 'mediaUnavailable'],
      ['[youtube] aaaaaaaaaaa: This video is unavailable', 'mediaUnavailable'],
      ['[twitter] 1: HTTP Error 404: Not Found', 'mediaUnavailable'],
      ['[TikTok] 1: Your IP address is blocked from accessing this post', 'mediaBlocked'],
      ['[youtube] x: The uploader has not made this video available in your country', 'mediaBlocked'],
      ['[download] Live does not pass filter (!is_live), skipping ..', 'liveNotSupported'],
      ['[download] File is larger than max-filesize (5 bytes > 4 bytes). Aborting.', 'fileTooLarge'],
      ['Requested format is not available', 'noDownloadableFormat'],
      ['Something else broke', 'downloadFailed'],
    ]
    for (const [message, code] of cases) expect(classifyYtDlpError(message), message).toBe(code)
    expect(classifyYtDlpError('Something else broke', 'fetchFailed')).toBe('fetchFailed')
  })
})

describe('buildDownloadArgs', () => {
  const base = { url: 'https://x.com/a/status/1', audioOnly: false, audioFormat: 'mp3' as const, quality: 'best' as const, outputTemplate: '/tmp/d.%(ext)s' }
  const valueAfter = (args: string[], flag: string) => args[args.indexOf(flag) + 1]

  it('prefers the highest resolution, then H.264, and merges into MP4', () => {
    const args = buildDownloadArgs(base, '2026.08.19', null)
    expect(valueAfter(args, '-f')).toBe("bv*[protocol!~='rtmp|rtsp|mms|websocket']+ba[protocol!~='rtmp|rtsp|mms|websocket']/b[protocol!~='rtmp|rtsp|mms|websocket']")
    expect(valueAfter(args, '-S')).toBe('res,fps,vcodec:h264,acodec:aac')
    expect(valueAfter(args, '--merge-output-format')).toBe('mp4')
    expect(args.slice(-2)).toEqual(['--', 'https://x.com/a/status/1'])
  })

  it('caps the resolution when asked', () => {
    expect(valueAfter(buildDownloadArgs({ ...base, quality: '720' }, null, null), '-S')).toBe('res:720,fps,vcodec:h264,acodec:aac')
  })

  it('extracts audio in the chosen format', () => {
    const args = buildDownloadArgs({ ...base, audioOnly: true, audioFormat: 'opus' }, null, null)
    expect(valueAfter(args, '-f')).toBe("ba[protocol!~='rtmp|rtsp|mms|websocket']/b[protocol!~='rtmp|rtsp|mms|websocket']")
    expect(valueAfter(args, '--audio-format')).toBe('opus')
    expect(args).toContain('-x')
  })

  it('picks one item of a post and never downloads live streams or huge files', () => {
    const args = buildDownloadArgs({ ...base, item: 3 }, null, null)
    expect(valueAfter(args, '-I')).toBe('3')
    expect(valueAfter(args, '--match-filter')).toBe('!is_live')
    expect(valueAfter(args, '--max-filesize')).toBe('4G')
    expect(valueAfter(buildDownloadArgs(base, null, null), '-I')).toBe('1')
  })
})

describe('parseYtDlpProgress', () => {
  it('reads the percentage of download lines', () => {
    expect(parseYtDlpProgress('[download]  42.3% of 10.00MiB at 1.00MiB/s')).toBe(42.3)
    expect(parseYtDlpProgress('[Merger] Merging formats')).toBeNull()
  })
})

describe.skipIf(process.platform === 'win32')('running yt-dlp', () => {
  let dir: string
  let originalPath: string | undefined

  const fakeYtDlp = async (script: string) => {
    await writeFile(path.join(dir, 'yt-dlp'), `#!/bin/sh\nif [ "$1" = "--version" ]; then echo 2026.08.19; exit 0; fi\n${script}\n`)
    await chmod(path.join(dir, 'yt-dlp'), 0o755)
  }

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'utilikit-ytdlp-'))
    originalPath = process.env.PATH
    process.env.PATH = `${dir}${path.delimiter}${originalPath}`
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  afterAll(async () => {
    process.env.PATH = originalPath
    await rm(dir, { recursive: true, force: true })
  })

  const options = { url: 'https://youtu.be/x', audioOnly: false, audioFormat: 'mp3' as const, quality: 'best' as const, outputTemplate: '/tmp/x.%(ext)s' }

  it('collects the title, the final path and the progress, even across split chunks', async () => {
    await fakeYtDlp(
      [
        `printf 'TITLE:Me at the zoo\\n[download]  12.5%% of 1MiB\\n[downl'`,
        'sleep 0.05',
        `printf 'oad]  80.0%% of 1MiB\\nFILE:/tmp/utilikit/download-1.mp4'`,
      ].join('\n'),
    )

    const progress: number[] = []
    const result = await downloadMedia(options, percent => progress.push(percent))

    expect(result).toEqual({ title: 'Me at the zoo', filepath: '/tmp/utilikit/download-1.mp4' })
    expect(progress).toEqual([12.5, 80])
  })

  it('names the reason when yt-dlp fails, and keeps its words for the log', async () => {
    await fakeYtDlp(`echo 'WARNING: something' >&2\necho 'ERROR: [youtube] x: Video unavailable' >&2\nexit 1`)
    const error = await downloadMedia(options).catch(caught => caught)
    expect(error).toMatchObject({ code: 'mediaUnavailable', detail: 'yt-dlp exited with code 1' })
    expect(error.message).toContain('[youtube] x: Video unavailable')
  })

  it('sends every connection through the media proxy', async () => {
    const record = path.join(dir, 'args.txt')
    const log = `printf '%s\\n' "$@" > '${record}'\necho "no_proxy=$NO_PROXY$no_proxy" >> '${record}'`
    vi.stubEnv('NO_PROXY', '*')
    vi.stubEnv('no_proxy', '*')
    const { url } = await mediaProxy()

    await fakeYtDlp(`${log}\necho '{"title": "Clip", "formats": []}'`)
    await fetchMediaInfo('https://x.com/a/status/1')
    const info = (await readFile(record, 'utf8')).split('\n')
    expect(info.slice(0, 2)).toEqual(['--proxy', url])
    expect(info).toContain('no_proxy=')

    await fakeYtDlp(`${log}\necho 'FILE:/tmp/x.mp4'`)
    await downloadMedia(options)
    const download = (await readFile(record, 'utf8')).split('\n')
    expect(download.slice(0, 2)).toEqual(['--proxy', url])
    expect(download).toContain('no_proxy=')
  })

  it('reports a live stream skipped by the filter', async () => {
    await fakeYtDlp(`echo '[download] Live show does not pass filter (!is_live), skipping ..'\nexit 0`)
    await expect(downloadMedia(options)).rejects.toMatchObject({ code: 'liveNotSupported' })
  })

  it('fails when it exits without a file', async () => {
    await fakeYtDlp('exit 0')
    await expect(downloadMedia(options)).rejects.toMatchObject({ code: 'downloadFailed' })
  })

  it('reads the video information', async () => {
    await fakeYtDlp(`echo '{"title": "Clip", "webpage_url_domain": "x.com", "formats": [{"vcodec": "avc1", "width": 1280, "height": 720}]}'`)
    expect(await fetchMediaInfo('https://x.com/a/status/1')).toMatchObject({ title: 'Clip', site: 'x.com', heights: [720] })
  })

  it('reports why the information could not be read', async () => {
    await fakeYtDlp(`echo 'ERROR: [vimeo] 1: The web client only works when logged-in' >&2\nexit 1`)
    await expect(fetchMediaInfo('https://vimeo.com/1')).rejects.toMatchObject({ code: 'loginRequired' })
  })

  it('passes a private copy of the cookies file and removes it afterwards', async () => {
    const cookies = path.join(dir, 'cookies.txt')
    await writeFile(cookies, '# Netscape HTTP Cookie File\n')
    vi.stubEnv('VOIDKOI_YTDLP_COOKIES', cookies)

    let used = ''
    await withCookies(async copy => {
      used = copy ?? ''
      expect(await readFile(used, 'utf8')).toContain('Netscape')
    })

    expect(used).not.toBe(cookies)
    await expect(readFile(used)).rejects.toThrow()
  })

  it('carries on without cookies when the file cannot be read', async () => {
    vi.stubEnv('VOIDKOI_YTDLP_COOKIES', path.join(dir, 'missing.txt'))
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await withCookies(async copy => copy)).toBeNull()
    errors.mockRestore()
  })
})
