import { encode } from 'uqr'

/** The white margin around a code, in modules: what the standard asks for, so phones read it at once. */
export const QUIET_ZONE = 4

export interface QrCode {
  /** Modules per side, the margin included. */
  size: number
  /** The dark modules as one SVG path, a module to a unit: a rectangle for each run along a row. */
  path: string
}

/** A QR code for `text`, with medium error correction: still read when a little of it is smudged or cut. */
export function qrCode(text: string): QrCode {
  const { data } = encode(text, { ecc: 'M', border: QUIET_ZONE })
  let path = ''
  data.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (!row[x]) continue
      const start = x
      while (row[x + 1]) x++
      path += `M${start} ${y}h${x - start + 1}v1h${start - x - 1}z`
    }
  })
  return { size: data.length, path }
}
