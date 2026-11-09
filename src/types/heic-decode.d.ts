declare module 'heic-decode' {
  interface DecodedImage {
    width: number;
    height: number;
    /** RGBA, four bytes a pixel. */
    data: Uint8ClampedArray;
  }
  /** A picture in the file, measured but not decoded yet. */
  interface LazyImage {
    width: number;
    height: number;
    decode(): Promise<DecodedImage>;
  }
  /** The first picture in a HEIC or HEIF file. */
  function decode(input: { buffer: Uint8Array | ArrayBuffer }): Promise<DecodedImage>;
  namespace decode {
    /** Every picture in the file, sized before any is decoded. Call `dispose` when done. */
    function all(input: { buffer: Uint8Array | ArrayBuffer }): Promise<LazyImage[] & { dispose(): void }>;
  }
  export = decode;
}
