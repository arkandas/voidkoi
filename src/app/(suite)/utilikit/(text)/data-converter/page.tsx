'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { saveAs } from 'file-saver';
import { useTranslations } from 'next-intl';
import { ArrowLeftRight, Download } from 'lucide-react';
import { CodeView } from '@/modules/utilikit/components/code-view';
import { ToolLayout } from '@/modules/utilikit/components/tool-layout';
import { GuideCard } from '@/modules/utilikit/components/ui/guide-card';
import { CopyButton } from '@/modules/utilikit/components/ui/copy-button';
import { Well } from '@/modules/utilikit/components/ui/well';
import {
  convertData,
  CSV_DELIMITERS,
  DATA_FORMATS,
  DEFAULT_DATA_OPTIONS,
  FILE_EXTENSIONS,
  type CsvDelimiter,
  type DataError,
  type DataFormat,
  type DataNote,
  type DataOptions,
} from '@/modules/utilikit/lib/data-convert';
import { Alert, Button, Card, CardTitle, Select } from '@/components/ui';
import { Textarea } from '@/modules/utilikit/components/ui/fields';

const LABELS: Record<DataFormat, string> = { json: 'JSON', yaml: 'YAML', toml: 'TOML', csv: 'CSV' };
const FORMAT_OPTIONS = DATA_FORMATS.map(value => ({ value, label: LABELS[value] }));
const DELIMITERS = ['auto', ...Object.keys(CSV_DELIMITERS)] as CsvDelimiter[];
const TIPS = ['csv', 'toml', 'yaml', 'privacy'] as const;

const SAMPLES: Record<DataFormat, string> = {
  json: `{
  "name": "utilikit",
  "version": "1.0.0",
  "server": {
    "host": "0.0.0.0",
    "port": 3000
  },
  "tools": [
    { "id": "json-formatter", "category": "developer", "browser": true },
    { "id": "video-converter", "category": "media", "browser": false }
  ]
}`,
  yaml: `name: utilikit
version: 1.0.0
server:
  host: 0.0.0.0
  port: 3000
tools:
  - id: json-formatter
    category: developer
    browser: true
  - id: video-converter
    category: media
    browser: false
`,
  toml: `name = "utilikit"
version = "1.0.0"

[server]
host = "0.0.0.0"
port = 3000

[[tools]]
id = "json-formatter"
category = "developer"
browser = true

[[tools]]
id = "video-converter"
category = "media"
browser = false
`,
  csv: `id,name,category,browser
json-formatter,JSON Formatter,developer,true
video-converter,Video Converter,media,false
qr-generator,QR Code Generator,media,true
`,
};

