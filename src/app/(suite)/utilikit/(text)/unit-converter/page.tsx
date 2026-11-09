'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Beaker, Ruler, Scale, Thermometer, type LucideIcon } from 'lucide-react';
import { ToolLayout } from '@/modules/utilikit/components/tool-layout';
import { GuideCard } from '@/modules/utilikit/components/ui/guide-card';
import { CopyButton } from '@/modules/utilikit/components/ui/copy-button';
import { Well } from '@/modules/utilikit/components/ui/well';
import {
  convert,
  convertToAll,
  formatNumber,
  getUnits,
  parseDecimal,
  UNIT_CATEGORIES,
  UNIT_SYMBOLS,
  type UnitCategory,
  type UnitId,
} from '@/modules/utilikit/lib/unit-converter';
import { Button, Card, CardTitle, Input, Segmented, Select } from '@/components/ui';

const CATEGORY_ICONS: Record<UnitCategory, LucideIcon> = {
  temperature: Thermometer,
  length: Ruler,
  weight: Scale,
  volume: Beaker,
};

interface Example {
  caption?: 'freezingPoint' | 'boilingPoint' | 'sameInBoth';
  amount: number;
  units: readonly [UnitId, ...UnitId[]];
}

const EXAMPLES: Record<UnitCategory, readonly Example[]> = {
  temperature: [
    { caption: 'freezingPoint', amount: 0, units: ['c', 'f', 'k'] },
    { caption: 'boilingPoint', amount: 100, units: ['c', 'f', 'k'] },
    { caption: 'sameInBoth', amount: -40, units: ['c', 'f'] },
  ],
  length: [
    { amount: 1, units: ['cm', 'm', 'in'] },
    { amount: 1, units: ['m', 'cm', 'ft'] },
    { amount: 1, units: ['km', 'm', 'mi'] },
  ],
  weight: [
    { amount: 1, units: ['kg', 'lb', 'g'] },
    { amount: 1, units: ['lb', 'g', 'oz'] },
    { amount: 1, units: ['oz', 'g', 'lb'] },
  ],
  volume: [
    { amount: 1, units: ['l', 'ml', 'gal'] },
    { amount: 1, units: ['gal', 'l', 'cup'] },
    { amount: 1, units: ['cup', 'ml', 'gal'] },
  ],
};

export default function UnitConverter() {
  const t = useTranslations('utilikit.unitConverter');
  const tc = useTranslations('utilikit.common');
  const locale = useLocale();

  const [category, setCategory] = useState<UnitCategory>('temperature');
  const [fromUnit, setFromUnit] = useState<UnitId>('c');
  const [inputValue, setInputValue] = useState('');

  const value = parseDecimal(inputValue, locale);
  const results = useMemo(() => convertToAll(value, category, fromUnit), [value, category, fromUnit]);
  const units = getUnits(category);
  const rows = units.flatMap(unit => {
    const amount = results[unit];
    return amount === undefined ? [] : [{ unit, amount }];
  });

  const symbolOf = (unit: UnitId) => (unit === 'cup' ? t('cupSymbol') : UNIT_SYMBOLS[unit]);

  const changeCategory = (next: UnitCategory) => {
    setCategory(next);
    setFromUnit(getUnits(next)[0]);
    setInputValue('');
  };

  return (
    <ToolLayout>
      <Segmented
        value={category}
        onChange={changeCategory}
        ariaLabel={t('category')}
        className="mb-4 sm:mb-6"
        options={UNIT_CATEGORIES.map(id => ({ value: id, label: t(`categories.${id}`), icon: CATEGORY_ICONS[id] }))}
      />

      <Card className="mb-4 sm:mb-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Input
            label={t('value')}
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            placeholder={t('enterValue')}
            error={inputValue.trim() && Number.isNaN(value) ? t('invalidNumber') : undefined}
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
          />
          <Select
            label={t('fromUnit')}
            value={fromUnit}
            onChange={e => setFromUnit(e.target.value as UnitId)}
            options={units.map(unit => ({ value: unit, label: `${t(`units.${unit}`)} (${symbolOf(unit)})` }))}
          />
          <div className="flex items-end">
            <Button onClick={() => setInputValue('')} variant="outline" className="w-full">
              {tc('clear')}
            </Button>
          </div>
        </div>
      </Card>

      {rows.length > 0 && (
        <Card className="mb-4 sm:mb-6">
          <CardTitle className="mb-4">{t('convertedValues')}</CardTitle>
          <div className="space-y-3">
            {rows.map(({ unit, amount }) => {
              const formatted = formatNumber(amount, locale);
              const symbol = symbolOf(unit);
              const finite = Number.isFinite(amount);

              return (
                <div key={unit}>
                  <p className="mb-1.5 text-sm font-medium text-ink-muted">{t(`units.${unit}`)}</p>
                  <div className="flex items-center gap-2">
                    <Well mono className="min-w-0 flex-1">
                      {finite ? (
                        <>
                          {formatted} <span className="text-ink-muted">{symbol}</span>
                        </>
                      ) : (
                        <span className="font-sans text-ink-muted">{t('outOfRange')}</span>
                      )}
                    </Well>
                    {finite && <CopyButton value={`${formatted} ${symbol}`} />}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <GuideCard>
        <CardTitle className="mb-3">{tc('examples')}</CardTitle>
        <dl className="grid grid-cols-1 gap-4 text-sm md:grid-cols-3">
          {EXAMPLES[category].map(({ caption, amount, units: [from, ...to] }) => (
            <div key={`${from}${amount}`}>
              <dt className="mb-1 text-ink-muted">{caption ? t(`examples.${caption}`) : t(`units.${from}`)}</dt>
              <dd className="break-words font-mono text-ink">
                {[from, ...to]
                  .map(unit => `${formatNumber(convert(amount, category, from, unit), locale, 4)} ${symbolOf(unit)}`)
                  .join(' = ')}
              </dd>
            </div>
          ))}
        </dl>
      </GuideCard>
    </ToolLayout>
  );
}
