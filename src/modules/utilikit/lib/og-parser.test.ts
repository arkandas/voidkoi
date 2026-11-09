import { describe, expect, it } from 'vitest';
import { decodeEntities, parseOpenGraph } from '@/modules/utilikit/lib/og-parser';

describe('parseOpenGraph', () => {
  it('reads Open Graph and Twitter Card tags', () => {
    const html = `
      <html><head>
        <meta property="og:title" content="Utilikit">
        <meta property="og:description" content="A toolbox">
        <meta property="og:image" content="https://example.com/cover.png">
        <meta property="og:url" content="https://example.com/">
        <meta property="og:type" content="website">
        <meta property="og:site_name" content="Example">
        <meta property="og:locale" content="es_ES">
        <meta name="twitter:card" content="summary_large_image">
        <meta name="twitter:site" content="@example">
        <meta name="twitter:creator" content="@author">
      </head></html>`;

    expect(parseOpenGraph(html)).toEqual({
      title: 'Utilikit',
      description: 'A toolbox',
      image: 'https://example.com/cover.png',
      url: 'https://example.com/',
      type: 'website',
      siteName: 'Example',
      locale: 'es_ES',
      twitterCard: 'summary_large_image',
      twitterSite: '@example',
      twitterCreator: '@author',
    });
  });

  it('accepts any attribute order, single quotes and upper case', () => {
    const html = `<META content='Reversed' PROPERTY='og:title'><meta content="x" name='DESCRIPTION'>`;
    expect(parseOpenGraph(html)).toMatchObject({ title: 'Reversed', description: 'x' });
  });

  it('keeps apostrophes inside double-quoted values', () => {
    expect(parseOpenGraph(`<meta property="og:title" content="It's here">`).title).toBe("It's here");
  });

  it('decodes HTML entities', () => {
    expect(parseOpenGraph(`<meta property="og:title" content="Tom &amp; Jerry &#8212; &quot;live&quot; &#x1F600;">`).title).toBe(
      'Tom & Jerry — "live" 😀',
    );
  });

  it('falls back to the title, the description meta tag and the Twitter image', () => {
    const html = `<title> Plain &amp; simple </title><meta name="description" content="Fallback"><meta name="twitter:image" content="/img.png">`;
    expect(parseOpenGraph(html)).toMatchObject({ title: 'Plain & simple', description: 'Fallback', image: '/img.png' });
  });

  it('prefers the first occurrence of a tag', () => {
    const html = `<meta property="og:title" content="First"><meta property="og:title" content="Second">`;
    expect(parseOpenGraph(html).title).toBe('First');
  });

  it('returns empty fields for a page without metadata', () => {
    expect(Object.values(parseOpenGraph('<p>nothing</p>')).every(value => value === undefined)).toBe(true);
  });
});

describe('decodeEntities', () => {
  it('leaves unknown or invalid entities untouched', () => {
    expect(decodeEntities('&unknown; &#0; &#x110000;')).toBe('&unknown; &#0; &#x110000;');
  });
});