export default function DataConverter() {
  const t = useTranslations('utilikit.dataConverter');
  const tc = useTranslations('utilikit.common');

  const [from, setFrom] = useState<DataFormat>('json');
  const [to, setTo] = useState<DataFormat>('yaml');
  const [input, setInput] = useState('');
  const [options, setOptions] = useState<DataOptions>(DEFAULT_DATA_OPTIONS);
  const deferredInput = useDeferredValue(input);

  const result = useMemo(
    () => (deferredInput.trim() ? convertData(deferredInput, from, to, options) : null),
    [deferredInput, from, to, options]
  );
  const output = result?.ok ? result.text : '';
  const usesCsv = from === 'csv' || to === 'csv';

  const setOption = <K extends keyof DataOptions>(key: K, value: DataOptions[K]) =>
    setOptions(current => ({ ...current, [key]: value }));

  const swap = () => {
    setFrom(to);
    setTo(from);
    if (output) setInput(output);
  };

  const describeError = (error: DataError) => {
    if (error.reason !== 'syntax') return t(`errors.${error.reason}`);
    const format = LABELS[from];
    if (error.line !== undefined && error.column !== undefined) {
      return t('errors.syntaxAt', { format, line: error.line, column: error.column });
    }
    if (error.line !== undefined) return t('errors.syntaxLine', { format, line: error.line });
    return t('errors.syntax', { format });
  };

  const describeNote = (note: DataNote) => {
    switch (note.kind) {
      case 'multipleDocuments':
        return t('notes.multipleDocuments', { count: note.count });
      case 'wrapped':
        return t('notes.wrapped', { key: note.key });
      case 'nullsRemoved':
        return t('notes.nullsRemoved', { count: note.count });
      case 'flattened':
        return t('notes.flattened');
    }
  };

  const download = () =>
    saveAs(new Blob([output], { type: 'text/plain;charset=utf-8' }), `data.${FILE_EXTENSIONS[to]}`);

  return (
    <ToolLayout>
      <div className="space-y-4 sm:space-y-6">
        <Card>
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2 sm:gap-3">
            <Select label={t('from')} value={from} onChange={event => setFrom(event.target.value as DataFormat)} options={FORMAT_OPTIONS} />
            <Button onClick={swap} variant="outline" aria-label={t('swap')} title={t('swap')} className="h-11 px-3 sm:h-10">
              <ArrowLeftRight size={16} />
            </Button>
            <Select label={t('to')} value={to} onChange={event => setTo(event.target.value as DataFormat)} options={FORMAT_OPTIONS} />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select
              label={t('indentation')}
              value={String(options.indent)}
              onChange={event => setOption('indent', Number(event.target.value))}
              options={[2, 4].map(count => ({ value: String(count), label: t('spaces', { count }) }))}
              disabled={to !== 'json' && to !== 'yaml'}
            />
            <Select
              label={t('delimiter')}
              value={options.delimiter}
              onChange={event => setOption('delimiter', event.target.value as CsvDelimiter)}
              options={DELIMITERS.map(value => ({ value, label: t(`delimiters.${value}`) }))}
              disabled={!usesCsv}
            />
            <Toggle
              label={t('header')}
              checked={options.header}
              onChange={value => setOption('header', value)}
              disabled={from !== 'csv'}
            />
            <Toggle
              label={t('typed')}
              checked={options.typed}
              onChange={value => setOption('typed', value)}
              disabled={from !== 'csv'}
            />
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
          <Card className="min-w-0">
            <div className="mb-4 flex items-center justify-between gap-3">
              <CardTitle>{t('input', { format: LABELS[from] })}</CardTitle>
              <div className="flex gap-1">
                <Button onClick={() => setInput(SAMPLES[from])} variant="ghost" size="sm">
                  {t('loadSample')}
                </Button>
                {input && (
                  <Button onClick={() => setInput('')} variant="ghost" size="sm">
                    {tc('clear')}
                  </Button>
                )}
              </div>
            </div>
            <Textarea
              value={input}
              onChange={event => setInput(event.target.value)}
              placeholder={t('placeholder', { format: LABELS[from] })}
              aria-label={t('input', { format: LABELS[from] })}
              spellCheck={false}
              className="h-96 font-mono sm:text-sm"
              error={result && !result.ok ? describeError(result.error) : undefined}
            />
            {result && !result.ok && result.error.reason === 'syntax' && (
              <p className="mt-1 break-all font-mono text-xs text-ink-muted">{result.error.message}</p>
            )}
          </Card>

          <Card className="min-w-0">
            <div className="mb-4 flex items-center justify-between gap-3">
              <CardTitle>{t('output', { format: LABELS[to] })}</CardTitle>
              {output && (
                <div className="flex gap-1">
                  <CopyButton value={output} label={tc('copy')} variant="ghost" />
                  <Button onClick={download} variant="ghost" size="sm">
                    <Download size={15} />
                    {tc('download')}
                  </Button>
                </div>
              )}
            </div>
            <Well className="h-96 overflow-hidden p-0 font-mono">
              {output ? (
                <CodeView language={to}>{output}</CodeView>
              ) : (
                <p className="px-3.5 py-3 text-ink-faint">{t('outputPlaceholder')}</p>
              )}
            </Well>
            {result?.ok &&
              result.notes.map(note => (
                <Alert key={note.kind} tone="info" className="mt-3">
                  {describeNote(note)}
                </Alert>
              ))}
          </Card>
        </div>

        <GuideCard>
          <CardTitle className="mb-3">{t('about')}</CardTitle>
          <dl className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
            {TIPS.map(tip => (
              <div key={tip}>
                <dt className="font-medium text-ink">{t(`tips.${tip}.title`)}</dt>
                <dd className="text-ink-muted">{t(`tips.${tip}.text`)}</dd>
              </div>
            ))}
          </dl>
        </GuideCard>
      </div>
    </ToolLayout>
  );
}

interface ToggleProps {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}

function Toggle({ label, checked, disabled, onChange }: ToggleProps) {
  return (
    <label
      className={`flex h-11 items-center justify-between gap-3 self-end rounded-lg border border-line bg-canvas px-3 sm:h-10 ${
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
      }`}
    >
      <span className="min-w-0 truncate text-sm font-medium text-ink">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={event => onChange(event.target.checked)}
        className="h-4 w-4 shrink-0"
      />
    </label>
  );
}
