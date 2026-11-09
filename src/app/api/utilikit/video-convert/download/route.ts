import { NextRequest } from 'next/server';
import { jobDownload } from '@/modules/utilikit/lib/job-routes';

const MIME_TYPES = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.gif': 'image/gif',
};

export function GET(request: NextRequest) {
  return jobDownload(request, 'video', MIME_TYPES, (_, extension) => `converted${extension}`);
}
