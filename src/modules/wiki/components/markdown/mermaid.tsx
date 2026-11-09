'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useId, useState } from 'react';

/** Light or dark: a dark diagram takes the page's colours, so it is drawn again when the theme changes. */
function useLook(): 'light' | 'dark' {
  const [look, setLook] = useState<'light' | 'dark'>('light');
  useEffect(() => {
    const root = document.documentElement;
    const read = (): void => setLook(root.classList.contains('dark') ? 'dark' : 'light');
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return look;
}

/** A colour token of the page, as Mermaid wants it. */
function token(name: string): string {
  const channels = getComputedStyle(document.documentElement).getPropertyValue(`--${name}-rgb`).trim().split(/\s+/).map(Number);
  return `#${channels.map(value => (Number.isFinite(value) ? value : 0).toString(16).padStart(2, '0')).join('')}`;
}

/** Mermaid's colours for a dark page: its cards, lines and text. */
function darkTheme() {
  return {
    theme: 'base' as const,
    themeVariables: {
      darkMode: true,
      background: token('surface'),
      mainBkg: token('card'),
      primaryColor: token('card'),
      primaryTextColor: token('ink'),
      primaryBorderColor: token('line-strong'),
      nodeBorder: token('line-strong'),
      lineColor: token('ink-muted'),
      textColor: token('ink'),
      titleColor: token('ink'),
      secondaryColor: token('muted'),
      tertiaryColor: token('raised'),
      clusterBkg: token('canvas'),
      clusterBorder: token('line'),
      edgeLabelBackground: token('surface'),
    },
  };
}

/** A Mermaid diagram. The library is large, so it loads only on pages that have one. */
export function Mermaid({ chart }: { chart: string }) {
  const t = useTranslations('wiki.markdown');
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const look = useLook();
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mermaid = (await import('mermaid')).default;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        ...(look === 'light' ? { theme: 'neutral' as const } : darkTheme()),
        fontFamily: 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      });
      const { svg: drawn } = await mermaid.render(`mermaid-${id}-${look}`, chart);
      if (!cancelled) {
        setSvg(drawn);
        setFailed(false);
      }
    })().catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [chart, look, id]);

  if (failed) {
    return (
      <div className="mermaid-diagram mermaid-failed">
        <p>{t('diagramFailed')}</p>
        <pre>
          <code>{chart}</code>
        </pre>
      </div>
    );
  }
  return (
    <div
      className="mermaid-diagram"
      role="img"
      aria-label={t('diagram')}
      // Drawn by Mermaid with securityLevel strict: no scripts or links in it.
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}
