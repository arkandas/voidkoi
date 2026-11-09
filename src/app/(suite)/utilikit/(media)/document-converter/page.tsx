'use client';

import { useEffect, useId, useState } from 'react';
import { saveAs } from 'file-saver';
import { useLocale, useTranslations } from 'next-intl';
import { AlertCircle, Check, Clock, Download, FileText, X } from 'lucide-react';
import { ToolLayout } from '@/modules/utilikit/components/tool-layout';
import { Dropzone } from '@/modules/utilikit/components/ui/dropzone';
import { Progress } from '@/modules/utilikit/components/ui/progress';
import { Well } from '@/modules/utilikit/components/ui/well';
import {
  detectDocumentFormat,
  DOCUMENT_FORMATS,
  DOCUMENT_SIZE_LIMIT,
  isDocumentFormat,
  isPdfEngine,
  PDF_ENGINES,
  type DocumentFormat,
  type PdfEngine,
} from '@/modules/utilikit/lib/document-formats';
import { downloadFilename } from '@/modules/utilikit/lib/download-filename';
import { formatBytes, formatDuration } from '@/lib/format';
import { readErrorCode, useErrorMessage } from '@/modules/utilikit/lib/api-error';
import { Alert, Button, Card, CardTitle, Select, Spinner } from '@/components/ui';

const API = '/api/utilikit/document-convert';
const FORMATS = Object.keys(DOCUMENT_FORMATS).filter(isDocumentFormat);
const ACCEPT = Object.values(DOCUMENT_FORMATS)
  .flatMap(format => format.extensions)
  .join(',');
const STANDALONE_FORMATS: readonly DocumentFormat[] = ['html', 'markdown'];
const PDF_ENGINE_LABELS: Record<PdfEngine, string> = {
  typst: 'Typst',
};
const POLL_INTERVAL = 1000;
const FILE_LIFETIME = 5 * 60 * 1000;

type EngineChoice = PdfEngine | 'auto';

interface Source {
  file: File;
  format: DocumentFormat;
}

type Job =
  | { status: 'idle' }
  | { status: 'uploading' }
  | { status: 'processing'; progress: number }
  | { status: 'completed'; inputSize: number; outputSize: number; pdfEngine: PdfEngine | null; expiresAt: number }
  | { status: 'failed'; error: string; detail?: string };

interface JobStatus {
  status: 'processing' | 'completed' | 'failed';
  progress?: number;
  error?: string;
  detail?: string;
  inputSize?: number;
  outputSize?: number;
  pdfEngine?: string;
}

async function fetchJobStatus(jobId: string): Promise<JobStatus | null> {
  try {
    const response = await fetch(`${API}?jobId=${encodeURIComponent(jobId)}`);
    return response.ok ? await response.json() : { status: 'failed', error: await readErrorCode(response) };
  } catch (error) {
    console.error('Status check error:', error);
    return null;
  }
}

