import { NextRequest, NextResponse } from 'next/server';
import { apiError, handle } from '@/lib/api-errors';
import { readJson } from '@/lib/request';
import { requireAdmin } from '@/lib/session';
import { getSettings, saveSettings, toAdminSettingsDto, toSettingsDto } from '@/modules/wiki/lib/settings';
import { loadIndex } from '@/modules/wiki/lib/wiki';
import { LIMITS, withoutNul } from '@/modules/wiki/lib/validate';
import { parseId } from '@/lib/validate';

export async function GET() {
  return handle('loadFailed', async () => {
    await requireAdmin();
    const settings = await getSettings();
    return NextResponse.json(toAdminSettingsDto(settings, await loadIndex(settings)));
  });
}

/** `{ name, homePageId, rootVisibility, password, allowIndexing }`. */
export async function PUT(request: NextRequest) {
  return handle('saveFailed', async () => {
    await requireAdmin();
    const body = await readJson(request);
    const name = typeof body?.name === 'string' ? withoutNul(body.name).replace(/\s+/g, ' ').trim() : '';
    if (!name || name.length > LIMITS.wikiName) return apiError('invalidTitle', 400);
    const homePageId = body?.homePageId === null || body?.homePageId === undefined ? null : parseId(body.homePageId);
    if (body?.homePageId != null && homePageId === null) return apiError('notFound', 404);
    const rootVisibility = body?.rootVisibility;
    if (rootVisibility !== 'public' && rootVisibility !== 'private' && rootVisibility !== 'password') return apiError('invalidInput', 400);
    const password = typeof body?.password === 'string' && body.password.length > 0 ? body.password : undefined;
    if (password && password.length > LIMITS.password) return apiError('invalidInput', 400);
    if (typeof body?.allowIndexing !== 'boolean') return apiError('invalidInput', 400);
    const saved = await saveSettings({ name, homePageId, rootVisibility, password, allowIndexing: body.allowIndexing });
    return NextResponse.json(toSettingsDto(saved));
  });
}
