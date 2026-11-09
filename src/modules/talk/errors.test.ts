import { describe, expect, it } from 'vitest';

import { errorOwner } from '@/lib/error-codes';
import en from '@/messages/en/talk.json';
import es from '@/messages/es/talk.json';

import { ERRORS } from './errors';

describe('Talk’s error codes', () => {
  it('are Talk’s, with a message in both languages', () => {
    for (const code of ERRORS) {
      expect(errorOwner(code), code).toBe('talk');
      expect(en.errors[code], `en ${code}`).toBeTruthy();
      expect(es.errors[code], `es ${code}`).toBeTruthy();
    }
    expect(Object.keys(en.errors).sort()).toEqual([...ERRORS].sort());
  });
});
