import { NextRequest } from 'next/server';
import { jobDownload } from '@/modules/utilikit/lib/job-routes';

const MIME_TYPES = {
  '.md': 'text/markdown; charset=utf-8',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.html': 'text/html; charset=utf-8',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
};

export function GET(request: NextRequest) {
  return jobDownload(request, 'document', MIME_TYPES, (_, extension) => `converted-document${extension}`);
}
