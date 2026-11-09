import { NextRequest } from 'next/server';
import { jobDownload } from '@/modules/utilikit/lib/job-routes';
import { DOWNLOAD_MIME_TYPES, sanitizeFilename } from '@/modules/utilikit/lib/media-types';

export function GET(request: NextRequest) {
  return jobDownload(
    request,
    'download',
    DOWNLOAD_MIME_TYPES,
    (job, extension) => `${sanitizeFilename(String(job.data.title ?? ''), 'video')}${extension}`,
  );
}
