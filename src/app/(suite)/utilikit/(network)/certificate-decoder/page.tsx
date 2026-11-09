'use client';

import { useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CheckCircle2, FileBadge, ShieldAlert, XCircle } from 'lucide-react';
import { ToolLayout } from '@/modules/utilikit/components/tool-layout';
import { GuideCard } from '@/modules/utilikit/components/ui/guide-card';
import { CopyButton } from '@/modules/utilikit/components/ui/copy-button';
import type { CertificateSummary, ServerCertificates } from '@/modules/utilikit/lib/certificate';
import { readErrorCode, useErrorMessage } from '@/modules/utilikit/lib/api-error';
import { cn } from '@/lib/cn';
import { Alert, Button, Card, CardTitle, Input, Segmented, Spinner } from '@/components/ui';
import { Textarea } from '@/modules/utilikit/components/ui/fields';

type Mode = 'server' | 'pem';
type Result = { mode: 'pem'; certificates: CertificateSummary[] } | ({ mode: 'server' } & ServerCertificates);

const CURVES: Record<string, string> = { prime256v1: 'P-256', secp384r1: 'P-384', secp521r1: 'P-521' };
const TRUST_ERRORS = [
  'CERT_HAS_EXPIRED',
  'CERT_NOT_YET_VALID',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'ERR_TLS_CERT_ALTNAME_INVALID',
] as const;
const USAGES = ['serverAuth', 'clientAuth', 'codeSigning', 'emailProtection', 'timeStamping', 'ocspSigning'] as const;

const isKnown = <T extends string>(list: readonly T[], value: string | undefined): value is T =>
  value !== undefined && (list as readonly string[]).includes(value);

