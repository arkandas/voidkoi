/**
 * Choosing which microphone, camera and speaker a call uses.
 *
 * The browser gives us a flat list of devices whose identifiers are not stable
 * and whose names are hidden until permission is granted, so the awkward part
 * is not the picking — it is deciding what "the headset I chose last week"
 * means today. That resolution is pure, and lives here so it can be tested
 * without plugging anything in.
 */

export type DeviceKind = 'audioinput' | 'videoinput' | 'audiooutput';

export interface MediaDevice {
  deviceId: string;
  /** Always non-empty: a placeholder stands in until permission is granted. */
  label: string;
  kind: DeviceKind;
  /**
   * Set when the browser is hiding the name: which unnamed device of its kind
   * this is, counting from 1. The placeholder label is English and only
   * identifies the device; the UI names it from this, in its own language.
   */
  unnamed?: number;
}

export interface DeviceLists {
  microphones: MediaDevice[];
  cameras: MediaDevice[];
  speakers: MediaDevice[];
}

export const EMPTY_DEVICES: DeviceLists = { microphones: [], cameras: [], speakers: [] };

/**
 * A remembered choice.
 *
 * The label is stored alongside the id because ids are not stable: they are
 * salted per origin, and unplugging a USB microphone and plugging it back in
 * can hand it a new one. Without the label, "use my Samson" quietly becomes
 * "use whatever the system picked" after a reboot.
 */
export interface StoredChoice {
  deviceId: string;
  label: string;
}

/** How a stored choice was honoured, so the UI can admit when it was not. */
export type ChoiceResolution =
  /** No stored choice: follow whatever the operating system prefers. */
  | { deviceId: null; reason: 'system' }
  /** The exact device is still here. */
  | { deviceId: string; reason: 'exact' }
  /** Gone, but something with the same name is here — almost certainly it. */
  | { deviceId: string; reason: 'relabelled' }
  /** Chosen device is not present. Falls back, and says so. */
  | { deviceId: null; reason: 'missing'; label: string };

const KIND_PLACEHOLDER: Record<DeviceKind, string> = {
  audioinput: 'Microphone',
  videoinput: 'Camera',
  audiooutput: 'Speaker',
};

/**
 * Identifiers Chrome adds for its own bookkeeping.
 *
 * Chrome lists one physical microphone up to three times: once as `default`,
 * once as `communications`, and once under its real id. Showing all three is
 * how you get a menu with "MacBook Pro Microphone" in it three times, so the
 * synthetic ones are dropped — following the system default is offered as its
 * own option instead of as a device that happens to be aliased.
 */
const SYNTHETIC_IDS = new Set(['default', 'communications']);

/**
 * Group a raw `enumerateDevices()` list into the three things we care about.
 *
 * Devices with no label have not been unlocked by a permission grant yet, so
 * they get a numbered placeholder rather than an empty menu entry.
 */
export function groupDevices(devices: readonly MediaDeviceInfo[]): DeviceLists {
  const grouped: DeviceLists = { microphones: [], cameras: [], speakers: [] };
  const counts: Record<string, number> = {};

  for (const device of devices) {
    const kind = device.kind as DeviceKind;
    if (kind !== 'audioinput' && kind !== 'videoinput' && kind !== 'audiooutput') continue;
    // A device with no id is one the browser refuses to identify at all.
    if (device.deviceId === '' || SYNTHETIC_IDS.has(device.deviceId)) continue;

    const position = (counts[kind] ?? 0) + 1;
    counts[kind] = position;
    const label = device.label.trim();
    const entry: MediaDevice = label
      ? { deviceId: device.deviceId, label, kind }
      : {
          deviceId: device.deviceId,
          label: `${KIND_PLACEHOLDER[kind]} ${position}`,
          kind,
          unnamed: position,
        };

    if (kind === 'audioinput') grouped.microphones.push(entry);
    else if (kind === 'videoinput') grouped.cameras.push(entry);
    else grouped.speakers.push(entry);
  }

  return grouped;
}

