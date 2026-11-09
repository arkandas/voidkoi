import { NextRequest, NextResponse } from 'next/server';
import { apiError, handle } from '@/lib/api-errors';
import { readJson } from '@/lib/request';
import { requireAdmin } from '@/lib/session';
import { getSettings, saveSettings } from '@/modules/files/lib/settings';
import { parseBytes } from '@/lib/validate';

export async function GET() {
  return handle('loadFailed', async () => {
    await requireAdmin();
    return NextResponse.json(await getSettings());
  });
}

/** Null means no limit. */
export async function PUT(request: NextRequest) {
  return handle('saveFailed', async () => {
    await requireAdmin();
    const body = await readJson(request);
    const fields = ['maxUploadBytes', 'defaultQuotaBytes', 'uploadLinkMaxBytes'] as const;
    const read = (value: unknown) => (value === null ? null : parseBytes(value));
    if (fields.some(field => body?.[field] !== null && read(body?.[field]) === null)) return apiError('invalidQuota', 400);
    return NextResponse.json(
      await saveSettings({
        maxUploadBytes: read(body!.maxUploadBytes),
        defaultQuotaBytes: read(body!.defaultQuotaBytes),
        uploadLinkMaxBytes: read(body!.uploadLinkMaxBytes),
      }),
    );
  });
}
