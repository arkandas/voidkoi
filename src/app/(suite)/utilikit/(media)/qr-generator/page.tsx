'use client';

import { useState, type ChangeEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Download, ImageUp, X } from 'lucide-react';
import { saveAs } from 'file-saver';
import { ToolLayout } from '@/modules/utilikit/components/tool-layout';
import { GuideCard } from '@/modules/utilikit/components/ui/guide-card';
import { Dropzone } from '@/modules/utilikit/components/ui/dropzone';
import { Label } from '@/modules/utilikit/components/ui/label';
import { Well } from '@/modules/utilikit/components/ui/well';
import {
  applyRoundedCorners,
  buildQRContent,
  dataUrlToBlob,
  DEFAULT_PCB_OPTIONS,
  DEFAULT_QR_OPTIONS,
  EMPTY_QR_FIELDS,
  ERROR_CORRECTION_LEVELS,
  ErrorCorrectionLevel,
  generatePCBQRPng,
  generatePCBQRSvg,
  generateQR,
  overlayLogo,
  QR_STYLES,
  QR_TYPES,
  QRCodeType,
  QRFields,
  QRStyle,
  WIFI_SECURITY_TYPES,
  WiFiSecurity,
} from '@/modules/utilikit/lib/qr-generator';
import { cn } from '@/lib/cn';
import { Alert, Button, Card, CardTitle, Input, Select, Spinner } from '@/components/ui';

const DESCRIBED_TYPES = ['url', 'wifi', 'email', 'sms'] as const;

type TextField = Exclude<keyof QRFields, 'security'>;

interface QRResult {
  png: string;
  svg: string | null;
}

