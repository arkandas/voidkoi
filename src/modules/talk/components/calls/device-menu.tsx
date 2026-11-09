'use client';

import { ChevronUp } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/cn';
import { ChoiceMenu, type MenuChoice } from '@/modules/talk/components/ui/choice-menu';
import { listFor, useDeviceName, useMediaDevices } from '@/modules/talk/lib/hooks/use-media-devices';
import type { DeviceKind } from '@/modules/talk/lib/media-devices';

/** The value standing in for "whatever the operating system prefers". */
const SYSTEM = '';

export interface DeviceMenuProps {
  kind: DeviceKind;
  /** `stage` is for the video call, which is dark in either theme. */
  tone?: 'surface' | 'stage';
  className?: string;
}

/**
 * The little caret beside a call control that opens the list of devices.
 *
 * Choosing here writes the same stored choice the settings page writes, so a
 * device picked mid-call is still the one used by the next call.
 */
export function DeviceMenu({
  kind,
  tone = 'surface',
  className,
}: DeviceMenuProps) {
  const t = useTranslations('talk.calls.devices');
  const deviceName = useDeviceName();
  const { devices, choices, choose } = useMediaDevices();
  const available = listFor(devices, kind);
  const stored = choices[kind];

  const items: MenuChoice[] = [
    { value: SYSTEM, label: t('system') },
    ...available.map((device) => ({ value: device.deviceId, label: deviceName(device) })),
  ];

  // A chosen device that is no longer plugged in still belongs in the list, as
  // a disabled entry: silently dropping it looks like the app forgot.
  if (stored && !available.some((device) => device.deviceId === stored.deviceId)) {
    const sameName = available.some((device) => device.label === stored.label);
    if (!sameName) {
      items.push({
        value: stored.deviceId,
        label: stored.label || t('chosenDevice'),
        detail: t('menu.notConnected'),
        disabled: true,
      });
    }
  }

  // What is actually in use, which is not always what was stored: a device
  // that came back under a new id is matched by name.
  const current =
    available.find((device) => device.deviceId === stored?.deviceId)?.deviceId ??
    available.find((device) => device.label === stored?.label)?.deviceId ??
    SYSTEM;

  return (
    <ChoiceMenu
      label={t(`menu.${kind}`)}
      choices={items}
      value={current}
      className={className}
      onChoose={(value) => choose(kind, value === SYSTEM ? null : value)}
    >
      <span
        className={cn(
          'flex size-6 items-center justify-center rounded-full border shadow-xs transition-colors duration-150',
          tone === 'stage'
            ? 'border-white/20 bg-[#1f2321] text-stage-ink-muted hover:text-stage-ink'
            : 'border-line-strong bg-raised text-ink-muted hover:bg-muted hover:text-ink dark:bg-card',
        )}
      >
        <ChevronUp size={14} strokeWidth={2.5} />
      </span>
    </ChoiceMenu>
  );
}
