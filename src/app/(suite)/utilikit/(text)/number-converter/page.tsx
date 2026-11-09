'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ToolLayout } from '@/modules/utilikit/components/tool-layout';
import { GuideCard } from '@/modules/utilikit/components/ui/guide-card';
import { CopyButton } from '@/modules/utilikit/components/ui/copy-button';
import { Well } from '@/modules/utilikit/components/ui/well';
import {
  ASCII_MAX,
  BASE_FIELDS,
  BIT_WIDTHS,
  BitWidth,
  COMPLEMENT_FIELDS,
  describeCodePoint,
  Field,
  FLOAT_FIELDS,
  FLOAT_WIDTHS,
  formatCodePoint,
  formatField,
  parseField,
  RADIX,
  splitFloatBits,
} from '@/modules/utilikit/lib/number-converter';
import { Button, Card, CardTitle, Input, Select } from '@/components/ui';

const FLOAT_PRECISION = { float32: 'singlePrecision', float64: 'doublePrecision' } as const;
const COMPLEMENT_NOTES = ['negate', 'example', 'note'] as const;
const EXAMPLES = [
  { id: 'decimal', result: 'Hex: 64, Oct: 144, Bin: 1100100' },
  { id: 'ascii', result: 'Dec: 65, Hex: 41, Bin: 1000001' },
  { id: 'twos', result: '-5 = 11111011, 5 = 00000101' },
] as const;

interface Source {
  field: Field;
  text: string;
}

interface FieldView {
  text: string;
  error?: string;
  hint?: string;
}

const EMPTY_SOURCE: Source = { field: 'dec', text: '' };

function SectionHeader({ title, badge }: { title: string; badge: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <CardTitle>{title}</CardTitle>
      <span className="rounded-md bg-canvas px-2 py-1 text-xs text-ink-muted">{badge}</span>
    </div>
  );
}

interface FieldInputProps {
  label: string;
  placeholder: string;
  view: FieldView;
  onChange: (text: string) => void;
}

function FieldInput({ label, placeholder, view, onChange }: FieldInputProps) {
  const copyable = view.text.trim() !== '' && !view.error && !view.hint;

  return (
    <div>
      <div className="flex items-center gap-2">
        <Input
          value={view.text}
          onChange={event => onChange(event.target.value)}
          placeholder={placeholder}
          aria-label={label}
          error={view.error}
          spellCheck={false}
          autoComplete="off"
          className="font-mono"
        />
        {copyable && <CopyButton value={view.text.trim()} size="md" />}
      </div>
      {view.hint && <p className="mt-1.5 text-xs text-ink-muted">{view.hint}</p>}
    </div>
  );
}

