'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { Smartphone } from 'lucide-react';
import { ToolLayout } from '@/modules/utilikit/components/tool-layout';
import { GuideCard } from '@/modules/utilikit/components/ui/guide-card';
import { CopyButton } from '@/modules/utilikit/components/ui/copy-button';
import { parseUserAgent, USER_AGENT_EXAMPLES } from '@/modules/utilikit/lib/user-agent-utils';
import { cn } from '@/lib/cn';
import { Button, Card, CardTitle } from '@/components/ui';
import { Textarea } from '@/modules/utilikit/components/ui/fields';

type Row = readonly [label: string, value: string | null];

const subscribe = () => () => {};
const getUserAgent = () => navigator.userAgent;
const getServerUserAgent = () => '';

export default function UserAgentParser() {
  const t = useTranslations('utilikit.userAgentParser');
  const tc = useTranslations('utilikit.common');
  const browserUserAgent = useSyncExternalStore(subscribe, getUserAgent, getServerUserAgent);

  const [draft, setDraft] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<string | null>(null);

  const userAgent = draft ?? browserUserAgent;
  const source = (submitted ?? browserUserAgent).trim();
  const info = useMemo(() => (source ? parseUserAgent(source) : null), [source]);

  const load = (value: string | null) => {
    setDraft(value);
    setSubmitted(value);
  };

  const sections: { id: string; title: string; rows: Row[] }[] = info
    ? [
        {
          id: 'browser',
          title: t('browser'),
          rows: [
            [tc('name'), info.browser.name],
            [t('version'), info.browser.version],
          ],
        },
        {
          id: 'os',
          title: t('operatingSystem'),
          rows: [
            [tc('name'), info.os.name],
            [t('version'), info.os.version],
          ],
        },
        {
          id: 'device',
          title: t('device'),
          rows: [
            [tc('type'), t(`deviceTypes.${info.device.type}`)],
            [tc('vendor'), info.device.vendor],
            [tc('model'), info.device.model],
          ],
        },
        {
          id: 'engine',
          title: tc('engine'),
          rows: [
            [tc('name'), info.engine.name],
            [t('version'), info.engine.version],
          ],
        },
      ]
    : [];

  return (
    <ToolLayout>
      <div className="space-y-4 sm:space-y-6">
        <Card>
          <CardTitle className="mb-4">{t('inputUserAgent')}</CardTitle>
          <Textarea
            value={userAgent}
            onChange={e => setDraft(e.target.value)}
            placeholder={t('pasteUserAgent')}
            aria-label={t('inputUserAgent')}
            spellCheck={false}
            rows={4}
            className="font-mono"
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => setSubmitted(userAgent)} disabled={!userAgent.trim()}>
              {t('parse')}
            </Button>
            <Button variant="outline" onClick={() => load(null)}>
              {t('useCurrentBrowser')}
            </Button>
            <CopyButton value={userAgent} size="md" disabled={!userAgent} />
          </div>
        </Card>

        {info && (
          <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2">
            {sections.map(section => (
              <Card key={section.id}>
                <CardTitle className="mb-3">{section.title}</CardTitle>
                <dl className="space-y-2 text-sm">
                  {section.rows.map(([label, value]) => (
                    <div key={label} className="flex items-baseline justify-between gap-4">
                      <dt className="shrink-0 text-ink-muted">{label}</dt>
                      <dd className={cn('min-w-0 break-all text-right', value ? 'font-medium text-ink' : 'text-ink-faint')}>
                        {value ?? t('notDetected')}
                      </dd>
                    </div>
                  ))}
                </dl>
              </Card>
            ))}
          </div>
        )}

        <Card>
          <CardTitle className="mb-4">
            <Smartphone size={18} />
            {tc('examples')}
          </CardTitle>
          <div className="space-y-2">
            {USER_AGENT_EXAMPLES.map(example => (
              <button
                key={example.name}
                type="button"
                onClick={() => load(example.ua)}
                className="w-full rounded-lg border border-line bg-canvas p-3 text-left transition-colors hover:border-accent"
              >
                <span className="block font-medium text-ink">{example.name}</span>
                <span className="mt-1 block truncate font-mono text-xs text-ink-muted">{example.ua}</span>
              </button>
            ))}
          </div>
        </Card>

        <GuideCard>
          <CardTitle className="mb-3">{t('about.title')}</CardTitle>
          <div className="space-y-2 text-sm text-ink-muted">
            <p>{t('about.description')}</p>
            <p>{t('about.uses')}</p>
          </div>
        </GuideCard>
      </div>
    </ToolLayout>
  );
}
