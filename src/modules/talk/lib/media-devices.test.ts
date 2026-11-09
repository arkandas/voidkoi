import { describe, expect, test } from 'vitest';

import {
  deviceConstraint,
  groupDevices,
  isMissingDeviceError,
  readStoredChoices,
  resolveChoice,
  resolveChoices,
  writeStoredChoices,
  type DeviceLists,
  type MediaDevice,
  type StoredChoices,
} from './media-devices';

/** `enumerateDevices()` hands back objects of this shape; only four fields matter. */
function info(kind: string, deviceId: string, label = ''): MediaDeviceInfo {
  return { kind, deviceId, label, groupId: 'g' } as MediaDeviceInfo;
}

function device(deviceId: string, label: string): MediaDevice {
  return { deviceId, label, kind: 'audioinput' };
}

describe('groupDevices', () => {
  test('splits the flat list into microphones, cameras and speakers', () => {
    const grouped = groupDevices([
      info('audioinput', 'mic-1', 'Samson Q2U'),
      info('videoinput', 'cam-1', 'FaceTime HD'),
      info('audiooutput', 'out-1', 'AirPods Pro'),
    ]);

    expect(grouped.microphones).toEqual([
      { deviceId: 'mic-1', label: 'Samson Q2U', kind: 'audioinput' },
    ]);
    expect(grouped.cameras.map((each) => each.label)).toEqual(['FaceTime HD']);
    expect(grouped.speakers.map((each) => each.label)).toEqual(['AirPods Pro']);
  });

  test('drops the synthetic entries Chrome aliases a device under', () => {
    // One physical microphone, listed three times. A menu must show it once.
    const grouped = groupDevices([
      info('audioinput', 'default', 'Default - Samson Q2U'),
      info('audioinput', 'communications', 'Communications - Samson Q2U'),
      info('audioinput', 'real-id', 'Samson Q2U'),
    ]);

    expect(grouped.microphones).toEqual([
      { deviceId: 'real-id', label: 'Samson Q2U', kind: 'audioinput' },
    ]);
  });

  test('names devices the browser will not name yet', () => {
    // Before permission is granted every label is empty, and an unlabelled
    // menu entry is unpickable.
    const grouped = groupDevices([
      info('audioinput', 'a'),
      info('audioinput', 'b'),
      info('videoinput', 'c'),
    ]);

    expect(grouped.microphones.map((each) => each.label)).toEqual(['Microphone 1', 'Microphone 2']);
    expect(grouped.cameras.map((each) => each.label)).toEqual(['Camera 1']);
    // The UI words the placeholder itself, in whatever language it speaks.
    expect(grouped.microphones.map((each) => each.unnamed)).toEqual([1, 2]);
    expect(grouped.cameras.map((each) => each.unnamed)).toEqual([1]);
  });

  test('ignores devices with no id and kinds we do not use', () => {
    const grouped = groupDevices([info('audioinput', ''), info('videooutput', 'x', 'Projector')]);
    expect(grouped).toEqual({ microphones: [], cameras: [], speakers: [] });
  });
});

describe('resolveChoice', () => {
  const plugged = [device('mic-1', 'Samson Q2U'), device('mic-2', 'MacBook Pro Microphone')];

  test('no stored choice follows the system', () => {
    expect(resolveChoice(null, plugged)).toEqual({ deviceId: null, reason: 'system' });
  });

  test('a device that is still present is used as-is', () => {
    expect(resolveChoice({ deviceId: 'mic-1', label: 'Samson Q2U' }, plugged)).toEqual({
      deviceId: 'mic-1',
      reason: 'exact',
    });
  });

  test('a device that came back with a new id is recognised by name', () => {
    // Unplugging a USB microphone and plugging it back in re-salts its id.
    expect(resolveChoice({ deviceId: 'stale-id', label: 'Samson Q2U' }, plugged)).toEqual({
      deviceId: 'mic-1',
      reason: 'relabelled',
    });
  });

  test('a device that is genuinely gone falls back and reports what was lost', () => {
    expect(resolveChoice({ deviceId: 'gone', label: 'Blue Yeti' }, plugged)).toEqual({
      deviceId: null,
      reason: 'missing',
      label: 'Blue Yeti',
    });
  });

  test('an id match wins over a name match', () => {
    // Two devices sharing a name must not shuffle under each other.
    const twins = [device('mic-1', 'USB Audio'), device('mic-2', 'USB Audio')];
    expect(resolveChoice({ deviceId: 'mic-2', label: 'USB Audio' }, twins)).toEqual({
      deviceId: 'mic-2',
      reason: 'exact',
    });
  });
});

describe('deviceConstraint', () => {
  test('pins with exact, so a vanished device fails loudly', () => {
    expect(deviceConstraint('mic-1')).toEqual({ deviceId: { exact: 'mic-1' } });
  });

  test('constrains nothing when following the system', () => {
    expect(deviceConstraint(null)).toEqual({});
  });
});

