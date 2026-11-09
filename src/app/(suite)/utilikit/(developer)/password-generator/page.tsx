'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { RefreshCw, Shield } from 'lucide-react';
import { ToolLayout } from '@/modules/utilikit/components/tool-layout';
import { GuideCard } from '@/modules/utilikit/components/ui/guide-card';
import { CopyButton } from '@/modules/utilikit/components/ui/copy-button';
import { Label } from '@/modules/utilikit/components/ui/label';
import { Well } from '@/modules/utilikit/components/ui/well';
import {
  CHARACTER_TYPES,
  clampBatchSize,
  DEFAULT_PASSPHRASE_WORDS,
  DEFAULT_PASSWORD_OPTIONS,
  GeneratedPassword,
  generateMultiplePasswords,
  generatePassphrase,
  generatePassword,
  MAX_BATCH_SIZE,
  MAX_PASSPHRASE_WORDS,
  MIN_PASSPHRASE_WORDS,
  STRENGTH_LEVELS,
  StrengthLevel,
} from '@/modules/utilikit/lib/password-utils';
import { cn } from '@/lib/cn';
import { PasswordOptions } from '@/modules/utilikit/lib/types';
import { Alert, Button, Card, CardTitle, Input, Segmented } from '@/components/ui';

const MODES = ['single', 'batch', 'passphrase'] as const;
const OPTION_KEYS = [...CHARACTER_TYPES, 'excludeAmbiguous'] as const;
const TIPS = ['length', 'variety', 'reuse', 'manager', 'ambiguous'] as const;
const EFF_WORDLIST_URL = 'https://www.eff.org/dice';

const STRENGTH_STYLES: Record<StrengthLevel, { text: string; meter: string }> = {
  weak: { text: 'text-danger', meter: 'bg-danger' },
  fair: { text: 'text-warning', meter: 'bg-warning' },
  good: { text: 'text-success', meter: 'bg-success' },
  strong: { text: 'text-success', meter: 'bg-success' },
  veryStrong: { text: 'text-accent', meter: 'bg-accent' },
};

type Mode = (typeof MODES)[number];

function GeneratedResult({ result }: { result: GeneratedPassword }) {
  const t = useTranslations('utilikit.passwordGenerator');
  const style = STRENGTH_STYLES[result.strength];
  const level = STRENGTH_LEVELS.indexOf(result.strength);

  return (
    <>
      <div className="flex items-start gap-2">
        <Well mono className="min-w-0 flex-1 text-base sm:text-lg">
          {result.password}
        </Well>
        <CopyButton value={result.password} />
      </div>

      <div className="mt-3 grid grid-cols-5 gap-1" aria-hidden="true">
        {STRENGTH_LEVELS.map((item, index) => (
          <span key={item} className={cn('h-1.5 rounded-full', index <= level ? style.meter : 'bg-line')} />
        ))}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
        {[
          { id: 'strength', label: t('passwordStrength'), value: t(`strength.${result.strength}`), tone: style.text },
          { id: 'entropy', label: t('entropy'), value: t('entropyBits', { bits: result.entropy }) },
          { id: 'length', label: t('length'), value: result.password.length },
        ].map(stat => (
          <Well key={stat.id} className="flex min-w-0 flex-col items-center justify-center px-2 text-center">
            <p className={cn('text-base font-semibold sm:text-lg', stat.tone)}>{stat.value}</p>
            <p className="text-xs text-ink-muted">{stat.label}</p>
          </Well>
        ))}
      </div>
    </>
  );
}

