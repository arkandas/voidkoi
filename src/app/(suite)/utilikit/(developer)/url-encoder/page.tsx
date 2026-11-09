'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link2, Lock, Unlock } from 'lucide-react';
import { ToolLayout } from '@/modules/utilikit/components/tool-layout';
import { GuideCard } from '@/modules/utilikit/components/ui/guide-card';
import { CopyButton } from '@/modules/utilikit/components/ui/copy-button';
import { Well } from '@/modules/utilikit/components/ui/well';
import {
  decodeURL,
  encodeURL,
  ENCODING_MODES,
  EncodingMode,
  parseURL,
  ParsedURL,
  URLCodingError,
} from '@/modules/utilikit/lib/url-encoder';
import { Alert, Button, Card, CardTitle, Segmented } from '@/components/ui';
import { Textarea } from '@/modules/utilikit/components/ui/fields';

type Action = 'encode' | 'decode';

const URL_PARTS = ['base', 'fragment'] as const;
const COLUMNS = ['parameter', 'encodedValue', 'decodedValue'] as const;

const EXAMPLE_GROUPS: { id: 'common' | 'reserved' | 'special'; chars: string[] }[] = [
  { id: 'common', chars: [' ', '"', '@'] },
  { id: 'reserved', chars: [':', '/', '?'] },
  { id: 'special', chars: ['#', '&', '='] },
];

export default function URLEncoder() {
  const t = useTranslations('utilikit.urlEncoder');
  const tc = useTranslations('utilikit.common');

  const [urlInput, setUrlInput] = useState('');
  const [parsed, setParsed] = useState<ParsedURL | null>(null);

  const [mode, setMode] = useState<EncodingMode>('component');
  const [inputText, setInputText] = useState('');
  const [output, setOutput] = useState<{ action: Action; value: string } | null>(null);
  const [error, setError] = useState<URLCodingError | null>(null);

  const clearURL = () => {
    setUrlInput('');
    setParsed(null);
  };

  const resetOutput = () => {
    setOutput(null);
    setError(null);
  };

  const changeMode = (next: EncodingMode) => {
    setMode(next);
    resetOutput();
  };

  const clearText = () => {
    setInputText('');
    resetOutput();
  };

  const run = (action: Action) => {
    const result = action === 'encode' ? encodeURL(inputText, mode) : decodeURL(inputText, mode);
    setOutput(result.ok ? { action, value: result.value } : null);
    setError(result.ok ? null : result.error);
  };

  const empty = <span className="font-sans italic text-ink-faint">{t('empty')}</span>;

  return (
    <ToolLayout>
      <Card className="mb-4 sm:mb-6">
        <CardTitle className="mb-4">
          <Link2 size={18} className="shrink-0" />
          {t('queryParameters')}
        </CardTitle>
        <div className="space-y-4">
          <Textarea
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            placeholder="https://example.com/page?name=John&age=30&city=New%20York"
            aria-label={t('urlToParse')}
            rows={3}
            spellCheck={false}
            className="font-mono"
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setParsed(parseURL(urlInput))} className="flex-1" disabled={!urlInput.trim()}>
              {t('parse')}
            </Button>
            <Button onClick={clearURL} variant="outline">
              {tc('clear')}
            </Button>
          </div>
        </div>

        {parsed && (
          <div className="mt-6 space-y-4">
            {URL_PARTS.filter(part => parsed[part]).map(part => (
              <div key={part}>
                <p className="mb-1.5 text-sm font-medium text-ink-muted">{t(`parts.${part}`)}</p>
                <div className="flex items-start gap-2">
                  <Well mono className="min-w-0 flex-1">
                    {parsed[part]}
                  </Well>
                  <CopyButton value={parsed[part]} />
                </div>
              </div>
            ))}

            {parsed.params.length > 0 ? (
              <div>
                <p className="mb-1.5 text-sm font-medium text-ink-muted">
                  {t('parameterCount', { count: parsed.params.length })}
                </p>
                <div className="overflow-x-auto rounded-lg border border-line">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-canvas">
                      <tr>
                        {COLUMNS.map(column => (
                          <th key={column} className="border-b border-line p-2 font-medium text-ink sm:p-3">
                            {t(`columns.${column}`)}
                          </th>
                        ))}
                        <th className="w-12 border-b border-line" />
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.params.map((param, index) => (
                        <tr key={index} className="border-b border-line last:border-b-0">
                          <td className="break-all p-2 font-mono text-ink sm:p-3">{param.decodedKey || empty}</td>
                          <td className="break-all p-2 font-mono text-ink-muted sm:p-3">{param.value || empty}</td>
                          <td className="break-all p-2 font-mono text-ink sm:p-3">{param.decodedValue || empty}</td>
                          <td className="p-2 text-center">
                            <CopyButton value={param.decodedValue} variant="ghost" disabled={!param.decodedValue} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-sm text-ink-muted">{t('noParameters')}</p>
            )}
          </div>
        )}
      </Card>

      <Card className="mb-4 sm:mb-6">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <CardTitle>{t('encodeDecode')}</CardTitle>
          <Segmented
            size="sm"
            value={mode}
            onChange={changeMode}
            ariaLabel={t('mode')}
            options={ENCODING_MODES.map(value => ({ value, label: t(`modes.${value}`) }))}
          />
        </div>
        <p className="mb-4 text-sm text-ink-muted">{t(`modeHints.${mode}`)}</p>
        <div className="space-y-4">
          <Textarea
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            placeholder={t('enterText')}
            aria-label={t('enterText')}
            rows={5}
            spellCheck={false}
            className="font-mono"
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => run('encode')} className="flex-1" disabled={!inputText}>
              <Lock size={16} />
              {t('encode')}
            </Button>
            <Button onClick={() => run('decode')} className="flex-1" disabled={!inputText}>
              <Unlock size={16} />
              {t('decode')}
            </Button>
            <Button onClick={clearText} variant="outline">
              {tc('clear')}
            </Button>
          </div>
          {error && <Alert>{t(`errors.${error}`)}</Alert>}
        </div>
      </Card>

      {output && (
        <Card className="mb-4 sm:mb-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <CardTitle>{t(`results.${output.action}`)}</CardTitle>
            <CopyButton value={output.value} label={tc('copy')} />
          </div>
          <Well mono className="whitespace-pre-wrap">
            {output.value}
          </Well>
        </Card>
      )}

      <GuideCard>
        <CardTitle className="mb-3">{t('about.title')}</CardTitle>
        <div className="space-y-3 text-sm text-ink-muted">
          <p>{t('about.description')}</p>
          <dl className="grid grid-cols-1 gap-3 pt-2 md:grid-cols-3">
            {EXAMPLE_GROUPS.map(({ id, chars }) => (
              <div key={id}>
                <dt className="mb-1 font-medium text-ink">{t(`about.groups.${id}`)}</dt>
                {chars.map(char => (
                  <dd key={char}>
                    {char === ' ' ? t('about.space') : char} → {encodeURIComponent(char)}
                  </dd>
                ))}
              </div>
            ))}
          </dl>
        </div>
      </GuideCard>
    </ToolLayout>
  );
}
