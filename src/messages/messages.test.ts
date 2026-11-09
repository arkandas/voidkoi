import { parse, TYPE, type MessageFormatElement } from '@formatjs/icu-messageformat-parser';
import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import { locales } from '@/i18n/config';
import { API_ERRORS, errorOwner } from '@/lib/error-codes';
import { MESSAGES } from '@/i18n/messages';

type Tree = { [key: string]: string | Tree };

const catalogs = MESSAGES as unknown as Record<string, Tree>;

function flatten(tree: Tree, prefix = ''): Array<[string, string]> {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string' ? [[`${prefix}${key}`, value] as [string, string]] : flatten(value, `${prefix}${key}.`),
  );
}

function walk(message: string, visit: (element: MessageFormatElement) => void) {
  const visitAll = (elements: MessageFormatElement[]) => {
    for (const element of elements) {
      visit(element);
      if (element.type === TYPE.select || element.type === TYPE.plural) {
        for (const option of Object.values(element.options)) visitAll(option.value);
      }
      if (element.type === TYPE.tag) visitAll(element.children);
    }
  };
  visitAll(parse(message));
}

function argumentsOf(message: string): string[] {
  const names = new Set<string>();
  walk(message, element => {
    if (element.type === TYPE.tag) names.add(`<${element.value}>`);
    else if (element.type !== TYPE.literal && element.type !== TYPE.pound) names.add(element.value);
  });
  return [...names].sort();
}

function sampleValues(message: string) {
  const values: Record<string, unknown> = {};
  walk(message, element => {
    if (element.type === TYPE.plural || element.type === TYPE.number) values[element.value] = 2;
    else if (element.type === TYPE.date || element.type === TYPE.time) values[element.value] = new Date(0);
    else if (element.type === TYPE.tag) values[element.value] = (chunks: unknown) => chunks;
    else if (element.type === TYPE.argument || element.type === TYPE.select) values[element.value] = 'x';
  });
  return values;
}

const entries = Object.fromEntries(locales.map(locale => [locale, new Map(flatten(catalogs[locale]))]));

describe('message catalogs', () => {
  it('have the same keys in every locale', () => {
    const [first, ...rest] = locales;
    for (const locale of rest) {
      expect([...entries[locale].keys()].filter(key => !entries[first].has(key)), `only in ${locale}`).toEqual([]);
      expect([...entries[first].keys()].filter(key => !entries[locale].has(key)), `missing in ${locale}`).toEqual([]);
    }
  });

  it('have no empty messages', () => {
    for (const locale of locales) {
      const empty = [...entries[locale]].filter(([, value]) => !value.trim()).map(([key]) => key);
      expect(empty, locale).toEqual([]);
    }
  });

  it('use the same placeholders in every locale', () => {
    const mismatched = [...entries.en].filter(
      ([key, value]) => entries.es.has(key) && argumentsOf(value).join() !== argumentsOf(entries.es.get(key)!).join(),
    );
    expect(mismatched.map(([key]) => key)).toEqual([]);
  });

  it('format every message without errors', () => {
    for (const locale of locales) {
      const failures: string[] = [];
      const t = createTranslator({
        locale,
        messages: catalogs[locale],
        onError: error => failures.push(`${error.code}: ${error.message}`),
        getMessageFallback: ({ key }) => `!${key}`,
      }) as unknown as { rich: (key: string, values: Record<string, unknown>) => unknown };

      for (const [key, message] of entries[locale]) t.rich(key, sampleValues(message));
      expect(failures, locale).toEqual([]);
    }
  });

  it('translate every API error code', () => {
    for (const locale of locales) {
      const missing = API_ERRORS.filter(code => {
        const owner = errorOwner(code);
        return !entries[locale].has(owner ? `${owner}.errors.${code}` : `errors.${code}`);
      });
      expect(missing, locale).toEqual([]);
    }
  });

  it('use the typographic ellipsis after words', () => {
    for (const locale of locales) {
      const dots = [...entries[locale]].filter(([, value]) => /\p{L}\.\.\./u.test(value)).map(([key]) => key);
      expect(dots, locale).toEqual([]);
    }
  });
});
