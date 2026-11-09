'use client';

import { useState } from 'react';

import { fieldClasses } from '@/components/ui';
import { cn } from '@/lib/cn';
import { SIZE_UNITS, splitBytes, type SizeUnit } from '@/lib/format';

/**
 * A size typed as a number and a unit. Reports whole bytes, or null while it
 * isn't a size. Starts from `bytes`; give it a new `key` to start over.
 */
export function SizeInput({
  bytes,
  onChange,
  label,
}: {
  bytes: number | null;
  onChange(bytes: number | null): void;
  label: string;
}) {
  const initial = splitBytes(bytes ?? 10 * SIZE_UNITS.GB);
  const [value, setValue] = useState(String(initial.value));
  const [unit, setUnit] = useState<SizeUnit>(initial.unit);

  const report = (nextValue: string, nextUnit: SizeUnit) => {
    const number = Number(nextValue.replace(',', '.'));
    onChange(Number.isFinite(number) && number > 0 ? Math.round(number * SIZE_UNITS[nextUnit]) : null);
  };

  return (
    <div className="flex gap-2">
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        aria-label={label}
        value={value}
        onChange={event => {
          setValue(event.target.value);
          report(event.target.value, unit);
        }}
        className={cn(fieldClasses, 'h-10 w-32 px-3.5 text-sm tabular-nums')}
      />
      <select
        aria-label={label}
        value={unit}
        onChange={event => {
          const next = event.target.value as SizeUnit;
          setUnit(next);
          report(value, next);
        }}
        className={cn(fieldClasses, 'h-10 w-24 cursor-pointer px-3 text-sm')}
      >
        {(Object.keys(SIZE_UNITS) as SizeUnit[]).map(option => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}