/** Work out which device a remembered choice means, given what is plugged in. */
export function resolveChoice(
  stored: StoredChoice | null,
  devices: readonly MediaDevice[],
): ChoiceResolution {
  if (stored === null) return { deviceId: null, reason: 'system' };

  if (devices.some((device) => device.deviceId === stored.deviceId)) {
    return { deviceId: stored.deviceId, reason: 'exact' };
  }

  // Same name, new id: the usual shape of "unplugged and plugged back in".
  const byLabel = devices.find((device) => device.label === stored.label);
  if (byLabel) return { deviceId: byLabel.deviceId, reason: 'relabelled' };

  return { deviceId: null, reason: 'missing', label: stored.label };
}

/** A choice that named a device which is not among the ones connected. */
export interface LostDevice {
  kind: DeviceKind;
  label: string;
}

export interface ResolvedChoices {
  /** The device id to constrain each kind to, or null to follow the system. */
  selected: Record<DeviceKind, string | null>;
  lost: LostDevice[];
}

const ALL_KINDS: readonly DeviceKind[] = ['audioinput', 'videoinput', 'audiooutput'];

/**
 * Work out what to open, and what to admit has gone missing.
 *
 * An empty list is the interesting case, and it is emphatically *not* the same
 * as "the chosen device is absent". The list is empty before enumeration has
 * finished, and stays empty whenever the browser withholds device ids because
 * permission has never been granted. Treating that as absence tells somebody
 * their headset is disconnected while they are wearing it, so a kind whose
 * devices are unknown reports nothing at all.
 */
export function resolveChoices(choices: StoredChoices, devices: DeviceLists): ResolvedChoices {
  const selected = {} as Record<DeviceKind, string | null>;
  const lost: LostDevice[] = [];

  for (const kind of ALL_KINDS) {
    const available = devicesOfKind(devices, kind);
    if (available.length === 0) {
      // Nothing is known about this kind. Follow the system and stay quiet.
      selected[kind] = null;
      continue;
    }

    const outcome = resolveChoice(choices[kind] ?? null, available);
    selected[kind] = outcome.deviceId;
    if (outcome.reason === 'missing') lost.push({ kind, label: outcome.label });
  }

  return { selected, lost };
}

export function devicesOfKind(devices: DeviceLists, kind: DeviceKind): MediaDevice[] {
  if (kind === 'audioinput') return devices.microphones;
  if (kind === 'videoinput') return devices.cameras;
  return devices.speakers;
}

/**
 * Pin a track to one device, or leave the choice to the browser.
 *
 * `exact` rather than `ideal` on purpose. `ideal` silently substitutes another
 * device when the chosen one has gone, which is how somebody ends up talking
 * into their laptop while looking at a picture of their headset. `exact`
 * throws, and the caller can fall back deliberately and say what it did.
 */
export function deviceConstraint(deviceId: string | null): { deviceId?: { exact: string } } {
  return deviceId === null ? {} : { deviceId: { exact: deviceId } };
}

/** True when a failed `getUserMedia` failed *because* the device is gone. */
export function isMissingDeviceError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === 'OverconstrainedError' ||
    error.name === 'NotFoundError' ||
    // Safari reports a vanished device this way.
    error.name === 'NotReadableError'
  );
}

/* --------------------------------------------------------------------- */
/* Persistence                                                            */
/* --------------------------------------------------------------------- */

const STORAGE_KEY = 'talk:devices';

export type StoredChoices = Partial<Record<DeviceKind, StoredChoice>>;

/**
 * Read the remembered choices.
 *
 * Every access is guarded: storage throws outright in a browser set to block
 * site data, and a half-written value from an older version of this app must
 * not stop somebody making a call.
 */
export function readStoredChoices(storage: Storage | undefined = safeStorage()): StoredChoices {
  if (!storage) return {};
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};

    const choices: StoredChoices = {};
    for (const kind of ALL_KINDS) {
      const value: unknown = (parsed as Record<string, unknown>)[kind];
      if (typeof value !== 'object' || value === null) continue;
      const { deviceId, label } = value as Record<string, unknown>;
      if (typeof deviceId === 'string' && typeof label === 'string' && deviceId !== '') {
        choices[kind] = { deviceId, label };
      }
    }
    return choices;
  } catch {
    return {};
  }
}

export function writeStoredChoices(
  choices: StoredChoices,
  storage: Storage | undefined = safeStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(choices));
  } catch {
    // Blocked or full. The choice still applies to this call, just not the next.
  }
}

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}
