'use client';

import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ToolLayout } from '@/modules/utilikit/components/tool-layout';
import { GuideCard } from '@/modules/utilikit/components/ui/guide-card';
import { CopyButton } from '@/modules/utilikit/components/ui/copy-button';
import { Well } from '@/modules/utilikit/components/ui/well';
import { highlightParts, REGEX_FLAGS, type RegexFlag, type RegexResult } from '@/modules/utilikit/lib/regex-tester';
import { cn } from '@/lib/cn';
import { Alert, Card, CardTitle, Input } from '@/components/ui';
import { Textarea } from '@/modules/utilikit/components/ui/fields';

const TIMEOUT = 1500;
const SAMPLE_PATTERN = '(?<user>[\\w.]+)@(?<domain>[\\w-]+\\.\\w+)';
const TOKENS = [
  ['.', 'any'],
  ['\\d \\w \\s', 'classes'],
  ['\\D \\W \\S', 'negated'],
  ['[abc] [^abc] [a-z]', 'set'],
  ['^ $', 'anchors'],
  ['\\b', 'boundary'],
  ['* + ?', 'quantifiers'],
  ['{2,5}', 'range'],
  ['*? +?', 'lazy'],
  ['(abc)', 'group'],
  ['(?<name>abc)', 'named'],
  ['(?:abc)', 'nonCapturing'],
  ['a|b', 'alternation'],
  ['(?=abc) (?!abc)', 'lookahead'],
  ['(?<=abc) (?<!abc)', 'lookbehind'],
  ['\\1 \\k<name>', 'backreference'],
] as const;
const REPLACE_TOKENS = [
  ['$1', 'group'],
  ['$<name>', 'named'],
  ['$&', 'match'],
  ['$$', 'dollar'],
] as const;

interface Request {
  pattern: string;
  flags: string;
  text: string;
  replacement: string;
}

type Outcome = Request & ({ result: RegexResult } | { timedOut: true });

function createWorker() {
  return new Worker(new URL('../../../../../modules/utilikit/lib/regex.worker.ts', import.meta.url), { type: 'module' });
}

function sameRequest(a: Request, b: Request) {
  return a.pattern === b.pattern && a.flags === b.flags && a.text === b.text && a.replacement === b.replacement;
}

function useRegex(request: Request) {
  const { pattern, flags, text, replacement } = request;
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const worker = useRef<Worker | null>(null);
  const busy = useRef(false);
  const lastId = useRef(0);

  useEffect(() => {
    if (!pattern) return;
    const id = ++lastId.current;
    const current = { pattern, flags, text, replacement };

    if (busy.current) {
      worker.current?.terminate();
      worker.current = null;
    }
    const instance = (worker.current ??= createWorker());
    busy.current = true;

    const timer = setTimeout(() => {
      instance.terminate();
      if (worker.current === instance) worker.current = null;
      busy.current = false;
      setOutcome({ ...current, timedOut: true });
    }, TIMEOUT);

    instance.onmessage = (event: MessageEvent<{ id: number; result: RegexResult }>) => {
      if (event.data.id !== id) return;
      clearTimeout(timer);
      busy.current = false;
      setOutcome({ ...current, result: event.data.result });
    };
    instance.postMessage({ id, pattern, flags, text, replacement: replacement || undefined });

    return () => clearTimeout(timer);
  }, [pattern, flags, text, replacement]);

  useEffect(() => () => worker.current?.terminate(), []);

  return pattern && outcome && sameRequest(outcome, request) ? outcome : null;
}

