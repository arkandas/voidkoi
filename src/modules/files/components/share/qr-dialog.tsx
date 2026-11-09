'use client';

import { Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { Button, Modal } from '@/components/ui';
import { qrCode, type QrCode } from '@/lib/qr';

/** Pixels a side, about, of the downloaded picture: sharp in print and on a slide. */
const PICTURE_EDGE = 1024;

/** Save the code as a PNG, black on white, called `fileName`. */
function savePicture(code: QrCode, fileName: string): void {
  const scale = Math.max(8, Math.ceil(PICTURE_EDGE / code.size));
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = code.size * scale;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.scale(scale, scale);
  context.fillStyle = '#000000';
  context.fill(new Path2D(code.path));
  canvas.toBlob(blob => {
    if (!blob) return;
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = `${fileName}.png`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
  }, 'image/png');
}

/**
 * A link as a QR code, to open it from a phone. Black on white in either
 * theme, since that is what cameras read best.
 */
export function QrDialog({ url, fileName, onClose }: { url: string | null; fileName: string; onClose(): void }) {
  const t = useTranslations('files.share');
  const tCommon = useTranslations('common');
  const code = useMemo(() => (url ? qrCode(url) : null), [url]);

  return (
    <Modal open={url !== null} label={t('qr')} title={t('qr')} onClose={onClose}>
      {code ? (
        <div className="flex flex-col items-center gap-4">
          <div className="w-full max-w-64 overflow-hidden rounded-xl bg-white ring-1 ring-line">
            <svg viewBox={`0 0 ${code.size} ${code.size}`} shapeRendering="crispEdges" role="img" aria-label={url ?? ''} className="block w-full">
              <path d={code.path} fill="#000" />
            </svg>
          </div>
          <p className="max-w-full text-center font-mono text-xs break-all text-ink-muted">{url}</p>
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={onClose}>
              {tCommon('done')}
            </Button>
            <Button icon={<Download size={16} />} onClick={() => savePicture(code, fileName)}>
              {t('qrDownload')}
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