export default function QRGenerator() {
  const t = useTranslations('utilikit.qrGenerator');
  const tc = useTranslations('utilikit.common');

  const [qrType, setQrType] = useState<QRCodeType>('url');
  const [qrStyle, setQrStyle] = useState<QRStyle>('standard');
  const [fields, setFields] = useState<QRFields>(EMPTY_QR_FIELDS);
  const [errorCorrection, setErrorCorrection] = useState<ErrorCorrectionLevel>(
    DEFAULT_QR_OPTIONS.errorCorrectionLevel
  );
  const [logoDataUrl, setLogoDataUrl] = useState('');
  const [result, setResult] = useState<QRResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isPcb = qrStyle === 'pcb';

  const field = (key: TextField) => ({
    value: fields[key],
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      const { value } = event.target;
      setFields(previous => ({ ...previous, [key]: value }));
    },
  });

  const clearOutput = () => {
    setResult(null);
    setError('');
  };

  const changeType = (next: QRCodeType) => {
    setQrType(next);
    clearOutput();
  };

  const changeStyle = (next: QRStyle) => {
    setQrStyle(next);
    if (next === 'pcb') setErrorCorrection(DEFAULT_PCB_OPTIONS.errorCorrectionLevel);
    clearOutput();
  };

  const handleLogo = ([file]: File[]) => {
    if (!file.type.startsWith('image/')) {
      setError(t('errors.invalidLogo'));
      return;
    }

    setError('');
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      setLogoDataUrl(reader.result);
      setErrorCorrection('H');
    };
    reader.readAsDataURL(file);
  };

  const generate = async () => {
    const built = buildQRContent(qrType, fields);
    setResult(null);

    if (!built.valid) {
      setError(t(`errors.${built.error}`));
      return;
    }

    setError('');
    setLoading(true);

    try {
      if (isPcb) {
        const options = { errorCorrectionLevel: errorCorrection, logoDataUrl: logoDataUrl || undefined };
        const png = await generatePCBQRPng(built.content, options);
        setResult({ png, svg: generatePCBQRSvg(built.content, options) });
      } else {
        const base = await generateQR(built.content, { errorCorrectionLevel: errorCorrection });
        const png = await applyRoundedCorners(logoDataUrl ? await overlayLogo(base, logoDataUrl) : base);
        setResult({ png, svg: null });
      }
    } catch (cause) {
      console.error(cause);
      setError(t('errors.generateFailed'));
    } finally {
      setLoading(false);
    }
  };

  const download = (blob: Blob | null, extension: 'png' | 'svg') => {
    if (blob) saveAs(blob, `qr-code-${qrType}${isPcb ? '-pcb' : ''}.${extension}`);
  };

  const downloadPng = () => {
    if (result) download(dataUrlToBlob(result.png), 'png');
  };

  const downloadSvg = () => {
    if (result?.svg) download(new Blob([result.svg], { type: 'image/svg+xml' }), 'svg');
  };

  return (
    <ToolLayout>
      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle className="mb-4">{t('content')}</CardTitle>
          <div className="space-y-4">
            <Select
              label={t('qrType')}
              options={QR_TYPES.map(value => ({ value, label: t(`types.${value}`) }))}
              value={qrType}
              onChange={event => changeType(event.target.value as QRCodeType)}
            />

            {qrType === 'url' && (
              <Input label={t('websiteUrl')} placeholder="https://example.com" type="url" {...field('url')} />
            )}

            {qrType === 'text' && (
              <Input label={t('textContent')} placeholder={t('textPlaceholder')} {...field('text')} />
            )}

            {qrType === 'wifi' && (
              <>
                <Input label={t('networkName')} placeholder={t('ssidPlaceholder')} spellCheck={false} {...field('ssid')} />
                <Select
                  label={t('securityType')}
                  options={WIFI_SECURITY_TYPES.map(value => ({ value, label: t(`security.${value}`) }))}
                  value={fields.security}
                  onChange={event => {
                    const security = event.target.value as WiFiSecurity;
                    setFields(previous => ({ ...previous, security }));
                  }}
                />
                {fields.security !== 'nopass' && (
                  <Input label={t('password')} placeholder={t('wifiPassword')} type="password" {...field('password')} />
                )}
              </>
            )}

            {qrType === 'email' && (
              <>
                <Input
                  label={t('emailAddress')}
                  placeholder="contact@example.com"
                  type="email"
                  {...field('email')}
                />
                <Input label={t('subject')} placeholder={t('emailSubject')} {...field('subject')} />
                <Input label={t('body')} placeholder={t('emailMessage')} {...field('body')} />
              </>
            )}

            {(qrType === 'sms' || qrType === 'phone') && (
              <Input label={t('phoneNumber')} placeholder="+1234567890" type="tel" {...field('phone')} />
            )}

            {qrType === 'sms' && <Input label={t('message')} placeholder={t('smsMessage')} {...field('message')} />}

            <Select
              label={t('qrStyle')}
              options={QR_STYLES.map(value => ({ value, label: t(`styles.${value}`) }))}
              value={qrStyle}
              onChange={event => changeStyle(event.target.value as QRStyle)}
            />

            <div>
              <Label>{t('logoOptional')}</Label>
              {logoDataUrl ? (
                <Well className="flex items-center gap-3">
                  <img
                    src={logoDataUrl}
                    alt={t('logoAlt')}
                    className="h-10 w-10 shrink-0 rounded-md border border-line-strong object-contain p-0.5"
                    style={{ backgroundColor: DEFAULT_QR_OPTIONS.color.light }}
                  />
                  <span className="min-w-0 flex-1 text-ink-muted">{t('logoUploaded')}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setLogoDataUrl('')}
                    aria-label={t('removeLogo')}
                    title={t('removeLogo')}
                    className="px-2"
                  >
                    <X size={16} />
                  </Button>
                </Well>
              ) : (
                <Dropzone
                  onFiles={handleLogo}
                  title={t('uploadLogo')}
                  hint={isPcb ? t('logoHintPcb') : t('logoHint')}
                  accept="image/*"
                  icon={ImageUp}
                  className="min-h-0 py-5"
                />
              )}
            </div>

            <Select
              label={t('errorCorrection')}
              options={ERROR_CORRECTION_LEVELS.map(value => ({ value, label: t(`errorCorrectionLevels.${value}`) }))}
              value={errorCorrection}
              onChange={event => setErrorCorrection(event.target.value as ErrorCorrectionLevel)}
            />

            <Button onClick={generate} className="w-full gap-2" disabled={loading}>
              {loading && <Spinner size={16} className="text-current" />}
              {loading ? t('generating') : t('generateQrCode')}
            </Button>

            {error && <Alert>{error}</Alert>}
          </div>
        </Card>

        <Card className="flex flex-col">
          <CardTitle className="mb-4">{tc('preview')}</CardTitle>
          {result ? (
            <div className="space-y-4">
              <div className="flex justify-center">
                <div
                  className="w-full max-w-sm rounded-2xl border border-line-strong p-4 shadow-sm"
                  style={{ backgroundColor: DEFAULT_QR_OPTIONS.color.light }}
                >
                  <img src={result.png} alt={t('qrAlt')} className={cn('w-full', isPcb ? undefined : 'rounded-xl')} />
                </div>
              </div>

              {isPcb && (
                <Well className="text-ink-muted">
                  <p className="font-medium text-ink">{t('pcbNote')}</p>
                  <p className="mt-1">{t('pcbNoteDescription')}</p>
                </Well>
              )}

              <div className="flex flex-wrap gap-2">
                <Button onClick={downloadPng} variant="outline" className="min-w-40 flex-1 gap-2">
                  <Download size={16} />
                  {t('downloadPng')}
                </Button>
                {result.svg && (
                  <Button onClick={downloadSvg} variant="outline" className="min-w-40 flex-1 gap-2">
                    <Download size={16} />
                    {t('downloadSvg')}
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex min-h-64 flex-1 items-center justify-center rounded-lg border border-line bg-canvas p-4 text-center text-sm text-ink-muted">
              <p>{t('qrWillAppear')}</p>
            </div>
          )}
        </Card>
      </div>

      <GuideCard className="mt-4 sm:mt-6">
        <CardTitle className="mb-3">{t('qrCodeTypes')}</CardTitle>
        <dl className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
          {DESCRIBED_TYPES.map(type => (
            <div key={type}>
              <dt className="font-medium text-ink">{t(`types.${type}`)}</dt>
              <dd className="text-ink-muted">{t(`about.${type}`)}</dd>
            </div>
          ))}
        </dl>
      </GuideCard>
    </ToolLayout>
  );
}
