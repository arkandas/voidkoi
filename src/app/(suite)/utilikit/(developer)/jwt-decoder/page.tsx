'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { AlertTriangle, CheckCircle, Clock, Hourglass, type LucideIcon } from 'lucide-react';
import { ToolLayout } from '@/modules/utilikit/components/tool-layout';
import { GuideCard } from '@/modules/utilikit/components/ui/guide-card';
import { CopyButton } from '@/modules/utilikit/components/ui/copy-button';
import { Well } from '@/modules/utilikit/components/ui/well';
import { decodeJWT, DecodedJWT, JWTError, TIME_CLAIMS, TokenStatus } from '@/modules/utilikit/lib/jwt-decoder';
import { cn } from '@/lib/cn';
import { Alert, Button, Card, CardTitle } from '@/components/ui';
import { Textarea } from '@/modules/utilikit/components/ui/fields';

const PARTS = ['header', 'payload', 'signature'] as const;

type Part = (typeof PARTS)[number];

const STATUS_STYLES: Record<TokenStatus, { icon: LucideIcon; className: string }> = {
  valid: { icon: CheckCircle, className: 'border-success/40 bg-success-soft text-success' },
  expired: { icon: AlertTriangle, className: 'border-danger/40 bg-danger-soft text-danger' },
  notYetValid: { icon: Hourglass, className: 'border-warning/40 bg-warning-soft text-warning' },
  noExpiry: { icon: Clock, className: 'border-line-strong bg-muted text-ink-muted' },
};

function partValue(token: DecodedJWT, part: Part): string {
  return part === 'signature' ? token.signature : JSON.stringify(token[part], null, 2);
}

function StatusBadge({ status, label }: { status: TokenStatus; label: string }) {
  const { icon: Icon, className } = STATUS_STYLES[status];

  return (
    <span
      className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold', className)}
    >
      <Icon size={15} className="shrink-0" />
      {label}
    </span>
  );
}

export default function JWTDecoder() {
  const t = useTranslations('utilikit.jwtDecoder');
  const tc = useTranslations('utilikit.common');
  const locale = useLocale();

  const [token, setToken] = useState('');
  const [decoded, setDecoded] = useState<DecodedJWT | null>(null);
  const [error, setError] = useState<JWTError | null>(null);

  const handleDecode = () => {
    const result = decodeJWT(token, Date.now());
    setDecoded(result.ok ? result.token : null);
    setError(result.ok ? null : result.error);
  };

  const handleClear = () => {
    setToken('');
    setDecoded(null);
    setError(null);
  };

  const formatDate = (seconds: number) =>
    new Date(seconds * 1000).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'long' });

  return (
    <ToolLayout>
      <Card className="mb-4 sm:mb-6">
        <CardTitle className="mb-4">{t('inputToken')}</CardTitle>
        <div className="space-y-4">
          <Textarea
            value={token}
            onChange={e => setToken(e.target.value)}
            placeholder={t('pasteJwt')}
            aria-label={t('inputToken')}
            rows={5}
            spellCheck={false}
            className="break-all font-mono"
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleDecode} className="flex-1" disabled={!token.trim()}>
              {t('decodeToken')}
            </Button>
            <Button onClick={handleClear} variant="outline">
              {tc('clear')}
            </Button>
          </div>
          {error && <Alert>{t(`errors.${error}`)}</Alert>}
        </div>
      </Card>

      {decoded && (
        <>
          <Card className="mb-4 sm:mb-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>{t('tokenStatus')}</CardTitle>
              <StatusBadge status={decoded.status} label={t(`status.${decoded.status}`)} />
            </div>
            {Object.keys(decoded.times).length > 0 && (
              <dl className="mt-4 divide-y divide-line rounded-lg border border-line bg-canvas text-sm">
                {TIME_CLAIMS.map(claim => {
                  const seconds = decoded.times[claim];
                  return seconds === undefined ? null : (
                    <div
                      key={claim}
                      className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3.5 py-2.5"
                    >
                      <dt className="font-medium text-ink">
                        {t(`claims.${claim}`)} <code className="font-mono text-xs text-ink-muted">{claim}</code>
                      </dt>
                      <dd className="text-ink-muted">{formatDate(seconds)}</dd>
                    </div>
                  );
                })}
              </dl>
            )}
          </Card>

          {PARTS.map(part => {
            const value = partValue(decoded, part);
            return (
              <Card key={part} className="mb-4 sm:mb-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <CardTitle>{t(`parts.${part}`)}</CardTitle>
                  <CopyButton value={value} label={tc('copy')} disabled={!value} />
                </div>
                <Well mono className="whitespace-pre-wrap">
                  {value || <span className="font-sans italic text-ink-muted">{t('unsigned')}</span>}
                </Well>
              </Card>
            );
          })}
        </>
      )}

      <GuideCard>
        <CardTitle className="mb-3">{t('about.title')}</CardTitle>
        <div className="space-y-3 text-sm text-ink-muted">
          <p>{t('about.description')}</p>
          <dl className="grid grid-cols-1 gap-4 pt-2 md:grid-cols-3">
            {PARTS.map(part => (
              <div key={part}>
                <dt className="mb-1 font-medium text-ink">{t(`parts.${part}`)}</dt>
                <dd>{t(`about.${part}`)}</dd>
              </div>
            ))}
          </dl>
          <div className="border-t border-line pt-3">
            <p className="mb-1 font-medium text-ink">{t('about.securityTitle')}</p>
            <p>{t('about.security')}</p>
          </div>
        </div>
      </GuideCard>
    </ToolLayout>
  );
}
