import { NextRequest } from 'next/server';
import { jobDownload } from '@/modules/utilikit/lib/job-routes';

const MIME_TYPES = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.opus': 'audio/opus',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
};

export function GET(request: NextRequest) {
  return jobDownload(request, 'audio', MIME_TYPES, (_, extension) => `converted${extension}`);
}
