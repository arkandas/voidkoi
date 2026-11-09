'use client';

import { useId, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ToolLayout } from '@/modules/utilikit/components/tool-layout';
import { GuideCard } from '@/modules/utilikit/components/ui/guide-card';
import { CopyButton } from '@/modules/utilikit/components/ui/copy-button';
import { Label } from '@/modules/utilikit/components/ui/label';
import { Well } from '@/modules/utilikit/components/ui/well';
import { calculateSubnet, parseCidr, parseIPv4, parsePrefix, SubnetInfo } from '@/modules/utilikit/lib/ip-calculator';
import { Alert, Button, Card, CardTitle, Input } from '@/components/ui';

const COMMON_PREFIXES = [24, 16, 8] as const;

interface Field {
  label: string;
  value: string;
  copyable?: boolean;
  mono?: boolean;
}

export default function IPCalculator() {
  const t = useTranslations('utilikit.ipCalculator');
  const tc = useTranslations('utilikit.common');
  const cidrId = useId();

  const [ip, setIp] = useState('192.168.1.0');
  const [prefix, setPrefix] = useState('24');
  const [cidr, setCidr] = useState('');

  const prefixLength = parsePrefix(prefix);
  const result = useMemo(
    () => (prefixLength === null ? null : calculateSubnet(ip, prefixLength)),
    [ip, prefixLength]
  );

  const ipError = ip.trim() && parseIPv4(ip) === null ? t('errors.invalidIp') : undefined;
  const prefixError = prefix.trim() && prefixLength === null ? t('errors.invalidPrefix') : undefined;
  const cidrError = cidr.trim() && parseCidr(cidr) === null ? t('errors.invalidCidr') : undefined;

  const handleCidrChange = (value: string) => {
    setCidr(value);
    const parsed = parseCidr(value);
    if (parsed) {
      setIp(parsed.ip);
      setPrefix(String(parsed.prefix));
    }
  };

  const handleClear = () => {
    setIp('');
    setPrefix('');
    setCidr('');
  };

  return (
    <ToolLayout>
      <div className="space-y-4 sm:space-y-6">
        <Card>
          <CardTitle className="mb-4">{t('inputTitle')}</CardTitle>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="md:col-span-2">
                <Input
                  label={t('ipAddress')}
                  value={ip}
                  onChange={e => setIp(e.target.value)}
                  placeholder="192.168.1.0"
                  error={ipError}
                  spellCheck={false}
                  className="font-mono"
                />
              </div>
              <Input
                label={t('prefixLength')}
                value={prefix}
                onChange={e => setPrefix(e.target.value)}
                placeholder="24"
                inputMode="numeric"
                error={prefixError}
                className="font-mono"
              />
            </div>

            <div>
              <Label htmlFor={cidrId}>{t('pasteCidr')}</Label>
              <div className="flex items-start gap-2">
                <Input
                  id={cidrId}
                  value={cidr}
                  onChange={e => handleCidrChange(e.target.value)}
                  placeholder="192.168.1.0/24"
                  error={cidrError}
                  spellCheck={false}
                  className="font-mono"
                />
                <Button variant="outline" onClick={handleClear} className="shrink-0">
                  {tc('clear')}
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {result && <SubnetDetails subnet={result} />}

        <GuideCard>
          <CardTitle className="mb-3">{t('about.title')}</CardTitle>
          <dl className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
            <div>
              <dt className="font-medium text-ink">{t('cidrNotation')}</dt>
              <dd className="text-ink-muted">{t('about.cidr')}</dd>
            </div>
            <div>
              <dt className="font-medium text-ink">{t('about.commonSizes')}</dt>
              <dd className="text-ink-muted">
                <ul className="space-y-0.5">
                  {COMMON_PREFIXES.map(size => (
                    <li key={size}>{t('about.size', { prefix: size, count: 2 ** (32 - size) })}</li>
                  ))}
                </ul>
              </dd>
            </div>
          </dl>
        </GuideCard>
      </div>
    </ToolLayout>
  );
}

function SubnetDetails({ subnet }: { subnet: SubnetInfo }) {
  const t = useTranslations('utilikit.ipCalculator');
  const tc = useTranslations('utilikit.common');
  const locale = useLocale();

  const networkFields: Field[] = [
    { label: t('ipAddress'), value: subnet.ipAddress },
    { label: t('networkAddress'), value: subnet.networkAddress },
    subnet.broadcastAddress === null
      ? { label: t('broadcastAddress'), value: t('none'), copyable: false, mono: false }
      : { label: t('broadcastAddress'), value: subnet.broadcastAddress },
    { label: t('subnetMask'), value: subnet.subnetMask },
    { label: t('wildcardMask'), value: subnet.wildcardMask },
    { label: t('cidrNotation'), value: `${subnet.networkAddress}/${subnet.prefix}` },
  ];

  const hostFields: Field[] = [
    { label: t('firstHost'), value: subnet.firstHost },
    { label: t('lastHost'), value: subnet.lastHost },
    { label: t('totalAddresses'), value: subnet.totalAddresses.toLocaleString(locale), copyable: false },
    { label: t('usableHosts'), value: subnet.usableHosts.toLocaleString(locale), copyable: false },
    { label: t('ipClass'), value: subnet.ipClass, copyable: false },
    { label: tc('ipType'), value: t(`addressTypes.${subnet.addressType}`), copyable: false, mono: false },
  ];

  const binaryFields: Field[] = [
    { label: t('ipAddress'), value: subnet.ipBinary },
    { label: t('subnetMask'), value: subnet.maskBinary },
    { label: t('networkAddress'), value: subnet.networkBinary },
  ];

  return (
    <>
      <Card>
        <CardTitle className="mb-4">{t('networkInfo')}</CardTitle>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {networkFields.map(field => (
            <ResultField key={field.label} {...field} />
          ))}
        </div>
      </Card>

      <Card>
        <CardTitle className="mb-4">{t('hostInfo')}</CardTitle>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {hostFields.map(field => (
            <ResultField key={field.label} {...field} />
          ))}
        </div>
        {subnet.prefix >= 31 && (
          <Alert tone="info" className="mt-4">
            {t(subnet.prefix === 31 ? 'notes.pointToPoint' : 'notes.singleHost')}
          </Alert>
        )}
      </Card>

      <Card>
        <CardTitle className="mb-4">{tc('binary')}</CardTitle>
        <div className="space-y-3">
          {binaryFields.map(({ label, value }) => (
            <div key={label}>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-ink-muted">{label}</p>
                <CopyButton value={value} variant="ghost" />
              </div>
              <Well mono className="text-xs sm:text-sm">
                {value}
              </Well>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function ResultField({ label, value, copyable = true, mono = true }: Field) {
  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-sm font-medium text-ink-muted">{label}</p>
      <div className="flex items-start gap-2">
        <Well mono={mono} className="min-w-0 flex-1">
          {value}
        </Well>
        {copyable && <CopyButton value={value} />}
      </div>
    </div>
  );
}