export default function DocumentConverter() {
  const t = useTranslations('utilikit.documentConverter');
  const locale = useLocale();
  const apiError = useErrorMessage();
  const engineHintId = useId();

  const [source, setSource] = useState<Source | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [outputFormat, setOutputFormat] = useState<DocumentFormat>('docx');
  const [standalone, setStandalone] = useState(true);
  const [toc, setToc] = useState(false);
  const [pdfEngine, setPdfEngine] = useState<EngineChoice>('auto');
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<Job>({ status: 'idle' });
  const [now, setNow] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const limit = formatBytes(DOCUMENT_SIZE_LIMIT, locale);
  const outputs = FORMATS.filter(format => format !== source?.format);
  const target = outputs.includes(outputFormat) ? outputFormat : outputs[0];
  const progress = job.status === 'processing' ? job.progress : 0;
  const phase = job.status === 'uploading' ? t('uploading') : t('converting');
  const secondsLeft = job.status === 'completed' ? Math.max(0, Math.ceil((job.expiresAt - now) / 1000)) : 0;
  const counting = secondsLeft > 0;

  useEffect(() => {
    if (!jobId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      const status = await fetchJobStatus(jobId);
      if (!active) return;

      if (status?.status === 'completed') {
        const completedAt = Date.now();
        setNow(completedAt);
        setJob({
          status: 'completed',
          inputSize: status.inputSize ?? 0,
          outputSize: status.outputSize ?? 0,
          pdfEngine: isPdfEngine(status.pdfEngine) ? status.pdfEngine : null,
          expiresAt: completedAt + FILE_LIFETIME,
        });
      } else if (status?.status === 'failed') {
        setJob({ status: 'failed', error: status.error ?? 'conversionFailed', detail: status.detail });
      } else {
        if (status) setJob({ status: 'processing', progress: status.progress ?? 0 });
        timer = setTimeout(poll, POLL_INTERVAL);
      }
    };

    poll();

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [jobId]);

  useEffect(() => {
    if (!counting) return;
    const tick = () => setNow(Date.now());
    const timer = setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [counting]);

  const handleFile = ([selected]: File[]) => {
    const format = detectDocumentFormat(selected.name, selected.type);

    if (selected.size > DOCUMENT_SIZE_LIMIT) {
      setFileError(t('errors.fileTooLarge', { size: formatBytes(selected.size, locale), limit }));
    } else if (!format) {
      setFileError(t('errors.unsupportedFormat'));
    } else {
      setFileError(null);
      setSource({ file: selected, format });
    }
  };

  const handleConvert = async () => {
    if (!source) return;
    setJob({ status: 'uploading' });
    setSaveError(null);

    const params = new URLSearchParams({
      name: source.file.name,
      inputFormat: source.format,
      outputFormat: target,
      standalone: String(standalone),
      toc: String(toc),
    });
    if (target === 'pdf' && pdfEngine !== 'auto') params.append('pdfEngine', pdfEngine);

    try {
      const response = await fetch(`${API}?${params}`, { method: 'POST', body: source.file });

      if (!response.ok) {
        setJob({ status: 'failed', error: await readErrorCode(response) });
        return;
      }

      const data: { jobId: string } = await response.json();
      setJob({ status: 'processing', progress: 0 });
      setJobId(data.jobId);
    } catch (error) {
      console.error('Conversion error:', error);
      setJob({ status: 'failed', error: 'uploadFailed' });
    }
  };

  const handleSave = async () => {
    if (!jobId || job.status !== 'completed') return;
    setSaving(true);
    setSaveError(null);

    try {
      const response = await fetch(`${API}/download?jobId=${encodeURIComponent(jobId)}`);

      if (!response.ok) {
        setSaveError(await readErrorCode(response));
        return;
      }

      const fallback = `converted-document${DOCUMENT_FORMATS[target].extensions[0]}`;
      saveAs(await response.blob(), downloadFilename(response.headers.get('Content-Disposition'), fallback));
    } catch (error) {
      console.error('Save error:', error);
      setSaveError('downloadFailed');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = () => {
    setJobId(null);
    setJob({ status: 'idle' });
    setSaveError(null);
  };

  const handleReset = () => {
    handleEdit();
    setSource(null);
  };

  return (
    <ToolLayout>
      {!source && (
        <Card>
          <Dropzone onFiles={handleFile} title={t('dropDocument')} hint={t('supportedFormats', { limit })} accept={ACCEPT} />
          {fileError && <Alert className="mt-4">{fileError}</Alert>}
        </Card>
      )}

      {source && job.status === 'idle' && (
        <div className="space-y-4 sm:space-y-6">
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-all font-semibold text-ink">{source.file.name}</p>
                <p className="mt-1 text-sm text-ink-muted">
                  {formatBytes(source.file.size, locale)} · {DOCUMENT_FORMATS[source.format].displayName}
                </p>
              </div>
              <Button onClick={handleReset} variant="ghost" size="sm" aria-label={t('removeFile')} title={t('removeFile')}>
                <X size={16} />
              </Button>
            </div>
            {source.format === 'pdf' && (
              <Alert tone="warning" className="mt-4">
                {t('pdfNote')}
              </Alert>
            )}
          </Card>

          <Card>
            <CardTitle className="mb-4">{t('conversionSettings')}</CardTitle>
            <div className="space-y-4">
              <Select
                label={t('outputFormat')}
                value={target}
                onChange={e => isDocumentFormat(e.target.value) && setOutputFormat(e.target.value)}
                options={outputs.map(format => ({ value: format, label: DOCUMENT_FORMATS[format].displayName }))}
              />

              {STANDALONE_FORMATS.includes(target) && (
                <label className="flex cursor-pointer items-center gap-2 text-sm text-ink min-h-10 sm:min-h-0">
                  <input
                    type="checkbox"
                    checked={standalone}
                    onChange={e => setStandalone(e.target.checked)}
                    className="h-4 w-4 shrink-0"
                  />
                  {t('standalone')}
                </label>
              )}

              <label className="flex cursor-pointer items-center gap-2 text-sm text-ink min-h-10 sm:min-h-0">
                <input type="checkbox" checked={toc} onChange={e => setToc(e.target.checked)} className="h-4 w-4 shrink-0" />
                {t('generateToc')}
              </label>

              {target === 'pdf' && (
                <div>
                  <Select
                    label={t('pdfEngine')}
                    value={pdfEngine}
                    onChange={e => setPdfEngine(isPdfEngine(e.target.value) ? e.target.value : 'auto')}
                    aria-describedby={engineHintId}
                    options={[
                      { value: 'auto', label: t('automatic') },
                      ...PDF_ENGINES.map(engine => ({ value: engine, label: PDF_ENGINE_LABELS[engine] })),
                    ]}
                  />
                  <p id={engineHintId} className="mt-1.5 text-xs text-ink-muted">
                    {t('pdfEngineHint')}
                  </p>
                </div>
              )}
            </div>

            <Button onClick={handleConvert} className="mt-6 w-full" size="lg">
              <FileText size={16} />
              {t('convertDocument')}
            </Button>
          </Card>
        </div>
      )}

      {(job.status === 'uploading' || job.status === 'processing') && (
        <Card>
          <div className="flex flex-col items-center gap-3 py-4 text-center sm:py-8">
            <Spinner size={40} className="text-accent" />
            <h3 className="text-xl font-semibold text-ink">{phase}</h3>
            <p className="text-sm text-ink-muted">
              {progress > 0 ? t('progress', { value: progress / 100 }) : t('pleaseWait')}
            </p>
            <Progress value={progress} label={phase} className="max-w-md" />
          </div>
        </Card>
      )}

      {job.status === 'completed' && (
        <Card>
          <div className="flex flex-col items-center gap-3 py-4 text-center sm:py-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success-soft text-success">
              <Check size={32} />
            </div>
            <h3 className="text-xl font-semibold text-ink">{t('conversionComplete')}</h3>
            <p className="text-ink-muted">{t('successMessage')}</p>
            {job.pdfEngine && (
              <p className="text-sm text-ink-muted">{t('engineUsed', { engine: PDF_ENGINE_LABELS[job.pdfEngine] })}</p>
            )}
            {counting ? (
              <p className="flex items-center gap-2 rounded-lg bg-accent-soft px-4 py-2 text-sm font-semibold text-accent">
                <Clock size={16} className="shrink-0" />
                {t('fileAvailable', { time: formatDuration(secondsLeft) })}
              </p>
            ) : (
              <p className="flex items-center gap-2 rounded-lg bg-danger-soft px-4 py-2 text-sm font-semibold text-danger">
                <AlertCircle size={16} className="shrink-0" />
                {t('fileExpired')}
              </p>
            )}
            {job.outputSize > 0 && (
              <dl className="mt-2 grid w-full max-w-md grid-cols-2 gap-3">
                {(
                  [
                    ['originalSize', job.inputSize],
                    ['convertedSize', job.outputSize],
                  ] as const
                ).map(([key, size]) => (
                  <Well key={key}>
                    <dt className="text-xs text-ink-muted">{t(key)}</dt>
                    <dd className="mt-1 text-lg font-semibold">{formatBytes(size, locale)}</dd>
                  </Well>
                ))}
              </dl>
            )}
            <div className="mt-3 flex flex-wrap justify-center gap-3">
              <Button onClick={handleSave} size="lg" disabled={saving || !counting}>
                {saving ? <Spinner size={16} className="text-current" /> : <Download size={16} />}
                {t('downloadDocument')}
              </Button>
              <Button onClick={handleReset} variant="outline" size="lg">
                {t('convertAnother')}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {job.status === 'completed' && saveError && <Alert className="mt-4 sm:mt-6">{apiError(saveError)}</Alert>}

      {job.status === 'failed' && (
        <Card className="border-danger/40">
          <div className="flex flex-col items-center gap-3 py-4 text-center sm:py-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-danger-soft text-danger">
              <AlertCircle size={32} />
            </div>
            <h3 className="text-xl font-semibold text-ink">{t('conversionFailed')}</h3>
            <p className="text-ink-muted">{apiError(job.error)}</p>
            {job.detail && <p className="max-w-xl font-mono text-xs text-ink-faint wrap-anywhere">{job.detail}</p>}
            <div className="mt-3 flex flex-wrap justify-center gap-3">
              <Button onClick={handleEdit} variant="outline">
                {t('changeSettings')}
              </Button>
              <Button onClick={handleReset} variant="outline">
                {t('tryAnotherFile')}
              </Button>
            </div>
          </div>
        </Card>
      )}
    </ToolLayout>
  );
}
