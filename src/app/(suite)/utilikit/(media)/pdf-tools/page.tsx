'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowDown, ArrowUp, Check, Download, FileText, Images, Merge, Scissors, Split, X } from 'lucide-react';
import { FileExpiry, JobFailedCard, JobProgressCard } from '@/modules/utilikit/components/job-status';
import { ToolLayout } from '@/modules/utilikit/components/tool-layout';
import { GuideCard } from '@/modules/utilikit/components/ui/guide-card';
import { Dropzone } from '@/modules/utilikit/components/ui/dropzone';
import { Label } from '@/modules/utilikit/components/ui/label';
import { formatBytes } from '@/lib/format';
import {
  IMAGE_DPIS,
  IMAGE_FORMATS,
  MAX_IMAGE_PAGES,
  MAX_MERGE_FILES,
  MAX_PDF_UPLOAD,
  PDF_MODES,
  SPLIT_MODES,
  type ImageDpi,
  type ImageFormat,
  type PdfMode,
  type SplitMode,
} from '@/modules/utilikit/lib/pdf-pages';
import { useErrorMessage } from '@/modules/utilikit/lib/api-error';
import { useServerJob } from '@/modules/utilikit/lib/use-server-job';
import { Alert, Button, Card, CardTitle, Input, Segmented, Spinner } from '@/components/ui';

const API = '/api/utilikit/pdf-tools';
const MODE_ICONS = { merge: Merge, extract: Scissors, split: Split, images: Images } as const;
const FORMAT_LABELS: Record<ImageFormat, string> = { png: 'PNG', jpeg: 'JPEG' };

const isPdf = (file: File) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

