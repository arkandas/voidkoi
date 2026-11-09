'use client';

import { useSyncExternalStore, type CSSProperties } from 'react';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import csv from 'react-syntax-highlighter/dist/esm/languages/prism/csv';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql';
import toml from 'react-syntax-highlighter/dist/esm/languages/prism/toml';
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml';
import { coldarkCold, coldarkDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTheme } from '@/lib/use-theme';

SyntaxHighlighter.registerLanguage('csv', csv);
SyntaxHighlighter.registerLanguage('json', json);
SyntaxHighlighter.registerLanguage('sql', sql);
SyntaxHighlighter.registerLanguage('toml', toml);
SyntaxHighlighter.registerLanguage('yaml', yaml);

export type CodeLanguage = 'csv' | 'json' | 'sql' | 'toml' | 'yaml';

const PRE = 'pre[class*="language-"]';
const CODE = 'code[class*="language-"]';
const BLEND: CSSProperties = { background: 'transparent', fontFamily: 'inherit', fontSize: 'inherit' };

function blend(style: Record<string, CSSProperties>): Record<string, CSSProperties> {
  return {
    ...style,
    [PRE]: { ...style[PRE], ...BLEND, height: '100%', margin: 0, padding: '0.75rem 0.875rem', borderRadius: 0 },
    [CODE]: { ...style[CODE], ...BLEND },
  };
}

const LIGHT_STYLE = blend(coldarkCold);
const DARK_STYLE = blend(coldarkDark);
const DARK_SCHEME = '(prefers-color-scheme: dark)';

function subscribeToScheme(onChange: () => void) {
  const media = window.matchMedia(DARK_SCHEME);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

const prefersDark = () => window.matchMedia(DARK_SCHEME).matches;
const prefersDarkOnServer = () => false;

export function CodeView({ language, children }: { language: CodeLanguage; children: string }) {
  const { theme } = useTheme();
  const systemDark = useSyncExternalStore(subscribeToScheme, prefersDark, prefersDarkOnServer);
  const style = theme === 'dark' || (theme === 'system' && systemDark) ? DARK_STYLE : LIGHT_STYLE;

  return (
    <SyntaxHighlighter language={language} style={style} className="themed-scroll" tabIndex={0}>
      {children}
    </SyntaxHighlighter>
  );
}