export default function PasswordGenerator() {
  const t = useTranslations('utilikit.passwordGenerator');
  const tc = useTranslations('utilikit.common');

  const [mode, setMode] = useState<Mode>('single');
  const [options, setOptions] = useState<PasswordOptions>(DEFAULT_PASSWORD_OPTIONS);
  const [password, setPassword] = useState<GeneratedPassword | null>(null);
  const [passwords, setPasswords] = useState<GeneratedPassword[]>([]);
  const [batchCount, setBatchCount] = useState(5);
  const [wordCount, setWordCount] = useState(DEFAULT_PASSPHRASE_WORDS);
  const [passphrase, setPassphrase] = useState<GeneratedPassword | null>(null);

  const hasCharacters = CHARACTER_TYPES.some(type => options[type]);

  const updateOption = <K extends keyof PasswordOptions>(key: K, value: PasswordOptions[K]) => {
    setOptions(previous => ({ ...previous, [key]: value }));
  };

  return (
    <ToolLayout>
      <Segmented
        fullWidth
        value={mode}
        onChange={setMode}
        ariaLabel={t('mode')}
        className="mb-4 sm:mb-6"
        options={MODES.map(value => ({ value, label: t(`modes.${value}`) }))}
      />

      {mode !== 'passphrase' && (
        <Card className="mb-4 sm:mb-6">
          <CardTitle className="mb-4">{tc('options')}</CardTitle>
          <div className="space-y-4">
            <div>
              <Label htmlFor="password-length">{t('lengthValue', { length: options.length })}</Label>
              <input
                id="password-length"
                type="range"
                min={8}
                max={128}
                value={options.length}
                onChange={e => updateOption('length', e.target.valueAsNumber)}
                className="range"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
              {OPTION_KEYS.map(key => (
                <label key={key} className="flex cursor-pointer items-center gap-2 text-sm text-ink min-h-10 sm:min-h-0">
                  <input
                    type="checkbox"
                    checked={options[key]}
                    onChange={e => updateOption(key, e.target.checked)}
                    className="h-4 w-4"
                  />
                  {t(`options.${key}`)}
                </label>
              ))}
            </div>

            {!hasCharacters && <Alert tone="warning">{t('noCharacterTypes')}</Alert>}
          </div>
        </Card>
      )}

      {mode === 'single' && (
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <CardTitle>{t('generatedPassword')}</CardTitle>
            <Button onClick={() => setPassword(generatePassword(options))} disabled={!hasCharacters}>
              <RefreshCw size={15} />
              {tc('generate')}
            </Button>
          </div>

          {password && <GeneratedResult result={password} />}
        </Card>
      )}

      {mode === 'batch' && (
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <CardTitle>{t('multiplePasswords')}</CardTitle>
            <div className="flex items-center gap-2">
              <div className="w-20">
                <Input
                  type="number"
                  min={1}
                  max={MAX_BATCH_SIZE}
                  value={batchCount}
                  onChange={e => setBatchCount(clampBatchSize(e.target.valueAsNumber))}
                  aria-label={t('passwordCount')}
                />
              </div>
              <Button
                onClick={() => setPasswords(generateMultiplePasswords(batchCount, options))}
                disabled={!hasCharacters}
                className="whitespace-nowrap"
              >
                <RefreshCw size={15} />
                {t('generateCount', { count: batchCount })}
              </Button>
            </div>
          </div>

          {passwords.length > 0 && (
            <div className="space-y-2">
              {passwords.map((item, index) => (
                <Well key={index} className="flex items-center gap-2 py-2">
                  <span className="min-w-0 flex-1 break-all font-mono">{item.password}</span>
                  <span className={cn('shrink-0 text-xs font-medium', STRENGTH_STYLES[item.strength].text)}>
                    {t(`strength.${item.strength}`)}
                  </span>
                  <CopyButton value={item.password} variant="ghost" />
                </Well>
              ))}
            </div>
          )}
        </Card>
      )}

      {mode === 'passphrase' && (
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <CardTitle>{t('passphrase')}</CardTitle>
            <Button onClick={() => setPassphrase(generatePassphrase(wordCount))}>
              <RefreshCw size={15} />
              {tc('generate')}
            </Button>
          </div>

          <div className="mb-4">
            <Label htmlFor="passphrase-words">{t('wordCountValue', { count: wordCount })}</Label>
            <input
              id="passphrase-words"
              type="range"
              min={MIN_PASSPHRASE_WORDS}
              max={MAX_PASSPHRASE_WORDS}
              value={wordCount}
              onChange={e => setWordCount(e.target.valueAsNumber)}
              className="range"
            />
          </div>

          {passphrase && <GeneratedResult result={passphrase} />}

          <p className="mt-4 text-sm text-ink-muted">{t('passphraseDescription')}</p>
          <p className="mt-2 text-xs text-ink-muted">
            {t.rich('attribution', {
              link: chunks => (
                <a
                  href={EFF_WORDLIST_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-accent underline-offset-2 hover:underline"
                >
                  {chunks}
                </a>
              ),
            })}
          </p>
        </Card>
      )}

      <GuideCard className="mt-4 sm:mt-6">
        <CardTitle className="mb-3">
          <Shield size={18} className="text-accent" />
          {t('securityTips')}
        </CardTitle>
        <ul className="list-disc space-y-2 pl-5 text-sm text-ink-muted">
          {TIPS.map(tip => (
            <li key={tip}>{t(`tips.${tip}`)}</li>
          ))}
        </ul>
      </GuideCard>
    </ToolLayout>
  );
}
