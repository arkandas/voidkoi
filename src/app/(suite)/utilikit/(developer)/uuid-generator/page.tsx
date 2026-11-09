'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, RefreshCw } from 'lucide-react';
import { ToolLayout } from '@/modules/utilikit/components/tool-layout';
import { GuideCard } from '@/modules/utilikit/components/ui/guide-card';
import { CopyButton } from '@/modules/utilikit/components/ui/copy-button';
import { Well } from '@/modules/utilikit/components/ui/well';
import {
  clampBatchSize,
  generateMultipleUUIDs,
  generateUUID,
  MAX_BATCH_SIZE,
  UUID_VERSIONS,
  UUIDVersion,
} from '@/modules/utilikit/lib/uuid-utils';
import { cn } from '@/lib/cn';
import { Button, Card, CardTitle, Input } from '@/components/ui';

export default function UUIDGenerator() {
  const t = useTranslations('utilikit.uuidGenerator');
  const tc = useTranslations('utilikit.common');

  const [version, setVersion] = useState<UUIDVersion>('v7');
  const [uuid, setUuid] = useState('');
  const [batchCount, setBatchCount] = useState(5);
  const [batchUUIDs, setBatchUUIDs] = useState<string[]>([]);

  const changeVersion = (next: UUIDVersion) => {
    setVersion(next);
    setUuid(generateUUID(next));
  };

  return (
    <ToolLayout>
      <Card className="mb-4 sm:mb-6">
        <p id="uuid-version" className="mb-3 text-sm font-medium text-ink">
          {t('uuidVersion')}
        </p>
        <div role="group" aria-labelledby="uuid-version" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {UUID_VERSIONS.map(option => (
            <button
              key={option}
              type="button"
              aria-pressed={version === option}
              onClick={() => changeVersion(option)}
              className={cn(
                'rounded-lg border-2 p-3 font-medium transition-colors',
                version === option
                  ? 'border-accent bg-accent text-accent-ink'
                  : 'border-line bg-surface text-ink hover:border-accent'
              )}
            >
              <span className="mb-1 block font-semibold">{t(`versions.${option}.title`)}</span>
              <span className="block text-xs opacity-90">{t(`versions.${option}.description`)}</span>
            </button>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle className="mb-4">{t('singleUuid')}</CardTitle>
          <div className="space-y-4">
            {uuid ? <Well mono className="text-xs sm:text-sm">{uuid}</Well> : <Well className="text-ink-faint">{t('resultAppearsHere')}</Well>}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setUuid(generateUUID(version))} className="flex-1">
                <RefreshCw size={15} />
                {t('generateNew')}
              </Button>
              <CopyButton value={uuid} label={tc('copy')} size="md" disabled={!uuid} />
            </div>
          </div>
        </Card>

        <Card>
          <CardTitle className="mb-4">{t('batchGenerate')}</CardTitle>
          <div className="space-y-4">
            <Input
              type="number"
              label={t('numberOfUuids')}
              value={batchCount}
              onChange={e => setBatchCount(clampBatchSize(e.target.valueAsNumber))}
              min={1}
              max={MAX_BATCH_SIZE}
            />
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setBatchUUIDs(generateMultipleUUIDs(batchCount, version))} className="flex-1">
                <Plus size={15} />
                {t('generateCount', { count: batchCount })}
              </Button>
              {batchUUIDs.length > 0 && (
                <CopyButton value={() => batchUUIDs.join('\n')} label={t('copyAll')} size="md" />
              )}
            </div>
          </div>
        </Card>
      </div>

      {batchUUIDs.length > 0 && (
        <Card className="mt-4 sm:mt-6">
          <CardTitle className="mb-4">{t('generatedUuids', { count: batchUUIDs.length })}</CardTitle>
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {batchUUIDs.map(id => (
              <Well key={id} className="flex items-center justify-between gap-2 py-2 transition-colors hover:border-accent">
                <span className="min-w-0 break-all font-mono text-xs sm:text-sm">{id}</span>
                <CopyButton value={id} variant="ghost" />
              </Well>
            ))}
          </div>
        </Card>
      )}

      <GuideCard className="mt-4 sm:mt-6">
        <CardTitle className="mb-3">{t('aboutUuidVersions')}</CardTitle>
        <dl className="space-y-4 text-sm">
          {UUID_VERSIONS.map(option => (
            <div key={option}>
              <dt className="mb-1 font-semibold text-ink">{t(`about.${option}.title`)}</dt>
              <dd className="text-ink-muted">{t(`about.${option}.description`)}</dd>
            </div>
          ))}
        </dl>
      </GuideCard>
    </ToolLayout>
  );
}
