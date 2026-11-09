'use client';

import { useMemo, useRef, useState, useSyncExternalStore, type ChangeEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeftRight, Columns2, Rows2, Trash2, Upload } from 'lucide-react';
import { ToolLayout } from '@/modules/utilikit/components/tool-layout';
import { GuideCard } from '@/modules/utilikit/components/ui/guide-card';
import { CopyButton } from '@/modules/utilikit/components/ui/copy-button';
import { buildDiffRows, calculateDiffStats, diffTexts, toSplitRows, type DiffLine, type DiffRow } from '@/modules/utilikit/lib/diff-utils';
import { cn } from '@/lib/cn';
import { Alert, Button, Card, CardTitle, Segmented } from '@/components/ui';
import { Textarea } from '@/modules/utilikit/components/ui/fields';

const FILE_EXTENSIONS = ['.txt', '.json', '.md', '.js', '.ts', '.tsx', '.jsx', '.css', '.html', '.xml', '.yml', '.yaml'];
const OPTION_KEYS = ['lineNumbers', 'wordHighlighting', 'collapseUnchanged'] as const;
const STEPS = ['original', 'modified', 'compare', 'options'] as const;

const EXAMPLE_OLD = `function greet(name) {
  console.log("Hello, " + name);
  return "Hi!";
}

const user = "World";
greet(user);`;

const EXAMPLE_NEW = `function greet(name) {
  console.log(\`Hello, \${name}!\`);
  return \`Welcome, \${name}!\`;
}

const user = "Developer";
const message = greet(user);
console.log(message);`;

const LINE_STYLES: Record<DiffLine['type'], { sign: string; row?: string; marker?: string; word?: string }> = {
  unchanged: { sign: ' ' },
  removed: { sign: '-', row: 'diff-removed', marker: 'text-danger', word: 'rounded-sm bg-danger/20' },
  added: { sign: '+', row: 'diff-added', marker: 'text-success', word: 'rounded-sm bg-success/20' },
};

type View = 'split' | 'unified';

const WIDE_SCREEN = '(min-width: 768px)';

