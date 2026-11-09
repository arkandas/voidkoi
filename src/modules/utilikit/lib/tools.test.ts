import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { MESSAGES } from '@/i18n/messages';
import { manifest } from '@/modules/utilikit/manifest';
import { CATEGORIES, filterTools, findTool, normalizeSearch, TOOLS } from '@/modules/utilikit/lib/tools';

const ROUTES = path.join(process.cwd(), 'src/app/(suite)/utilikit');

describe('TOOLS', () => {
  it('has unique ids and paths', () => {
    expect(new Set(TOOLS.map(tool => tool.id)).size).toBe(TOOLS.length);
    expect(new Set(TOOLS.map(tool => tool.path)).size).toBe(TOOLS.length);
  });

  it('only uses known categories and every category has tools', () => {
    for (const tool of TOOLS) expect(CATEGORIES).toContain(tool.category);
    for (const category of CATEGORIES) expect(TOOLS.some(tool => tool.category === category)).toBe(true);
  });

  it('declares every category as a sub-app, in the same order', () => {
    expect(manifest.subApps.map(sub => sub.id)).toEqual([...CATEGORIES]);
  });

  it('puts every tool page in its category’s group, which needs that sub-app', () => {
    for (const category of CATEGORIES) {
      const layout = readFileSync(path.join(ROUTES, `(${category})`, 'layout.tsx'), 'utf8');
      expect(layout, category).toContain(`requireAppPage('utilikit', '${category}')`);
    }
    for (const tool of TOOLS) {
      expect(existsSync(path.join(ROUTES, `(${tool.category})`, tool.id, 'page.tsx')), tool.id).toBe(true);
    }
  });

  it('gives every tool page its own title and description', () => {
    for (const tool of TOOLS) {
      const layout = readFileSync(path.join(ROUTES, `(${tool.category})`, tool.id, 'layout.tsx'), 'utf8');
      expect(layout, tool.id).toContain(`toolMetadata('${tool.id}')`);
    }
  });

  it('names and describes every tool and category in every language', () => {
    for (const [locale, messages] of Object.entries(MESSAGES)) {
      const tools = messages.utilikit.tools as Record<string, { name?: string; description?: string }>;
      const missing = TOOLS.filter(tool => !tools[tool.id]?.name || !tools[tool.id]?.description).map(tool => tool.id);
      expect(missing, locale).toEqual([]);
      const app = messages.utilikit.app as Record<string, string>;
      expect(CATEGORIES.filter(category => !app[category]), locale).toEqual([]);
    }
  });
});

describe('findTool', () => {
  it('finds a tool by its path', () => {
    expect(findTool('/utilikit/hash-generator')?.id).toBe('hash-generator');
    expect(findTool('/utilikit/hash-generator/extra')?.id).toBe('hash-generator');
  });

  it('does not match prefixes of other names', () => {
    expect(findTool('/utilikit/hash-generator-2')).toBeUndefined();
    expect(findTool('/utilikit')).toBeUndefined();
    expect(findTool('/hash-generator')).toBeUndefined();
  });
});

describe('search', () => {
  const tools = [
    { name: 'Conversor de vídeo', description: 'Convierte vídeos' },
    { name: 'Generador de hashes', description: 'MD5 y SHA-256' },
  ];

  it('ignores case and accents', () => {
    expect(normalizeSearch('  VÍDEO ')).toBe('video');
    expect(filterTools(tools, 'video')).toEqual([tools[0]]);
    expect(filterTools(tools, 'CONVERSOR DE VÍDEO')).toEqual([tools[0]]);
  });

  it('searches descriptions too', () => {
    expect(filterTools(tools, 'sha-256')).toEqual([tools[1]]);
  });

  it('returns everything for an empty query', () => {
    expect(filterTools(tools, '   ')).toEqual(tools);
  });
});
