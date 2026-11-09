'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ExternalLink, Image as ImageIcon, Search } from 'lucide-react';
import { ToolLayout } from '@/modules/utilikit/components/tool-layout';
import { GuideCard } from '@/modules/utilikit/components/ui/guide-card';
import { CopyButton } from '@/modules/utilikit/components/ui/copy-button';
import { Well } from '@/modules/utilikit/components/ui/well';
import { readErrorCode, useErrorMessage } from '@/modules/utilikit/lib/api-error';
import { OpenGraphData } from '@/modules/utilikit/lib/types';
import { Alert, Button, Card, CardTitle, Input, Spinner } from '@/components/ui';

const EXAMPLES = [
  { label: 'GitHub', url: 'https://github.com' },
  { label: 'YouTube', url: 'https://youtube.com' },
  { label: 'Medium', url: 'https://medium.com' },
] as const;

type Field = readonly [label: string, value: string | undefined];

interface Preview {
  data: OpenGraphData;
  image: string | null;
}

function toHttpUrl(value: string | undefined, base?: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, base);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return base ? toHttpUrl(value) : null;
  }
}

function presentFields(...fields: Field[]) {
  return fields.filter((field): field is readonly [string, string] => Boolean(field[1]));
}

export default function OGParser() {
  const t = useTranslations('utilikit.ogParser');
  const tc = useTranslations('utilikit.common');
  const apiError = useErrorMessage();

  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  const parse = async () => {
    const target = url.trim();
    if (!target || loading) return;

    setLoading(true);
    setError('');
    setPreview(null);
    setImageFailed(false);

    try {
      const response = await fetch('/api/utilikit/og-parser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: target }),
      });

      if (!response.ok) {
        setError(apiError(await readErrorCode(response)));
        return;
      }

      const data: OpenGraphData = await response.json();
      setPreview({ data, image: toHttpUrl(data.image, data.url ?? target) });
    } catch (err) {
      console.error('Failed to parse Open Graph data:', err);
      setError(apiError('generic'));
    } finally {
      setLoading(false);
    }
  };

  const data = preview?.data;
  const image = imageFailed ? null : preview?.image;
  const hasText = Boolean(data?.title || data?.description || data?.url);

  const sections = data
    ? [
        {
          id: 'openGraph',
          title: t('parsedMetadata'),
          fields: presentFields(
            [t('ogTitle'), data.title],
            [t('ogDescription'), data.description],
            [t('previewImage'), data.image],
            [t('ogUrl'), data.url],
            [t('ogType'), data.type],
            [t('ogSiteName'), data.siteName],
            [tc('locale'), data.locale]
          ),
        },
        {
          id: 'twitter',
          title: tc('twitterCard'),
          fields: presentFields(
            [tc('cardType'), data.twitterCard],
            [tc('site'), data.twitterSite],
            [tc('creator'), data.twitterCreator]
          ),
        },
      ].filter(section => section.fields.length > 0)
    : [];

  return (
    <ToolLayout>
      <div className="space-y-4 sm:space-y-6">
        <Card>
          <CardTitle className="mb-4">{t('enterUrl')}</CardTitle>
          <form
            onSubmit={event => {
              event.preventDefault();
              void parse();
            }}
            className="flex flex-col gap-2 sm:flex-row"
          >
            <Input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder={t('pasteUrl')}
              aria-label={t('enterUrl')}
              inputMode="url"
              spellCheck={false}
            />
            <Button type="submit" disabled={loading || !url.trim()} className="shrink-0">
              {loading ? <Spinner size={16} className="text-current" /> : <Search size={16} />}
              {loading ? t('parsing') : t('parseUrl')}
            </Button>
          </form>
        </Card>

        {error && <Alert>{error}</Alert>}

        {data && (image || hasText) && (
          <Card>
            <CardTitle className="mb-4">{tc('preview')}</CardTitle>
            <div className="overflow-hidden rounded-lg border border-line">
              {image && (
                <div className="aspect-[1.91/1] w-full bg-canvas">
                  <img
                    src={image}
                    alt={t('previewImage')}
                    referrerPolicy="no-referrer"
                    onError={() => setImageFailed(true)}
                    className="h-full w-full object-cover"
                  />
                </div>
              )}
              {hasText && (
                <div className="space-y-2 p-4">
                  {data.title && <h4 className="text-lg font-semibold text-ink wrap-anywhere">{data.title}</h4>}
                  {data.description && (
                    <p className="line-clamp-2 text-sm text-ink-muted wrap-anywhere">{data.description}</p>
                  )}
                  {data.url && (
                    <p className="flex items-center gap-2 text-xs text-ink-muted">
                      <ExternalLink size={12} className="shrink-0" />
                      <span className="min-w-0 truncate">{data.url}</span>
                    </p>
                  )}
                </div>
              )}
            </div>
          </Card>
        )}

        {data && sections.length === 0 && <Alert tone="info">{t('noMetadata')}</Alert>}

        {sections.map(section => (
          <Card key={section.id}>
            <CardTitle className="mb-4">{section.title}</CardTitle>
            <div className="space-y-3">
              {section.fields.map(([label, value]) => (
                <div key={label}>
                  <p className="mb-1.5 text-sm font-medium text-ink-muted">{label}</p>
                  <div className="flex items-start gap-2">
                    <Well className="min-w-0 flex-1 wrap-anywhere">{value}</Well>
                    <CopyButton value={value} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))}

        {!data && !loading && (
          <Card>
            <CardTitle className="mb-4">{tc('examples')}</CardTitle>
            <div className="space-y-2">
              {EXAMPLES.map(example => (
                <button
                  key={example.url}
                  type="button"
                  onClick={() => setUrl(example.url)}
                  className="w-full rounded-lg border border-line bg-canvas p-3 text-left transition-colors hover:border-accent"
                >
                  <span className="block font-medium text-ink">{example.label}</span>
                  <span className="mt-1 block break-all text-xs text-ink-muted">{example.url}</span>
                </button>
              ))}
            </div>
          </Card>
        )}

        <GuideCard>
          <CardTitle className="mb-3">
            <ImageIcon size={18} />
            {t('about.title')}
          </CardTitle>
          <div className="space-y-2 text-sm text-ink-muted">
            <p>{t('about.description')}</p>
            <p className="font-medium text-ink">{t('about.commonTags')}</p>
          </div>
        </GuideCard>
      </div>
    </ToolLayout>
  );
}
