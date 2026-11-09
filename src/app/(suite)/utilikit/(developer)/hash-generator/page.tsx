'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { FileText, Upload } from 'lucide-react';
import { ToolLayout } from '@/modules/utilikit/components/tool-layout';
import { GuideCard } from '@/modules/utilikit/components/ui/guide-card';
import { CopyButton } from '@/modules/utilikit/components/ui/copy-button';
import { Dropzone } from '@/modules/utilikit/components/ui/dropzone';
import { Well } from '@/modules/utilikit/components/ui/well';
import { formatBytes } from '@/lib/format';
import { formatHashes, hashFile, hashText, HASH_ALGORITHMS, HASH_LABELS, HashResults } from '@/modules/utilikit/lib/hash-utils';
import { Alert, Button, Card, CardTitle, Segmented, Spinner } from '@/components/ui';
import { Textarea } from '@/modules/utilikit/components/ui/fields';

const MAX_FILE_SIZE = 100 * 1024 * 1024;
const DESCRIBED_ALGORITHMS = ['md5', 'sha1', 'sha256', 'sha512'] as const;

type Mode = 'text' | 'file';

export default function HashGenerator() {
  const t = useTranslations('utilikit.hashGenerator');
  const locale = useLocale();

  const [mode, setMode] = useState<Mode>('text');
  const [textInput, setTextInput] = useState('');
  const [hashes, setHashes] = useState<HashResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);

  const changeMode = (next: Mode) => {
    setMode(next);
    setHashes(null);
    setError('');
    setFile(null);
  };

  const handleTextHash = () => {
    setError('');
    setHashes(hashText(textInput));
  };

  const handleFile = async ([selected]: File[]) => {
    setHashes(null);

    if (selected.size > MAX_FILE_SIZE) {
      setFile(null);
      setError(t('fileTooLarge', { size: formatBytes(selected.size, locale), limit: formatBytes(MAX_FILE_SIZE, locale) }));
      return;
    }

    setError('');
    setLoading(true);
    setFile({ name: selected.name, size: selected.size });

    try {
      setHashes(await hashFile(selected));
    } catch {
      setError(t('readFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ToolLayout>
      <Segmented
        fullWidth
        value={mode}
        onChange={changeMode}
        ariaLabel={t('mode')}
        className="mb-6"
        options={[
          { value: 'text', label: t('hashText'), icon: FileText },
          { value: 'file', label: t('hashFile'), icon: Upload },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle className="mb-4">{t('input')}</CardTitle>

          {mode === 'text' ? (
            <div className="space-y-4">
              <Textarea
                value={textInput}
                onChange={e => setTextInput(e.target.value)}
                placeholder={t('enterText')}
                aria-label={t('enterText')}
                rows={10}
                spellCheck={false}
              />
              <Button onClick={handleTextHash} className="w-full" disabled={!textInput}>
                {t('generateHashes')}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <Dropzone onFiles={handleFile} title={t('clickToUpload')} hint={t('maxFileSize', { limit: formatBytes(MAX_FILE_SIZE, locale) })} disabled={loading} />

              {file && (
                <Well>
                  <p className="break-all font-medium">{file.name}</p>
                  <p className="mt-1 text-xs text-ink-muted">{formatBytes(file.size, locale)}</p>
                </Well>
              )}

              {error && <Alert>{error}</Alert>}
            </div>
          )}
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between gap-3">
            <CardTitle>{t('hashResults')}</CardTitle>
            {hashes && <CopyButton value={() => formatHashes(hashes)} label={t('copyAll')} variant="ghost" />}
          </div>

          {loading ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 text-ink-muted">
              <Spinner size={28} className="text-accent" />
              <p className="text-sm">{t('generating')}</p>
            </div>
          ) : hashes ? (
            <div className="space-y-4">
              {HASH_ALGORITHMS.map(algorithm => (
                <div key={algorithm}>
                  <p className="mb-1.5 text-sm font-medium text-ink-muted">{HASH_LABELS[algorithm]}</p>
                  <div className="flex items-start gap-2">
                    <Well mono className="min-w-0 flex-1 text-xs">
                      {hashes[algorithm]}
                    </Well>
                    <CopyButton value={hashes[algorithm]} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-64 items-center justify-center text-center text-sm text-ink-muted">
              <p>{t('resultsAppearHere')}</p>
            </div>
          )}
        </Card>
      </div>

      <GuideCard className="mt-4 sm:mt-6">
        <CardTitle className="mb-3">{t('algorithms')}</CardTitle>
        <dl className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
          {DESCRIBED_ALGORITHMS.map(algorithm => (
            <div key={algorithm}>
              <dt className="font-medium text-ink">{HASH_LABELS[algorithm]}</dt>
              <dd className="text-ink-muted">{t(`about.${algorithm}`)}</dd>
            </div>
          ))}
        </dl>
      </GuideCard>
    </ToolLayout>
  );
}
