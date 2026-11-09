export const VIDEO_QUALITIES = ['best', '2160', '1440', '1080', '720', '480', '360'] as const
export type VideoQuality = (typeof VIDEO_QUALITIES)[number]

export const MAX_ITEMS = 50

export interface MediaItem {
  index: number
  title: string
  thumbnail?: string
  duration?: number
}

export interface MediaSummary {
  url: string
  site: string
  title: string
  thumbnail?: string
  duration?: number
  uploader?: string
  heights: number[]
  audioOnly: boolean
  items: MediaItem[]
}

export function availableQualities(heights: number[]): VideoQuality[] {
  return VIDEO_QUALITIES.filter(
    quality => quality === 'best' || heights.length === 0 || heights.some(height => Math.abs(height - Number(quality)) <= Number(quality) * 0.12),
  )
}

export function isVideoQuality(value: unknown): value is VideoQuality {
  return typeof value === 'string' && (VIDEO_QUALITIES as readonly string[]).includes(value)
}
