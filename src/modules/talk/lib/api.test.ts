import { afterEach, describe, expect, it, vi } from 'vitest';

import { api } from './api';

describe('opening the chat with someone', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is a POST, which a link from another site can’t send', async () => {
    const fetch = vi.fn(async () => Response.json({ conversation: { id: 7 } }));
    vi.stubGlobal('fetch', fetch);
    expect(await api.conversationWith(42)).toEqual({ conversation: { id: 7 } });
    expect(fetch).toHaveBeenCalledWith('/api/talk/conversations/with/42', expect.objectContaining({ method: 'POST' }));
  });

  it('has no GET: following a link to it makes nothing', async () => {
    const route = await import('@/app/api/talk/conversations/with/[userId]/route');
    expect(Object.keys(route)).toEqual(['POST']);
  });
});