export default function CertificateDecoder() {
  const t = useTranslations('utilikit.certificateDecoder');
  const locale = useLocale();
  const apiError = useErrorMessage();
  const [mode, setMode] = useState<Mode>('server');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('443');
  const [pem, setPem] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<{ code: string; detail?: string } | null>(null);

  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/utilikit/certificate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'server' ? { mode, host, port } : { mode, pem }),
      });
      if (!response.ok) {
        const body = await response.clone().json().catch(() => null);
        setError({ code: await readErrorCode(response), detail: body?.detail });
        return;
      }
      setResult({ mode, ...(await response.json()) });
    } catch (cause) {
      console.error('Certificate error:', cause);
      setError({ code: 'generic' });
    } finally {
      setLoading(false);
    }
  };

  const expiry = (certificate: CertificateSummary) => {
    if (certificate.status === 'expired') return t('status.expired', { days: -certificate.daysLeft });
    if (certificate.status === 'notYetValid') return t('status.notYetValid');
    return t('status.valid', { days: certificate.daysLeft });
  };

  const role = (index: number, total: number, certificate: CertificateSummary) => {
    if (result?.mode !== 'server') return null;
    if (index === 0) return t('roles.server');
    return index === total - 1 && certificate.selfSigned ? t('roles.root') : t('roles.intermediate');
  };

  const certificates = result?.certificates ?? [];

  return (
    <ToolLayout>
      <div className="space-y-4 sm:space-y-6">
        <Card>
          <Segmented
            value={mode}
            onChange={next => {
              setMode(next);
              setResult(null);
              setError(null);
            }}
            options={[
              { value: 'server', label: t('modes.server') },
              { value: 'pem', label: t('modes.pem') },
            ]}
            ariaLabel={t('mode')}
            className="mb-4"
          />

          <form onSubmit={submit} className="space-y-3">
            {mode === 'server' ? (
              <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3 md:grid-cols-[minmax(0,1fr)_7rem_auto] md:items-end">
                <Input
                  label={t('host')}
                  value={host}
                  onChange={event => setHost(event.target.value)}
                  placeholder="example.com"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                />
                <Input label={t('port')} type="number" min={1} max={65535} value={port} onChange={event => setPort(event.target.value)} />
                <Button type="submit" disabled={loading || !host.trim()} className="col-span-2 h-11 sm:h-10 md:col-span-1">
                  {loading && <Spinner size={16} className="text-current" />}
                  {t('check')}
                </Button>
              </div>
            ) : (
              <>
                <Textarea
                  label={t('pem')}
                  value={pem}
                  onChange={event => setPem(event.target.value)}
                  placeholder={'-----BEGIN CERTIFICATE-----\n…\n-----END CERTIFICATE-----'}
                  spellCheck={false}
                  className="h-48 font-mono sm:text-xs"
                />
                <Button type="submit" disabled={loading || !pem.trim()} className="w-full sm:w-auto">
                  {loading && <Spinner size={16} className="text-current" />}
                  {t('decode')}
                </Button>
              </>
            )}
          </form>

          {error && (
            <Alert className="mt-4">
              {apiError(error.code)}
              {error.detail && error.code === 'connectionFailed' && (
                <span className="mt-1 block font-mono text-xs opacity-80">{error.detail}</span>
              )}
            </Alert>
          )}
        </Card>

        {result?.mode === 'server' && (
          <Card>
            <CardTitle className="mb-4 wrap-anywhere">
              {result.host}:{result.port}
            </CardTitle>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Verdict ok={result.trusted} label={result.trusted ? t('trusted') : t('notTrusted')}>
                {!result.trusted &&
                  (isKnown(TRUST_ERRORS, result.trustError) ? t(`trustErrors.${result.trustError}`) : result.trustError)}
              </Verdict>
              <Verdict ok={result.hostnameMatches} label={result.hostnameMatches ? t('hostnameMatches') : t('hostnameMismatch')} />
            </div>
            {(result.protocol || result.cipher) && (
              <p className="mt-3 text-sm text-ink-muted">
                {t('connection', { protocol: result.protocol ?? '?', cipher: result.cipher ?? '?' })}
              </p>
            )}
          </Card>
        )}

        {certificates.map((certificate, index) => (
          <Card key={certificate.fingerprint256 + index}>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                {role(index, certificates.length, certificate) && (
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
                    {role(index, certificates.length, certificate)}
                  </p>
                )}
                <CardTitle className="wrap-anywhere">{certificate.commonName}</CardTitle>
              </div>
              <span
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-semibold',
                  certificate.status === 'valid' && certificate.daysLeft >= 14 && 'bg-success-soft text-success',
                  certificate.status === 'valid' && certificate.daysLeft < 14 && 'bg-warning-soft text-warning',
                  certificate.status !== 'valid' && 'bg-danger-soft text-danger'
                )}
              >
                {expiry(certificate)}
              </span>
            </div>

            <dl className="divide-y divide-line rounded-lg border border-line text-sm">
              <Field label={t('fields.subject')} value={certificate.subject.map(([key, value]) => `${key}=${value}`).join(', ')} />
              <Field label={t('fields.issuer')} value={certificate.issuer.map(([key, value]) => `${key}=${value}`).join(', ')} />
              <Field label={t('fields.validFrom')} value={date.format(new Date(certificate.validFrom))} />
              <Field label={t('fields.validTo')} value={date.format(new Date(certificate.validTo))} />
              {certificate.altNames.length > 0 && (
                <div className="flex flex-col gap-1.5 px-3.5 py-2.5 sm:flex-row sm:gap-3">
                  <dt className="w-44 shrink-0 text-ink-muted">{t('fields.altNames')}</dt>
                  <dd className="flex min-w-0 flex-wrap gap-1.5">
                    {certificate.altNames.map(name => (
                      <span key={name} className="rounded-md border border-line bg-canvas px-2 py-0.5 font-mono text-xs break-all">
                        {name}
                      </span>
                    ))}
                  </dd>
                </div>
              )}
              <Field
                label={t('fields.key')}
                value={
                  certificate.keySize
                    ? t('keyBits', { type: certificate.keyType, bits: certificate.keySize })
                    : [certificate.keyType, certificate.curve && (CURVES[certificate.curve] ?? certificate.curve)].filter(Boolean).join(' ')
                }
              />
              {certificate.signatureAlgorithm && <Field label={t('fields.signature')} value={certificate.signatureAlgorithm} mono />}
              {certificate.extendedKeyUsage.length > 0 && (
                <Field
                  label={t('fields.usage')}
                  value={certificate.extendedKeyUsage.map(usage => (isKnown(USAGES, usage) ? t(`usages.${usage}`) : usage)).join(', ')}
                />
              )}
              <Field
                label={t('fields.authority')}
                value={[certificate.isCA ? t('yes') : t('no'), certificate.selfSigned ? t('selfSigned') : null].filter(Boolean).join(' · ')}
              />
              <Field label={t('fields.serial')} value={certificate.serialNumber} mono />
              <Field label={t('fields.sha256')} value={certificate.fingerprint256} mono copy />
              <Field label={t('fields.sha1')} value={certificate.fingerprint1} mono copy />
            </dl>
          </Card>
        ))}

        <GuideCard>
          <CardTitle className="mb-3">
            <FileBadge size={18} className="shrink-0" />
            {t('about')}
          </CardTitle>
          <p className="text-sm text-ink-muted">{t('aboutText')}</p>
        </GuideCard>
      </div>
    </ToolLayout>
  );
}

function Verdict({ ok, label, children }: { ok: boolean; label: string; children?: React.ReactNode }) {
  const Icon = ok ? CheckCircle2 : children ? ShieldAlert : XCircle;
  return (
    <div className={cn('flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-sm', ok ? 'border-success/40 bg-success-soft' : 'border-danger/40 bg-danger-soft')}>
      <Icon size={18} className={cn('mt-0.5 shrink-0', ok ? 'text-success' : 'text-danger')} />
      <div className="min-w-0">
        <p className={cn('font-semibold', ok ? 'text-success' : 'text-danger')}>{label}</p>
        {children && <p className="mt-0.5 text-ink-muted">{children}</p>}
      </div>
    </div>
  );
}

function Field({ label, value, mono = false, copy = false }: { label: string; value: string; mono?: boolean; copy?: boolean }) {
  return (
    <div className="flex flex-col gap-1 px-3.5 py-2.5 sm:flex-row sm:items-start sm:gap-3">
      <dt className="w-44 shrink-0 text-ink-muted">{label}</dt>
      <dd className={cn('min-w-0 flex-1 text-ink', mono ? 'break-all font-mono text-xs leading-5' : 'wrap-anywhere')}>{value}</dd>
      {copy && <CopyButton value={value} variant="ghost" className="-my-1 self-start" />}
    </div>
  );
}