export default function RegexTester() {
  const t = useTranslations('utilikit.regexTester');
  const locale = useLocale();
  const [pattern, setPattern] = useState(SAMPLE_PATTERN);
  const [flags, setFlags] = useState<RegexFlag[]>(['g']);
  const [text, setText] = useState(() => t('sampleText'));
  const [replacement, setReplacement] = useState('');

  const flagString = REGEX_FLAGS.filter(flag => flags.includes(flag)).join('');
  const deferredText = useDeferredValue(text);
  const outcome = useRegex({
    pattern: useDeferredValue(pattern),
    flags: flagString,
    text: deferredText,
    replacement: useDeferredValue(replacement),
  });
  const result = outcome && 'result' in outcome ? outcome.result : null;
  const matches = result?.ok ? result.matches : [];
  const number = new Intl.NumberFormat(locale);

  const toggleFlag = (flag: RegexFlag) =>
    setFlags(current => (current.includes(flag) ? current.filter(item => item !== flag) : [...current, flag]));

  return (
    <ToolLayout>
      <div className="space-y-4 sm:space-y-6">
        <Card>
          <CardTitle className="mb-4">{t('expression')}</CardTitle>
          <div className="flex h-11 items-center rounded-lg border border-line-strong bg-raised font-mono shadow-xs transition-colors focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/15 sm:h-10">
            <span className="pl-3.5 text-ink-faint">/</span>
            <input
              value={pattern}
              onChange={event => setPattern(event.target.value)}
              placeholder={t('patternPlaceholder')}
              aria-label={t('expression')}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              className="h-full min-w-0 flex-1 bg-transparent px-1 text-base text-ink outline-hidden placeholder:font-sans placeholder:text-ink-faint sm:text-sm"
            />
            <span className="pr-3.5 text-ink-faint">/{flagString}</span>
          </div>

          <div role="group" aria-label={t('flags')} className="mt-3 grid grid-cols-2 gap-2 @lg:grid-cols-3 @4xl:grid-cols-6">
            {REGEX_FLAGS.map(flag => {
              const active = flags.includes(flag);
              return (
                <button
                  key={flag}
                  type="button"
                  aria-pressed={active}
                  title={t(`flagHints.${flag}`)}
                  onClick={() => toggleFlag(flag)}
                  className={cn(
                    'min-w-0 rounded-lg border-2 px-3 py-2 text-left text-sm transition-colors',
                    active ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-raised text-ink hover:border-accent'
                  )}
                >
                  <span className="font-mono font-semibold">{flag}</span>{' '}
                  <span className={active ? 'text-accent-ink/90' : 'text-ink-muted'}>{t(`flagNames.${flag}`)}</span>
                </button>
              );
            })}
          </div>

          {result && !result.ok && (
            <Alert className="mt-4" title={t('invalid')}>
              <span className="font-mono text-xs">{result.error}</span>
            </Alert>
          )}
          {outcome && 'timedOut' in outcome && <Alert className="mt-4">{t('timeout')}</Alert>}
        </Card>

        <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
          <Card className="min-w-0">
            <CardTitle className="mb-4">{t('testString')}</CardTitle>
            <Textarea
              value={text}
              onChange={event => setText(event.target.value)}
              placeholder={t('testPlaceholder')}
              aria-label={t('testString')}
              spellCheck={false}
              className="h-64 font-mono sm:text-sm"
            />
          </Card>

          <Card className="min-w-0">
            <div className="mb-4 flex items-center justify-between gap-3">
              <CardTitle>{t('result')}</CardTitle>
              {result?.ok && (
                <span className="text-sm font-medium text-ink-muted">{t('matchCount', { count: matches.length })}</span>
              )}
            </div>
            <Well className="h-64 overflow-auto whitespace-pre-wrap break-words font-mono leading-relaxed">
              {result?.ok
                ? highlightParts(deferredText, matches).map((part, index) =>
                    part.match === undefined ? (
                      <span key={index}>{part.text}</span>
                    ) : part.text ? (
                      <mark
                        key={index}
                        title={`#${part.match + 1}`}
                        className={cn(
                          'rounded-sm text-ink ring-1',
                          part.match % 2 === 0 ? 'bg-accent-soft ring-accent/50' : 'bg-warning-soft ring-warning/50'
                        )}
                      >
                        {part.text}
                      </mark>
                    ) : (
                      <span key={index} title={t('emptyMatch')} className="mx-px inline-block h-4 w-0.5 bg-accent align-middle" />
                    )
                  )
                : deferredText}
            </Well>
            {result?.ok && result.truncated && (
              <p className="mt-2 text-xs text-ink-muted">{t('truncated', { count: matches.length })}</p>
            )}
          </Card>
        </div>

        {matches.length > 0 && (
          <Card>
            <CardTitle className="mb-4">{t('matches')}</CardTitle>
            <div className="themed-scroll max-h-96 overflow-auto rounded-lg border border-line">
              <table className="w-full min-w-[34rem] text-left text-sm">
                <thead className="sticky top-0 bg-muted text-xs text-ink-muted">
                  <tr>
                    <th className="px-3 py-2 font-semibold">#</th>
                    <th className="px-3 py-2 font-semibold">{t('columns.match')}</th>
                    <th className="px-3 py-2 font-semibold">{t('columns.position')}</th>
                    <th className="px-3 py-2 font-semibold">{t('columns.groups')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {matches.map((match, index) => (
                    <tr key={index} className="align-top">
                      <td className="px-3 py-2 tabular-nums text-ink-muted">{number.format(index + 1)}</td>
                      <td className="px-3 py-2 font-mono break-all text-ink">
                        {match.value || <span className="font-sans text-ink-faint">{t('emptyMatch')}</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-ink-muted">
                        {number.format(match.start)}–{number.format(match.end)}
                      </td>
                      <td className="px-3 py-2">
                        {match.groups.length === 0 ? (
                          <span className="text-ink-faint">—</span>
                        ) : (
                          <ul className="flex flex-wrap gap-1.5">
                            {match.groups.map(group => (
                              <li key={group.index} className="rounded-md border border-line bg-canvas px-2 py-0.5 font-mono text-xs">
                                <span className="text-ink-muted">{group.name ?? group.index}:</span>{' '}
                                {group.value === undefined ? (
                                  <span className="font-sans text-ink-faint">{t('groupUnmatched')}</span>
                                ) : (
                                  <span className="break-all text-ink">{group.value}</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        <Card>
          <CardTitle className="mb-4">{t('replace')}</CardTitle>
          <Input
            value={replacement}
            onChange={event => setReplacement(event.target.value)}
            placeholder={t('replacementPlaceholder')}
            aria-label={t('replacement')}
            spellCheck={false}
            className="font-mono"
          />
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
            {REPLACE_TOKENS.map(([token, key]) => (
              <li key={key}>
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-ink">{token}</code> {t(`replaceTokens.${key}`)}
              </li>
            ))}
          </ul>
          {replacement && result?.ok && result.replaced !== undefined && (
            <div className="mt-4">
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-ink-muted">{t('replaced')}</p>
                <CopyButton value={result.replaced} />
              </div>
              <Well mono className="max-h-64 overflow-auto whitespace-pre-wrap">
                {result.replaced}
              </Well>
            </div>
          )}
        </Card>

        <GuideCard>
          <CardTitle className="mb-3">{t('cheatSheet')}</CardTitle>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {TOKENS.map(([token, key]) => (
              <div key={key} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                <dt className="whitespace-nowrap font-mono text-ink sm:w-40 sm:shrink-0">{token}</dt>
                <dd className="text-ink-muted">{t(`tokens.${key}`)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-sm text-ink-muted">{t('flavor')}</p>
        </GuideCard>
      </div>
    </ToolLayout>
  );
}
