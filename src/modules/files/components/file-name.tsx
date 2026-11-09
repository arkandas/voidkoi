import { kindColor } from '@/modules/files/components/file-icon';
import { fileExtension, fileKind, typeFor } from '@/lib/file-types';
import { cn } from '@/lib/cn';

/**
 * A name on one line. When a file's name doesn't fit, its middle goes and
 * the extension stays, in its type's color: "Rental contra….pdf". A folder's
 * name is cut at the end: a dot in it isn't an extension. `plain` draws the
 * extension lighter instead, for the viewer's dark stage.
 */
export function FileName({
  name,
  folder = false,
  plain = false,
  className,
}: {
  name: string;
  folder?: boolean;
  plain?: boolean;
  className?: string;
}) {
  const extension = folder ? '' : fileExtension(name);
  // Cut by length: fileExtension lower-cases, and the name keeps its own case.
  const cut = extension ? name.length - extension.length - 1 : name.length;
  const color = plain ? undefined : kindColor(fileKind(typeFor(name, null), name));
  return (
    <span className={cn('flex min-w-0 max-w-full', className)} title={name}>
      <span className="min-w-0 truncate">{name.slice(0, cut)}</span>
      {cut < name.length ? <span className={cn('shrink-0 font-normal', color ?? 'opacity-65')}>{name.slice(cut)}</span> : null}
    </span>
  );
}