export default function NumberConverter() {
  const t = useTranslations('utilikit.numberConverter');
  const tc = useTranslations('utilikit.common');

  const [source, setSource] = useState<Source>(EMPTY_SOURCE);
  const [bitWidth, setBitWidth] = useState<BitWidth>(8);

  const parsed = source.text.trim() ? parseField(source.field, source.text, bitWidth) : null;
  const value = parsed?.ok ? parsed.value : null;
  const integer = value?.integer ?? null;

  const viewOf = (field: Field): FieldView => {
    if (field === source.field) {
      if (!parsed || parsed.ok) return { text: source.text };
      if (parsed.error === 'wrongLength') {
        return { text: source.text, hint: t('bitCount', { count: parsed.length, bits: parsed.expected }) };
      }
      return { text: source.text, error: t(`errors.${parsed.error}`) };
    }

    if (!value) return { text: '' };

    const formatted = formatField(field, value, bitWidth);
    if (formatted.ok) return { text: formatted.text };
    if (formatted.issue === 'notInteger') return { text: '', hint: t('notInteger') };
    return {
      text: '',
      hint: t('outOfRange', { bits: bitWidth, min: Number(formatted.min), max: Number(formatted.max) }),
    };
  };

  const edit = (field: Field) => (text: string) =>
    setSource({ field, text: field === 'hex' ? text.toUpperCase() : text });

  const changeBitWidth = (selected: string) => {
    const next = BIT_WIDTHS.find(bits => String(bits) === selected);
    if (!next) return;
    if (integer !== null && (source.field === 'ones' || source.field === 'twos')) {
      setSource({ field: 'dec', text: integer.toString() });
    }
    setBitWidth(next);
  };

  const characters = [
    {
      title: 'ASCII',
      range: '0–127',
      info: integer !== null && integer <= ASCII_MAX ? describeCodePoint(integer) : null,
      detailLabel: t('asciiCode'),
      detail: integer?.toString() ?? '',
    },
    {
      title: 'Unicode',
      range: 'U+0000–U+10FFFF',
      info: integer !== null ? describeCodePoint(integer) : null,
      detailLabel: t('codePoint'),
      detail: integer !== null ? formatCodePoint(integer) : '',
    },
  ];

  return (
    <ToolLayout>
      <div className="mb-4 flex justify-end sm:mb-6">
        <Button variant="outline" onClick={() => setSource(EMPTY_SOURCE)}>
          {t('clearAll')}
        </Button>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:mb-6 sm:gap-6 @xl:grid-cols-2 @4xl:grid-cols-4">
        {BASE_FIELDS.map(field => (
          <Card key={field} className="min-w-0">
            <SectionHeader title={t(`fields.${field}`)} badge={t('base', { radix: RADIX[field] })} />
            <FieldInput
              label={t(`fields.${field}`)}
              placeholder={t(`placeholders.${field}`)}
              view={viewOf(field)}
              onChange={edit(field)}
            />
          </Card>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:mb-6 sm:gap-6 md:grid-cols-2">
        {characters.map(({ title, range, info, detailLabel, detail }) => (
          <Card key={title} className="min-w-0">
            <SectionHeader title={title} badge={range} />
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Well className="flex min-h-14 min-w-0 flex-1 items-center justify-center text-center">
                  {info?.kind === 'printable' && <span className="break-all font-mono text-2xl">{info.char}</span>}
                  {info?.kind === 'control' && <span className="font-mono text-ink-muted">{info.name}</span>}
                  {info?.kind === 'surrogate' && <span className="text-ink-muted">{t('surrogate')}</span>}
                </Well>
                {info && info.kind !== 'surrogate' && (
                  <CopyButton value={info.kind === 'printable' ? info.char : info.name} size="md" />
                )}
              </div>
              {info && (
                <Well className="text-center">
                  <p className="flex flex-wrap items-baseline justify-center gap-x-2">
                    <span className="text-ink-muted">{detailLabel}</span>
                    <span className="font-mono font-semibold">{detail}</span>
                  </p>
                  {info.kind === 'control' && <p className="mt-2">{t(`controlChars.${info.name}`)}</p>}
                </Well>
              )}
            </div>
          </Card>
        ))}
      </div>

      <div className="mb-4 sm:max-w-sm">
        <Select
          label={t('bitWidth')}
          value={bitWidth}
          onChange={event => changeBitWidth(event.target.value)}
          options={BIT_WIDTHS.map(bits => ({ value: String(bits), label: t('bitWidthOption', { bits }) }))}
        />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:mb-6 sm:gap-6 md:grid-cols-2">
        {COMPLEMENT_FIELDS.map(field => (
          <Card key={field} className="min-w-0">
            <CardTitle className="mb-2">{t(`fields.${field}`)}</CardTitle>
            <div className="mb-4 space-y-1 text-sm text-ink-muted">
              <p>
                {t.rich(`complements.${field}.intro`, {
                  strong: chunks => <strong className="text-ink">{chunks}</strong>,
                })}
              </p>
              {COMPLEMENT_NOTES.map(note => (
                <p key={note} className="break-words">
                  {t(`complements.${field}.${note}`)}
                </p>
              ))}
            </div>
            <FieldInput
              label={t(`fields.${field}`)}
              placeholder={t('enterBits', { bits: bitWidth })}
              view={viewOf(field)}
              onChange={edit(field)}
            />
          </Card>
        ))}
      </div>

      {FLOAT_FIELDS.map(field => {
        const view = viewOf(field);
        const parts = splitFloatBits(view.text.trim());

        return (
          <Card key={field} className="mb-4 sm:mb-6">
            <SectionHeader title={t(`fields.${field}`)} badge={t(FLOAT_PRECISION[field])} />
            <div className="space-y-3">
              <FieldInput
                label={t(`fields.${field}`)}
                placeholder={t('enterBits', { bits: FLOAT_WIDTHS[field] })}
                view={view}
                onChange={edit(field)}
              />
              {parts && (
                <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                  {[
                    { label: t('sign'), bits: parts.sign },
                    { label: t('exponentBits', { bits: parts.exponent.length }), bits: parts.exponent },
                    { label: t('mantissaBits', { bits: parts.mantissa.length }), bits: parts.mantissa },
                  ].map(part => (
                    <Well key={part.label}>
                      <p className="mb-1 text-ink-muted">{part.label}</p>
                      <p className="break-all font-mono text-xs">{part.bits}</p>
                    </Well>
                  ))}
                </div>
              )}
            </div>
          </Card>
        );
      })}

      <GuideCard>
        <CardTitle className="mb-3">{tc('examples')}</CardTitle>
        <dl className="grid grid-cols-1 gap-4 text-sm md:grid-cols-3">
          {EXAMPLES.map(({ id, result }) => (
            <div key={id}>
              <dt className="mb-1 text-ink-muted">{t(`examples.${id}`)}</dt>
              <dd className="break-words text-ink">{result}</dd>
            </div>
          ))}
        </dl>
      </GuideCard>
    </ToolLayout>
  );
}