describe('isMissingDeviceError', () => {
  test.each([['OverconstrainedError'], ['NotFoundError'], ['NotReadableError']])(
    '%s means the device is gone',
    (name) => {
      const error = new Error('nope');
      error.name = name;
      expect(isMissingDeviceError(error)).toBe(true);
    },
  );

  test('a refused permission is not a missing device', () => {
    // These must be told apart: one is worth retrying without the constraint,
    // the other needs the person to change their mind.
    const error = new Error('denied');
    error.name = 'NotAllowedError';
    expect(isMissingDeviceError(error)).toBe(false);
    expect(isMissingDeviceError('not an error')).toBe(false);
  });
});

describe('stored choices', () => {
  /** A stand-in for localStorage, including the throwing kind. */
  function memoryStorage(throws = false): Storage {
    const map = new Map<string, string>();
    return {
      getItem: (key) => {
        if (throws) throw new Error('blocked');
        return map.get(key) ?? null;
      },
      setItem: (key, value) => {
        if (throws) throw new Error('blocked');
        map.set(key, value);
      },
      removeItem: (key) => void map.delete(key),
      clear: () => map.clear(),
      key: () => null,
      length: 0,
    } as Storage;
  }

  test('round-trips', () => {
    const storage = memoryStorage();
    const choices: StoredChoices = {
      audioinput: { deviceId: 'mic-1', label: 'Samson Q2U' },
      videoinput: { deviceId: 'cam-1', label: 'FaceTime HD' },
    };
    writeStoredChoices(choices, storage);
    expect(readStoredChoices(storage)).toEqual(choices);
  });

  test('nothing stored means no choices, not a crash', () => {
    expect(readStoredChoices(memoryStorage())).toEqual({});
  });

  test('storage that throws is survivable', () => {
    // A browser set to block site data throws on access rather than returning
    // null. Calls still have to work.
    expect(readStoredChoices(memoryStorage(true))).toEqual({});
    expect(() => writeStoredChoices({}, memoryStorage(true))).not.toThrow();
  });

  test('malformed or half-written values are discarded, not trusted', () => {
    const storage = memoryStorage();
    storage.setItem('talk:devices', '{"audioinput":{"deviceId":5},"videoinput":null}');
    expect(readStoredChoices(storage)).toEqual({});

    storage.setItem('talk:devices', 'not json at all');
    expect(readStoredChoices(storage)).toEqual({});
  });

  test('keeps the well-formed entries and drops the rest', () => {
    const storage = memoryStorage();
    storage.setItem(
      'talk:devices',
      '{"audioinput":{"deviceId":"mic-1","label":"Samson Q2U"},"videoinput":{"deviceId":""}}',
    );
    expect(readStoredChoices(storage)).toEqual({
      audioinput: { deviceId: 'mic-1', label: 'Samson Q2U' },
    });
  });
});

describe('resolveChoices', () => {
  const lists = (microphones: MediaDevice[]): DeviceLists => ({
    microphones,
    cameras: [],
    speakers: [],
  });

  test('says nothing about a chosen device while the devices are unknown', () => {
    // The list is empty before enumeration finishes, and stays empty whenever
    // the browser withholds device ids for want of permission. Calling that
    // "disconnected" told people their headset was gone while they wore it.
    const chosen: StoredChoices = {
      audioinput: { deviceId: 'air-1', label: 'AirPods (Bluetooth)' },
    };
    const { selected, lost } = resolveChoices(chosen, lists([]));

    expect(lost).toEqual([]);
    expect(selected.audioinput).toBeNull();
  });

  test('reports a genuinely absent device once the others are known', () => {
    const chosen: StoredChoices = {
      audioinput: { deviceId: 'air-1', label: 'AirPods (Bluetooth)' },
    };
    const { selected, lost } = resolveChoices(
      chosen,
      lists([device('mic-1', 'MacBook Pro Microphone')]),
    );

    expect(lost).toEqual([{ kind: 'audioinput', label: 'AirPods (Bluetooth)' }]);
    expect(selected.audioinput).toBeNull();
  });

  test('a connected choice is used and reported as no loss', () => {
    const chosen: StoredChoices = {
      audioinput: { deviceId: 'air-1', label: 'AirPods (Bluetooth)' },
    };
    const { selected, lost } = resolveChoices(
      chosen,
      lists([device('air-1', 'AirPods (Bluetooth)'), device('mic-1', 'MacBook Pro Microphone')]),
    );

    expect(lost).toEqual([]);
    expect(selected.audioinput).toBe('air-1');
  });

  test('no choice at all is never a loss', () => {
    const { selected, lost } = resolveChoices({}, lists([device('mic-1', 'Built-in')]));
    expect(lost).toEqual([]);
    expect(selected).toEqual({ audioinput: null, videoinput: null, audiooutput: null });
  });

  test('one kind being unknown does not silence another kind', () => {
    const { lost } = resolveChoices(
      {
        audioinput: { deviceId: 'gone', label: 'AirPods (Bluetooth)' },
        videoinput: { deviceId: 'cam-gone', label: 'Studio Display Camera' },
      },
      { microphones: [device('mic-1', 'Built-in')], cameras: [], speakers: [] },
    );

    // Microphones are known and the chosen one is absent; cameras are unknown.
    expect(lost).toEqual([{ kind: 'audioinput', label: 'AirPods (Bluetooth)' }]);
  });
});
