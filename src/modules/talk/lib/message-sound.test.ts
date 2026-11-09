import { describe, expect, it } from 'vitest';

import { shouldChime, type ChimeContext } from './message-sound';

const base: ChimeContext = {
  conversationId: 7,
  openConversationId: 7,
  visible: true,
  focused: true,
  pushedHere: false,
};

describe('shouldChime', () => {
  it('stays quiet for a message already in front of you', () => {
    expect(shouldChime(base)).toBe(false);
  });

  it('plays for a message in another conversation, or with none open', () => {
    expect(shouldChime({ ...base, openConversationId: 3 })).toBe(true);
    expect(shouldChime({ ...base, openConversationId: null })).toBe(true);
  });

  it('plays when the window with the conversation open is not the one in use', () => {
    expect(shouldChime({ ...base, focused: false })).toBe(true);
  });

  it('in a background tab, leaves it to the notification when there is one', () => {
    expect(shouldChime({ ...base, visible: false, pushedHere: true })).toBe(false);
    expect(shouldChime({ ...base, visible: false, pushedHere: false })).toBe(true);
  });
});