export default function PdfTools() {
  const t = useTranslations('utilikit.pdfTools');
  const tc = useTranslations('utilikit.common');
  const locale = useLocale();
  const apiError = useErrorMessage();
  const { job, secondsLeft, available, saving, saveError, start, save, reset } = useServerJob(API);

  const [mode, setMode] = useState<PdfMode>('merge');
  const [files, setFiles] = useState<File[]>([]);
  const [pages, setPages] = useState('');
  const [splitMode, setSplitMode] = useState<SplitMode>('every');
  const [format, setFormat] = useState<ImageFormat>('png');
  const [dpi, setDpi] = useState<ImageDpi>(150);
  const [fileError, setFileError] = useState<string | null>(null);

  const limit = formatBytes(MAX_PDF_UPLOAD, locale);
  const multiple = mode === 'merge';
  const selected = multiple ? files : files.slice(0, 1);

  const addFiles = (added: File[]) => {
    if (!added.every(isPdf)) {
      setFileError(t('invalidFile'));
      return;
    }
    const next = multiple ? [...files, ...added].slice(0, MAX_MERGE_FILES) : added.slice(0, 1);
    if (next.reduce((total, file) => total + file.size, 0) > MAX_PDF_UPLOAD) {
      setFileError(t('tooLarge', { limit }));
      return;
    }
    setFileError(null);
    setFiles(next);
  };

  const move = (index: number, offset: number) =>
    setFiles(current => {
      const next = [...current];
      [next[index], next[index + offset]] = [next[index + offset], next[index]];
      return next;
    });

  const run = () => {
    const body = new FormData();
    body.append('mode', mode);
    selected.forEach(file => body.append('file', file));
    body.append('pages', pages);
    body.append('split', splitMode);
    body.append('format', format);
    body.append('dpi', String(dpi));
    void start(body);
  };

  const startOver = () => {
    reset();
    setFiles([]);
    setPages('');
  };

  const ready = multiple ? selected.length >= 2 : selected.length === 1;
  const result = job.status === 'completed' ? job.result : null;
  const failure = job.status === 'failed' ? job : null;
  const pageCount = Number(failure?.result.pageCount ?? 0);

  const completedMessage = () => {
    if (!result) return '';
    if (mode === 'merge') return t('done.merge', { count: Number(result.pageCount ?? 0) });
    if (mode === 'extract') return t('done.extract', { count: Number(result.outputPages ?? 0) });
    if (mode === 'split') return t('done.split', { count: Number(result.fileCount ?? 0) });
    return t('done.images', { count: Number(result.fileCount ?? 0) });
  };

  return (
    <ToolLayout>
      <div className="space-y-4 sm:space-y-6">
        {job.status === 'idle' && (
          <Card>
            <Segmented
              value={mode}
              onChange={next => {
                setMode(next);
                setFileError(null);
              }}
              options={PDF_MODES.map(value => ({ value, label: t(`modes.${value}`), icon: MODE_ICONS[value] }))}
              ariaLabel={t('mode')}
            />

            <div className="mt-5 space-y-5">
              {(multiple || selected.length === 0) && (
                <Dropzone
                  onFiles={addFiles}
                  title={multiple ? (selected.length > 0 ? t('addMore') : t('dropMany')) : t('dropOne')}
                  hint={t('dropHint', { limit })}
                  accept="application/pdf,.pdf"
                  multiple={multiple}
                  icon={FileText}
                  className={selected.length > 0 ? 'min-h-0 py-5' : undefined}
                />
              )}
              {fileError && <Alert>{fileError}</Alert>}

              {selected.length > 0 && (
                <ol className="divide-y divide-line rounded-lg border border-line">
                  {selected.map((file, index) => (
                    <li key={`${file.name}-${index}`} className="flex items-center gap-2 px-3 py-2 text-sm">
                      {multiple && <span className="w-6 shrink-0 text-right tabular-nums text-ink-faint">{index + 1}</span>}
                      <FileText size={16} className="hidden shrink-0 text-ink-muted sm:block" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-ink">{file.name}</span>
                        <span className="block text-xs text-ink-muted">{formatBytes(file.size, locale)}</span>
                      </span>
                      {multiple && (
                        <>
                          <Button variant="ghost" size="sm" className="px-2" disabled={index === 0} onClick={() => move(index, -1)} aria-label={t('moveUp')} title={t('moveUp')}>
                            <ArrowUp size={15} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="px-2"
                            disabled={index === selected.length - 1}
                            onClick={() => move(index, 1)}
                            aria-label={t('moveDown')}
                            title={t('moveDown')}
                          >
                            <ArrowDown size={15} />
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="px-2"
                        onClick={() => setFiles(current => current.filter((_, position) => position !== index))}
                        aria-label={t('remove')}
                        title={t('remove')}
                      >
                        <X size={15} />
                      </Button>
                    </li>
                  ))}
                </ol>
              )}

              {mode === 'extract' && (
                <Input
                  label={t('pages')}
                  value={pages}
                  onChange={event => setPages(event.target.value)}
                  placeholder="1-3, 5, 8-"
                  aria-describedby="pages-hint"
                  spellCheck={false}
                />
              )}

              {mode === 'split' && (
                <div className="space-y-3">
                  <div>
                    <Label>{t('splitBy')}</Label>
                    <Segmented
                      value={splitMode}
                      onChange={setSplitMode}
                      options={SPLIT_MODES.map(value => ({ value, label: t(`splitModes.${value}`) }))}
                      ariaLabel={t('splitBy')}
                    />
                  </div>
                  {splitMode === 'ranges' && (
                    <Input
                      label={t('ranges')}
                      value={pages}
                      onChange={event => setPages(event.target.value)}
                      placeholder="1-3, 4-6, 7-"
                      aria-describedby="pages-hint"
                      spellCheck={false}
                    />
                  )}
                </div>
              )}

              {mode === 'images' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <Label>{t('format')}</Label>
                      <Segmented
                        value={format}
                        onChange={setFormat}
                        options={IMAGE_FORMATS.map(value => ({ value, label: FORMAT_LABELS[value] }))}
                        ariaLabel={t('format')}
                        fullWidth
                      />
                    </div>
                    <div>
                      <Label>{t('resolution')}</Label>
                      <Segmented
                        value={String(dpi)}
                        onChange={value => setDpi(Number(value) as ImageDpi)}
                        options={IMAGE_DPIS.map(value => ({ value: String(value), label: t('dpi', { value }) }))}
                        ariaLabel={t('resolution')}
                        fullWidth
                      />
                    </div>
                  </div>
                  <Input
                    label={t('pagesOptional')}
                    value={pages}
                    onChange={event => setPages(event.target.value)}
                    placeholder="1-3, 5, 8-"
                    aria-describedby="pages-hint"
                    spellCheck={false}
                  />
                  <p className="text-xs text-ink-muted">{t('maxPages', { dpi, count: MAX_IMAGE_PAGES[dpi] })}</p>
                </div>
              )}

              {(mode === 'extract' || mode === 'images' || (mode === 'split' && splitMode === 'ranges')) && (
                <p id="pages-hint" className="-mt-2 text-xs text-ink-muted">
                  {mode === 'split' ? t('rangesHint') : t('pagesHint')}
                </p>
              )}

              <Button onClick={run} className="w-full" size="lg" disabled={!ready || (mode === 'extract' && !pages.trim())}>
                {t(`run.${mode}`)}
              </Button>
            </div>
          </Card>
        )}

        {(job.status === 'uploading' || job.status === 'processing') && (
          <JobProgressCard
            title={job.status === 'uploading' ? tc('uploading') : t('processing')}
            progress={job.status === 'processing' ? job.progress : undefined}
          />
        )}

        {result && (
          <Card>
            <div className="flex flex-col items-center gap-3 py-2 text-center sm:py-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success-soft text-success">
                <Check size={32} />
              </div>
              <h3 className="text-xl font-semibold text-ink">{completedMessage()}</h3>
              <p className="max-w-full break-all text-sm text-ink-muted">
                {String(result.outputName)} · {formatBytes(Number(result.outputSize ?? 0), locale)}
              </p>
              <FileExpiry secondsLeft={secondsLeft} expired={t('expired')} />
              <div className="mt-3 flex flex-wrap justify-center gap-3">
                <Button onClick={() => save(String(result.outputName))} size="lg" disabled={saving || !available}>
                  {saving ? <Spinner size={16} className="text-current" /> : <Download size={16} />}
                  {tc('download')}
                </Button>
                <Button onClick={startOver} variant="outline" size="lg">
                  {t('startOver')}
                </Button>
              </div>
              {saveError && <Alert className="mt-2">{apiError(saveError)}</Alert>}
            </div>
          </Card>
        )}

        {failure && (
          <JobFailedCard
            title={t('failed')}
            error={failure.error}
            message={failure.error === 'pageOutOfRange' && pageCount > 0 ? t('pageOutOfRange', { count: pageCount }) : undefined}
            detail={failure.detail}
            onRetry={reset}
          />
        )}

        <GuideCard>
          <CardTitle className="mb-3">{t('about')}</CardTitle>
          <dl className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
            {PDF_MODES.map(value => (
              <div key={value}>
                <dt className="font-medium text-ink">{t(`modes.${value}`)}</dt>
                <dd className="text-ink-muted">{t(`modeHints.${value}`)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-sm text-ink-muted">{t('aboutText')}</p>
        </GuideCard>
      </div>
    </ToolLayout>
  );
}
