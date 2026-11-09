import { describe, expect, it } from 'vitest';
import { encodeIco, headSnippet, iconLayout, webManifest, wrapSvg } from '@/modules/utilikit/lib/favicon';

describe('encodeIco', () => {
  it('writes the directory followed by the PNG images', () => {
    const images = [
      { size: 16, data: new Uint8Array([1, 2, 3]) },
      { size: 32, data: new Uint8Array([4, 5]) },
      { size: 256, data: new Uint8Array([6]) },
    ];
    const ico = encodeIco(images);
    const view = new DataView(ico.buffer);

    expect([view.getUint16(0, true), view.getUint16(2, true), view.getUint16(4, true)]).toEqual([0, 1, 3]);
    expect(ico.length).toBe(6 + 3 * 16 + 6);

    const entry = (index: number) => {
      const at = 6 + index * 16;
      return {
        width: view.getUint8(at),
        height: view.getUint8(at + 1),
        planes: view.getUint16(at + 4, true),
        bits: view.getUint16(at + 6, true),
        length: view.getUint32(at + 8, true),
        offset: view.getUint32(at + 12, true),
      };
    };

    expect(entry(0)).toEqual({ width: 16, height: 16, planes: 1, bits: 32, length: 3, offset: 54 });
    expect(entry(1)).toEqual({ width: 32, height: 32, planes: 1, bits: 32, length: 2, offset: 57 });
    expect(entry(2)).toMatchObject({ width: 0, height: 0, offset: 59 });
    expect([...ico.slice(54)]).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('webManifest', () => {
  it('lists the Android icons and the colors', () => {
    const manifest = JSON.parse(webManifest({ name: 'My App', shortName: '', themeColor: '#2563eb', backgroundColor: '#ffffff' }));
    expect(manifest).toMatchObject({ name: 'My App', short_name: 'My App', theme_color: '#2563eb', display: 'standalone' });
    expect(manifest.icons.map((icon: { sizes: string }) => icon.sizes)).toEqual(['192x192', '512x512']);
  });
});

describe('headSnippet', () => {
  it('only links the SVG icon when there is one', () => {
    expect(headSnippet({ svg: false, themeColor: '#000000' })).not.toContain('favicon.svg');
    expect(headSnippet({ svg: true, themeColor: '#000000' })).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml">');
    expect(headSnippet({ svg: true, themeColor: '#123456' })).toContain('<meta name="theme-color" content="#123456">');
  });
});

describe('iconLayout', () => {
  it('fits the image inside the padding without distorting it', () => {
    expect(iconLayout(100, 200, 100, 0.1)).toEqual({ x: 10, y: 30, width: 80, height: 40 });
    expect(iconLayout(100, 50, 100, 0)).toEqual({ x: 25, y: 0, width: 50, height: 100 });
  });
});

describe('wrapSvg', () => {
  it('adds the background and the padding around the original drawing', () => {
    const svg = wrapSvg('<circle cx="12" cy="12" r="10"/>', { x: 0, y: 0, width: 24, height: 24 }, { background: '#ff0000', padding: 0.25, radius: 0.5 });
    expect(svg).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="256" fill="#ff0000"/><svg x="128" y="128" width="256" height="256" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg></svg>'
    );
    expect(wrapSvg('<g/>', { x: 0, y: 0, width: 1, height: 1 }, { background: null, padding: 0, radius: 0 })).not.toContain('<rect');
  });
});
