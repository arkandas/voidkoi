declare module 'libheif-js/wasm-bundle' {
  interface HeifImage {
    get_width(): number;
    get_height(): number;
    display(imageData: ImageData, callback: (result: ImageData | null) => void): void;
  }

  interface HeifDecoder {
    decode(data: Uint8Array): HeifImage[] | null;
  }

  const libheif: {
    HeifDecoder: new () => HeifDecoder;
  };

  export default libheif;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/csv' {
  const language: unknown;
  export default language;
}