function subscribeToWidth(onChange: () => void) {
  const media = window.matchMedia(WIDE_SCREEN);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

const isWideScreen = () => window.matchMedia(WIDE_SCREEN).matches;
const isWideOnServer = () => true;
type Options = Record<(typeof OPTION_KEYS)[number], boolean>;

export default function TextDiff() {
  const t = useTranslations('utilikit.textDiff');
  const locale = useLocale();

  const [oldText, setOldText] = useState('');
  const [newText, setNewText] = useState('');
  const [chosenView, setView] = useState<View | null>(null);
  const wide = useSyncExternalStore(subscribeToWidth, isWideScreen, isWideOnServer);
  const view: View = chosenView ?? (wide ? 'split' : 'unified');
  const [options, setOptions] = useState<Options>({
    lineNumbers: true,
    wordHighlighting: true,
    collapseUnchanged: false,
  });

  const hasInput = oldText !== '' || newText !== '';
  const changes = useMemo(() => diffTexts(oldText, newText), [oldText, newText]);
  const stats = useMemo(() => calculateDiffStats(changes), [changes]);
  const rows = useMemo(
    () => buildDiffRows(changes, { highlightWords: options.wordHighlighting, collapseUnchanged: options.collapseUnchanged }),
    [changes, options.wordHighlighting, options.collapseUnchanged]
  );
  const numberFormat = useMemo(() => new Intl.NumberFormat(locale), [locale]);

  const tiles = [
    { key: 'linesAdded', count: stats.additions, tone: 'border-success/40 bg-success-soft' },
    { key: 'linesRemoved', count: stats.deletions, tone: 'border-danger/40 bg-danger-soft' },
    { key: 'totalLines', count: stats.totalLines, tone: 'border-line bg-canvas' },
  ] as const;

  const swapTexts = () => {
    setOldText(newText);
    setNewText(oldText);
  };

  const clearAll = () => {
    setOldText('');
    setNewText('');
  };

  const loadExample = () => {
    setOldText(EXAMPLE_OLD);
    setNewText(EXAMPLE_NEW);
  };

  return (
    <ToolLayout>
      <div className="mb-4 grid grid-cols-1 gap-4 sm:mb-6 sm:gap-6 lg:grid-cols-2">
        <TextPanel title={t('originalText')} placeholder={t('enterOriginal')} value={oldText} onChange={setOldText} />
        <TextPanel title={t('modifiedText')} placeholder={t('enterModified')} value={newText} onChange={setNewText} />
      </div>

      <Card className="mb-4 sm:mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={swapTexts} disabled={!hasInput}>
            <ArrowLeftRight size={16} />
            {t('swap')}
          </Button>
          <Button onClick={clearAll} variant="outline" disabled={!hasInput}>
            <Trash2 size={16} />
            {t('clearAll')}
          </Button>
          <Button onClick={loadExample} variant="outline">
            {t('loadExample')}
          </Button>
          <div className="flex flex-wrap gap-x-4 gap-y-2 sm:ml-auto">
            {OPTION_KEYS.map(key => (
              <label key={key} className="flex cursor-pointer items-center gap-2 text-sm text-ink min-h-10 sm:min-h-0">
                <input
                  type="checkbox"
                  checked={options[key]}
                  onChange={event => setOptions({ ...options, [key]: event.target.checked })}
                  className="h-4 w-4"
                />
                {t(key)}
              </label>
            ))}
          </div>
        </div>
      </Card>

      {hasInput && (
        <Card className="mb-4 sm:mb-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <CardTitle>{t('comparison')}</CardTitle>
            <Segmented
              size="sm"
              value={view}
              onChange={setView}
              ariaLabel={t('view')}
              options={[
                { value: 'split', label: t('sideBySide'), icon: Columns2 },
                { value: 'unified', label: t('unified'), icon: Rows2 },
              ]}
            />
          </div>
          <DiffView rows={rows} view={view} showLineNumbers={options.lineNumbers} />
        </Card>
      )}

      {stats.changes > 0 && (
        <Card className="mb-4 sm:mb-6">
          <CardTitle className="mb-3">{t('statistics')}</CardTitle>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {tiles.map(tile => (
              <div
                key={tile.key}
                className={cn('flex flex-col items-center justify-center rounded-lg border px-2 py-2.5 text-center', tile.tone)}
              >
                <span className="text-lg font-semibold tabular-nums text-ink">{numberFormat.format(tile.count)}</span>
                <span className="text-xs text-ink">{t(tile.key, { count: tile.count })}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {!hasInput && (
        <GuideCard>
          <CardTitle className="mb-3">{t('howToUse')}</CardTitle>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-ink-muted">
            {STEPS.map(step => (
              <li key={step}>{t(`steps.${step}`)}</li>
            ))}
          </ol>
          <p className="mt-3 text-sm text-ink-muted">
            {t.rich('supportedFormats', {
              formats: FILE_EXTENSIONS.join(', '),
              strong: chunks => <strong className="font-medium text-ink">{chunks}</strong>,
            })}
          </p>
        </GuideCard>
      )}
    </ToolLayout>
  );
}

interface TextPanelProps {
  title: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}

function TextPanel({ title, placeholder, value, onChange }: TextPanelProps) {
  const t = useTranslations('utilikit.textDiff');
  const fileInput = useRef<HTMLInputElement>(null);
  const [readFailed, setReadFailed] = useState(false);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      onChange(await file.text());
      setReadFailed(false);
    } catch (error) {
      console.error('Failed to read file:', error);
      setReadFailed(true);
    }
  };

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-3">
        <CardTitle>{title}</CardTitle>
        <div className="flex gap-2">
          <CopyButton value={value} variant="ghost" disabled={!value} />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileInput.current?.click()}
            title={t('loadFile')}
            aria-label={t('loadFile')}
            className="px-2.5"
          >
            <Upload size={15} />
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept={FILE_EXTENSIONS.join(',')}
            onChange={handleFile}
            className="hidden"
          />
        </div>
      </div>
      <Textarea
        value={value}
        onChange={event => {
          setReadFailed(false);
          onChange(event.target.value);
        }}
        placeholder={placeholder}
        aria-label={title}
        rows={12}
        className="font-mono sm:text-sm"
      />
      {readFailed && <Alert className="mt-3">{t('readFailed')}</Alert>}
    </Card>
  );
}

interface DiffViewProps {
  rows: DiffRow[];
  view: View;
  showLineNumbers: boolean;
}

function DiffView({ rows, view, showLineNumbers }: DiffViewProps) {
  const t = useTranslations('utilikit.textDiff');
  const splitRows = useMemo(() => (view === 'split' ? toSplitRows(rows) : []), [rows, view]);

  const collapsed = (count: number, key: number) => (
    <div key={key} className="border-y border-line bg-canvas px-3 py-1.5 text-center font-sans text-xs text-ink-muted">
      {t('unchangedLines', { count })}
    </div>
  );

  if (view === 'unified') {
    return (
      <div className="overflow-hidden rounded-lg border border-line font-mono text-xs text-ink sm:text-sm">
        {rows.map((row, index) =>
          row.type === 'collapsed' ? (
            collapsed(row.count, index)
          ) : (
            <LineView key={index} line={row} numbers={showLineNumbers ? [row.oldNumber, row.newNumber] : []} />
          )
        )}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-line font-mono text-xs text-ink sm:text-sm">
      <div className="grid grid-cols-2 border-b border-line bg-canvas font-sans text-sm font-medium">
        <div className="border-r border-line px-3 py-2">{t('original')}</div>
        <div className="px-3 py-2">{t('modified')}</div>
      </div>
      {splitRows.map((row, index) =>
        row.type === 'collapsed' ? (
          collapsed(row.count, index)
        ) : (
          <div key={index} className="grid grid-cols-2">
            {row.left ? (
              <LineView
                line={row.left}
                numbers={showLineNumbers ? [row.left.oldNumber] : []}
                className="border-r border-line"
              />
            ) : (
              <div className="border-r border-line bg-muted/50" />
            )}
            {row.right ? (
              <LineView line={row.right} numbers={showLineNumbers ? [row.right.newNumber] : []} />
            ) : (
              <div className="bg-muted/50" />
            )}
          </div>
        )
      )}
    </div>
  );
}

interface LineViewProps {
  line: DiffLine;
  numbers: (number | null)[];
  className?: string;
}

function LineView({ line, numbers, className }: LineViewProps) {
  const style = LINE_STYLES[line.type];

  return (
    <div className={cn('flex min-w-0', style.row, className)}>
      {numbers.map((value, index) => (
        <span
          key={index}
          className="w-10 shrink-0 select-none border-r border-line px-1.5 py-0.5 text-right tabular-nums text-ink-faint sm:w-12 sm:px-2"
        >
          {value}
        </span>
      ))}
      <span className={cn('w-6 shrink-0 select-none py-0.5 text-center', style.marker)}>{style.sign}</span>
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-all py-0.5 pr-2">
        {line.segments.length
          ? line.segments.map((segment, index) => (
              <span key={index} className={segment.changed ? style.word : undefined}>
                {segment.text}
              </span>
            ))
          : ' '}
      </span>
    </div>
  );
}
