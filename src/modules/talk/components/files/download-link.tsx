import { Download } from 'lucide-react';
import type { AnchorHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';
import { urls } from '@/modules/talk/lib/api';

export interface DownloadLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  attachmentId: string;
  /** Names the link, e.g. "Download report.pdf". */
  label: string;
}

/** A plain link, so the browser's own download takes over. The server says `attachment`, so the page stays put. */
export function DownloadLink({ attachmentId, label, className, ...props }: DownloadLinkProps) {
  return (
    <a
      href={urls.attachment(attachmentId, { download: true })}
      download
      aria-label={label}
      title={label}
      className={cn('inline-flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors', 'focus:outline-hidden focus-visible:ring-4', className)}
      {...props}
    >
      <Download size={18} aria-hidden="true" />
    </a>
  );
}
