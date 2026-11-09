'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useSyncExternalStore } from 'react';

import {
  devicesOfKind,
  resolveChoices,
  type DeviceKind,
  type DeviceLists,
  type LostDevice,
  type MediaDevice,
  type StoredChoices,
} from '../media-devices';
import { chooseDevice, getServerSnapshot, getSnapshot, refreshDevices, subscribe } from '../media-devices-store';

export interface MediaDevicesValue {
  devices: DeviceLists;
  /**
   * The device id each kind resolves to right now, or null to follow the
   * system. This is what `getUserMedia` should be constrained with.
   */
  selected: Record<DeviceKind, string | null>;
  /** The raw stored choices, so a menu can tell "the system's" from "this one". */
  choices: StoredChoices;
  /** Choices that name a device which is not among the ones connected. */
  lost: LostDevice[];
  /** False until a permission grant unlocks the hardware names. */
  namesKnown: boolean;
  /** Whether this browser can route audio to a chosen speaker at all. */
  canChooseSpeaker: boolean;
  choose(kind: DeviceKind, deviceId: string | null): void;
  refresh(): Promise<void>;
}

export function listFor(devices: DeviceLists, kind: DeviceKind): MediaDevice[] {
  return devicesOfKind(devices, kind);
}

/** A device's name for a menu, with the placeholder for a hidden one in the reader's language. */
export function useDeviceName(): (device: MediaDevice) => string {
  const t = useTranslations('talk.calls.devices');
  return useCallback(
    (device: MediaDevice) =>
      device.unnamed === undefined
        ? device.label
        : t('unnamed', { kind: device.kind, number: device.unnamed }),
    [t],
  );
}

/**
 * Which microphone, camera and speaker this browser should use.
 *
 * Deliberately not a context: the answer is the same everywhere, it comes from
 * outside React, and a store means the settings page and a ringing call cannot
 * disagree about which microphone is selected.
 *
 * The choice outlives any one call — it is made in settings, with nothing
 * ringing, and survives a reload — so the call layer only reads `selected` and
 * constrains `getUserMedia` with it.
 */
export function useMediaDevices(): MediaDevicesValue {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const { selected, lost } = useMemo(
    () => resolveChoices(snapshot.choices, snapshot.devices),
    [snapshot.choices, snapshot.devices],
  );

  const choose = useCallback((kind: DeviceKind, deviceId: string | null) => {
    chooseDevice(kind, deviceId);
  }, []);

  // Chrome and Edge can point an <audio> at a chosen output; Firefox and
  // Safari cannot, and the control is hidden rather than broken there.
  const canChooseSpeaker =
    typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

  return useMemo(
    () => ({
      devices: snapshot.devices,
      choices: snapshot.choices,
      namesKnown: snapshot.namesKnown,
      selected,
      lost,
      canChooseSpeaker,
      choose,
      refresh: refreshDevices,
    }),
    [snapshot, selected, lost, canChooseSpeaker, choose],
  );
}
