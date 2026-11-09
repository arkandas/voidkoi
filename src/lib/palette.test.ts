/**
 * Every colour comes from a token in `app/globals.css`. This test reads both
 * themes and checks that each pair the interface puts together clears WCAG
 * 2.1: 4.5:1 for text, 3:1 for icons and indicators.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

type Rgb = [number, number, number];

const CSS = readFileSync(fileURLToPath(new URL('../app/globals.css', import.meta.url)), 'utf8');

function block(selector: string): string {
  const start = CSS.indexOf(`\n${selector} {`);
  if (start === -1) throw new Error(`no "${selector}" block in globals.css`);
  const open = CSS.indexOf('{', start);
  return CSS.slice(open + 1, CSS.indexOf('}', open));
}

function tokensIn(body: string): Record<string, Rgb> {
  const out: Record<string, Rgb> = {};
  for (const match of body.matchAll(/--([a-z-]+)-rgb:\s*(\d+)\s+(\d+)\s+(\d+)\s*;/g)) {
    out[match[1]!] = [Number(match[2]), Number(match[3]), Number(match[4])];
  }
  return out;
}

const channel = (value: number): number => {
  const v = value / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

const luminance = ([r, g, b]: Rgb): number => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a) + 0.05, luminance(b) + 0.05].sort((x, y) => y - x) as [number, number];
  return hi / lo;
}

const LIGHT = tokensIn(block(':root'));
const DARK = tokensIn(block('.dark'));

const REQUIRED = [
  'canvas', 'surface', 'raised', 'card', 'muted', 'line', 'line-strong',
  'ink', 'ink-muted', 'ink-faint',
  'accent', 'accent-hover', 'accent-soft', 'accent-ink',
  'danger', 'danger-soft', 'success', 'success-soft', 'success-ink', 'warning', 'warning-soft',
];

const TEXT_PAIRS: Array<[string, string, string]> = [
  ['ink', 'canvas', 'text on the page'],
  ['ink', 'surface', 'a file name in the list'],
  ['ink', 'card', 'a card, the upload panel'],
  ['ink', 'raised', 'text in a field and a menu'],
  ['ink', 'muted', 'a hovered row'],
  ['ink-muted', 'canvas', 'the sidebar’s other places'],
  ['ink-muted', 'surface', 'sizes and dates in the list'],
  ['ink-muted', 'card', 'speed and time left in the upload panel'],
  ['ink-muted', 'muted', 'an unselected tab'],
  ['ink-faint', 'canvas', 'a section label'],
  ['ink-faint', 'surface', 'column headings'],
  ['ink-faint', 'card', 'secondary text on a card'],
  ['ink-faint', 'raised', 'a placeholder'],
  ['ink-faint', 'muted', 'the storage figure on its track'],
  ['accent-ink', 'accent', 'a button, the current place in the sidebar'],
  ['accent-ink', 'accent-hover', 'a hovered button'],
  ['accent', 'accent-soft', 'a sharing chip, a folder tile'],
  ['ink', 'accent-soft', 'a selected row'],
  ['ink-muted', 'accent-soft', 'details of a selected row'],
  ['accent', 'surface', 'a link'],
  ['accent', 'card', 'the percentage in the upload panel'],
  ['danger', 'danger-soft', 'an error'],
  ['danger', 'card', 'a failed upload'],
  ['accent-ink', 'danger', 'a destructive button'],
  ['success', 'success-soft', 'a confirmation'],
  ['success', 'surface', 'a finished upload'],
  ['success-ink', 'success', 'a confirmation button'],
  ['warning', 'warning-soft', 'a warning'],
  ['warning', 'surface', 'Waiting for a connection'],
];

const KINDS = ['pdf', 'document', 'spreadsheet', 'presentation', 'archive', 'image', 'video', 'audio'];

// A colored extension wherever a file name sits: the list, a card, a hovered or selected row.
for (const kind of KINDS) {
  REQUIRED.push(`kind-${kind}`);
  for (const background of ['surface', 'card', 'raised', 'muted', 'accent-soft']) {
    TEXT_PAIRS.push([`kind-${kind}`, background, `the extension of a ${kind} file`]);
  }
}

const NON_TEXT_PAIRS: Array<[string, string, string]> = [
  ['accent', 'muted', 'a progress bar on its track'],
  ['accent', 'surface', 'the selected checkbox'],
  ['accent', 'card', 'the upload ring'],
  ['danger', 'surface', 'a failed upload’s mark'],
];

// A favorite's star beside its name: in the list, on a card, on a hovered or selected row.
REQUIRED.push('star');
for (const background of ['surface', 'card', 'raised', 'muted', 'accent-soft']) {
  NON_TEXT_PAIRS.push(['star', background, 'a favorite’s star']);
}

describe.each([
  ['light', LIGHT],
  ['dark', DARK],
])('%s theme', (_name, theme) => {
  it('defines every token the components use', () => {
    for (const token of REQUIRED) expect(theme, `--${token}-rgb`).toHaveProperty(token);
  });

  it.each(TEXT_PAIRS)('reads %s on %s — %s', (fg, bg) => {
    expect(contrast(theme[fg]!, theme[bg]!)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(NON_TEXT_PAIRS)('shows %s on %s — %s', (fg, bg) => {
    expect(contrast(theme[fg]!, theme[bg]!)).toBeGreaterThanOrEqual(3);
  });

  it('separates a card from the page behind it', () => {
    expect(contrast(theme['card']!, theme['canvas']!)).toBeGreaterThan(1.05);
  });
});

describe('the viewer stage', () => {
  it('is defined once, outside the light and dark swap', () => {
    for (const token of ['stage', 'stage-ink', 'stage-ink-muted']) {
      expect(LIGHT, token).toHaveProperty(token);
      expect(DARK, token).not.toHaveProperty(token);
    }
  });

  it('keeps its text readable', () => {
    expect(contrast(LIGHT['stage-ink']!, LIGHT['stage']!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(LIGHT['stage-ink-muted']!, LIGHT['stage']!)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('avatar identities', () => {
  const identities = (dark: boolean) =>
    Array.from({ length: 10 }, (_, index) => {
      const tokens = tokensIn(block(`${dark ? '.dark ' : ''}.avatar-${index + 1}`));
      return { disc: tokens['avatar']!, ink: tokens['avatar-ink']! };
    });

  it.each([
    ['light', false],
    ['dark', true],
  ])('carries readable initials on every hue, %s', (_name, dark) => {
    for (const [index, { disc, ink }] of identities(dark).entries()) {
      expect(contrast(ink, disc), `avatar ${index + 1}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

// Each app's own accent, set where `data-app` names it, against the shared neutrals.
const APPS = ['notes', 'tasks', 'files', 'talk', 'habits', 'utilikit', 'wiki'];
const involvesAccent = ([fg, bg]: [string, string, string]) => fg.startsWith('accent') || bg.startsWith('accent');
/** File extensions and stars on a selected row are Files' own: other apps don't put them on their accent. */
const ownTo = (app: string) => ([fg]: [string, string, string]) => app === 'files' || !(fg.startsWith('kind-') || fg === 'star');

describe.each(
  APPS.flatMap(app => [
    [app, 'light', { ...LIGHT, ...tokensIn(block(`[data-app='${app}']`)) }],
    [app, 'dark', { ...DARK, ...tokensIn(block(`.dark [data-app='${app}']`)) }],
  ] as Array<[string, string, Record<string, Rgb>]>),
)('%s in the %s theme', (_app, _name, theme) => {
  it('sets all four accent tokens', () => {
    for (const token of ['accent', 'accent-hover', 'accent-soft', 'accent-ink']) expect(theme, `--${token}-rgb`).toHaveProperty(token);
  });

  it.each(TEXT_PAIRS.filter(involvesAccent).filter(ownTo(_app)))('reads %s on %s — %s', (fg, bg) => {
    expect(contrast(theme[fg]!, theme[bg]!)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(NON_TEXT_PAIRS.filter(involvesAccent).filter(ownTo(_app)))('shows %s on %s — %s', (fg, bg) => {
    expect(contrast(theme[fg]!, theme[bg]!)).toBeGreaterThanOrEqual(3);
  });
});
