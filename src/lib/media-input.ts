/**
 * The only demuxers ffmpeg may use on a file someone sent: plain video and
 * audio containers. A playlist or a concat list dressed up as a video could
 * make it read other files on the server.
 */
export const MEDIA_DEMUXERS = 'mov,matroska,avi,mpegts,ogg,flv,mpeg,asf,mp3,wav,flac,aac,aiff,ape,caf,amr,wv,gif'

/** ffmpeg's or ffprobe's arguments for reading one local file someone sent, and nothing it names. */
export function mediaInput(file: string): string[] {
  return ['-protocol_whitelist', 'file', '-format_whitelist', MEDIA_DEMUXERS, '-i', file]
}
