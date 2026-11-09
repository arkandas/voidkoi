import { NextRequest } from 'next/server';
import { jobDownload } from '@/modules/utilikit/lib/job-routes';

const MIME_TYPES = {
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

export function GET(request: NextRequest) {
  return jobDownload(request, 'pdf', MIME_TYPES, (job, extension) => String(job.data.outputName ?? `document${extension}`));
}
