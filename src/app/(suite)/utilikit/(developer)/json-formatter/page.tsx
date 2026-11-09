'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { CodeView } from '@/modules/utilikit/components/code-view';
import { ToolLayout } from '@/modules/utilikit/components/tool-layout';
import { GuideCard } from '@/modules/utilikit/components/ui/guide-card';
import { CopyButton } from '@/modules/utilikit/components/ui/copy-button';
import { Well } from '@/modules/utilikit/components/ui/well';
import {
  formatJSON,
  minifyJSON,
  sortJSONKeys,
  validateJSON,
  type JsonError,
  type JsonOutputResult,
  type JsonValidation,
} from '@/modules/utilikit/lib/json-utils';
import { Button, Card, CardTitle, Select } from '@/components/ui';
import { Textarea } from '@/modules/utilikit/components/ui/fields';

const INDENTS = { '2': 2, '4': 4, '\t': '\t' } as const;
type Indent = keyof typeof INDENTS;

const ACTIONS = ['format', 'minify', 'sortKeys', 'validate'] as const;
type Action = (typeof ACTIONS)[number];

const SAMPLE = `{
  "name": "John Doe",
  "age": 30,
  "email": "john@example.com",
  "address": {
    "street": "123 Main St",
    "city": "New York",
    "country": "USA"
  },
  "hobbies": ["reading", "coding", "gaming"]
}`;

export default function JSONFormatter() {
  const t = useTranslations('utilikit.jsonFormatter');
  const tc = useTranslations('utilikit.common');

  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [indent, setIndent] = useState<Indent>('2');
  const [status, setStatus] = useState<JsonValidation | null>(null);

  const show = (result: JsonOutputResult) => {
    setOutput(result.valid ? result.output : '');
    setStatus(result.valid ? { valid: true } : result);
  };

  const run: Record<Action, () => void> = {
    format: () => show(formatJSON(input, INDENTS[indent])),
    minify: () => show(minifyJSON(input)),
    sortKeys: () => show(sortJSONKeys(input, INDENTS[indent])),
    validate: () => {
      setOutput('');
      setStatus(validateJSON(input));
    },
  };

  const changeInput = (next: string) => {
    setInput(next);
    setStatus(null);
  };

  const clear = () => {
    changeInput('');
    setOutput('');
  };

  const describeError = (error: JsonError) => {
    if (error.reason === 'tooLarge') return t('tooLarge');
    if (error.line !== undefined && error.column !== undefined) {
      return t('invalidJsonAt', { line: error.line, column: error.column });
    }
    return t('invalidJson');
  };

  return (
    <ToolLayout>
      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
        <Card className="min-w-0">
          <div className="mb-4 flex items-center justify-between gap-3">
            <CardTitle>{t('inputJson')}</CardTitle>
            <Button onClick={() => changeInput(SAMPLE)} size="sm" variant="ghost">
              {t('loadSample')}
            </Button>
          </div>
          <Textarea
            value={input}
            onChange={e => changeInput(e.target.value)}
            placeholder={t('pasteJson')}
            aria-label={t('inputJson')}
            spellCheck={false}
            className="h-96 font-mono sm:text-sm"
            error={status?.valid === false ? describeError(status.error) : undefined}
          />
          {status?.valid === false && (
            <p className="mt-1 break-all font-mono text-xs text-ink-muted">{status.error.message}</p>
          )}
          {status?.valid && (
            <p className="mt-2 flex items-center gap-2 text-sm font-medium text-success">
              <Check size={16} className="shrink-0" />
              {t('validJson')}
            </p>
          )}
        </Card>

        <Card className="min-w-0">
          <div className="mb-4 flex items-center justify-between gap-3">
            <CardTitle>{tc('output')}</CardTitle>
            {output && <CopyButton value={output} label={tc('copy')} variant="ghost" />}
          </div>
          <Well className="h-96 overflow-hidden p-0 font-mono">
            {output ? (
              <CodeView language="json">{output}</CodeView>
            ) : (
              <p className="px-3.5 py-3 text-ink-faint">{t('outputPlaceholder')}</p>
            )}
          </Well>
        </Card>
      </div>

      <Card className="mt-4 sm:mt-6">
        <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2">
          <Select
            label={t('indentation')}
            value={indent}
            onChange={e => setIndent(e.target.value as Indent)}
            options={[
              { value: '2', label: t('spaces', { count: 2 }) },
              { value: '4', label: t('spaces', { count: 4 }) },
              { value: '\t', label: t('tab') },
            ]}
          />
          <div className="flex flex-wrap items-end gap-2">
            {ACTIONS.map(action => (
              <Button
                key={action}
                onClick={run[action]}
                variant={action === 'format' ? 'default' : 'outline'}
                disabled={!input.trim()}
                className="flex-1 whitespace-nowrap"
              >
                {t(action)}
              </Button>
            ))}
            <Button onClick={clear} variant="ghost" className="whitespace-nowrap">
              {tc('clear')}
            </Button>
          </div>
        </div>
      </Card>

      <GuideCard className="mt-4 sm:mt-6">
        <CardTitle className="mb-3">{t('features')}</CardTitle>
        <dl className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
          {ACTIONS.map(action => (
            <div key={action}>
              <dt className="font-medium text-ink">{t(action)}</dt>
              <dd className="text-ink-muted">{t(`about.${action}`)}</dd>
            </div>
          ))}
        </dl>
      </GuideCard>
    </ToolLayout>
  );
}
