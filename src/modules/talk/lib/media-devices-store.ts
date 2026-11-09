/**
 * The device list and the remembered choice, as an external store.
 *
 * Both are genuinely outside React: one lives in `localStorage`, the other in
 * the browser's hardware list, which changes when somebody plugs in a headset.
 * Modelling them as a store rather than as state synchronised by effects keeps
 * the server render and the hydrated render in agreement, and means every
 * component reading a device sees the same snapshot.
 */
import {
  EMPTY_DEVICES,
  groupDevices,
  readStoredChoices,
  writeStoredChoices,
  type DeviceKind,
  type DeviceLists,
  type StoredChoices,
} from './media-devices';

export interface DeviceSnapshot {
  devices: DeviceLists;
  choices: StoredChoices;
  /**
   * False until a permission grant unlocks the hardware names. Everything
   * still works without it; the menus just read "Microphone 1".
   */
  namesKnown: boolean;
}

/**
 * What the server renders, and what the browser renders while hydrating.
 *
 * A frozen constant: React compares snapshots by identity, so this must be the
 * same object every time or hydration re-renders for ever.
 */
const SERVER_SNAPSHOT: DeviceSnapshot = Object.freeze({
  devices: EMPTY_DEVICES,
  choices: Object.freeze({}) as StoredChoices,
  namesKnown: false,
});

let snapshot: DeviceSnapshot = SERVER_SNAPSHOT;
let readChoicesYet = false;
const listeners = new Set<() => void>();

function publish(next: Partial<DeviceSnapshot>): void {
  snapshot = { ...snapshot, ...next };
  for (const listener of listeners) listener();
}

/**
 * The current snapshot.
 *
 * The stored choice is read on the first call rather than at module load: on
 * the server there is no `localStorage`, and reading it during hydration would
 * disagree with what the server sent. Filling the cache once here keeps the
 * returned object stable, which is what React needs to avoid looping.
 */
export function getSnapshot(): DeviceSnapshot {
  if (!readChoicesYet) {
    readChoicesYet = true;
    snapshot = { ...snapshot, choices: readStoredChoices() };
  }
  return snapshot;
}

export function getServerSnapshot(): DeviceSnapshot {
  return SERVER_SNAPSHOT;
}

function supported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.enumerateDevices === 'function'
  );
}

const onDeviceChange = (): void => void refreshDevices();

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1 && supported()) {
    navigator.mediaDevices.addEventListener('devicechange', onDeviceChange);
    void refreshDevices();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && supported()) {
      navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange);
    }
  };
}

/** Re-read what is plugged in. Safe to call at any time. */
export async function refreshDevices(): Promise<void> {
  if (!supported()) return;
  try {
    const list = await navigator.mediaDevices.enumerateDevices();
    publish({
      devices: groupDevices(list),
      // A non-empty label anywhere means the browser has decided we are
      // allowed to know what the hardware is called.
      namesKnown: list.some((device) => device.label.trim() !== ''),
    });
  } catch {
    // Enumeration refused in this context. The lists stay empty and calls fall
    // back to whatever the system prefers, which still works.
  }
}

/** Remember a device for this kind, or `null` to follow the system. */
export function chooseDevice(kind: DeviceKind, deviceId: string | null): void {
  const next: StoredChoices = { ...snapshot.choices };

  if (deviceId === null) {
    delete next[kind];
  } else {
    const all = [
      ...snapshot.devices.microphones,
      ...snapshot.devices.cameras,
      ...snapshot.devices.speakers,
    ];
    // Stored with its name so it can be found again under a new id.
    next[kind] = { deviceId, label: all.find((d) => d.deviceId === deviceId)?.label ?? '' };
  }

  writeStoredChoices(next);
  publish({ choices: next });
}
