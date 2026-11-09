'use client';

import { Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { useApiError } from '@/lib/use-api-error';

import { Button } from './button';
import { Input } from './input';

export interface UnlockFormProps {
  /** The field's label. */
  label: string;
  /** The button's. */
  submit: string;
  /** Checks the password with the server, which remembers it for this browser. */
  unlock(password: string): Promise<unknown>;
  onUnlocked(): void;
}

/** A password that opens something, like a link or a page. A wrong one shows under the field. */
export function UnlockForm({ label, submit, unlock, onUnlocked }: UnlockFormProps) {
  const apiError = useApiError();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await unlock(password);
      onUnlocked();
    } catch (caught) {
      setError(apiError(caught, 'wrongPassword'));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={send} className="space-y-3 text-left">
      <Input type="password" label={label} autoComplete="off" autoFocus value={password} onChange={event => setPassword(event.target.value)} error={error} />
      <Button type="submit" fullWidth disabled={busy || !password}>
        {busy ? <Loader2 size={16} className="animate-spin" /> : null}
        {submit}
      </Button>
    </form>
  );
}
