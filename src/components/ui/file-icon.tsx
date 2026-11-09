import {
  BookOpen,
  File as PlainFile,
  FileArchive,
  FileChartPie,
  FileCode,
  FileHeadphone,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType,
  FileVideoCamera,
  Folder,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@/lib/cn';
import { fileKind, type FileKind } from '@/lib/file-types';

const ICONS: Record<FileKind, LucideIcon> = {
  image: FileImage,
  video: FileVideoCamera,
  audio: FileHeadphone,
  pdf: FileText,
  document: FileType,
  spreadsheet: FileSpreadsheet,
  presentation: FileChartPie,
  archive: FileArchive,
  book: BookOpen,
  code: FileCode,
  text: FileText,
  file: PlainFile,
};

/** Well-known types have a colour of their own, on their icon and extension. The rest stay grey. */
const KIND_COLORS: Partial<Record<FileKind, string>> = {
  pdf: 'text-kind-pdf',
  document: 'text-kind-document',
  spreadsheet: 'text-kind-spreadsheet',
  presentation: 'text-kind-presentation',
  archive: 'text-kind-archive',
  book: 'text-kind-document',
  image: 'text-kind-image',
  video: 'text-kind-video',
  audio: 'text-kind-audio',
};

export function kindColor(kind: FileKind): string | undefined {
  return KIND_COLORS[kind];
}

/** A file's icon from its type and, failing that, its name. Folders get the folder. */
export function FileIcon({
  kind = 'file',
  mime,
  name,
  size = 20,
  className,
}: {
  kind?: 'folder' | 'file';
  mime: string | null;
  name: string;
  size?: number;
  className?: string;
}) {
  if (kind === 'folder') {
    return <Folder size={size} aria-hidden="true" fill="currentColor" fillOpacity={0.18} className={cn('shrink-0', className)} />;
  }
  const Icon = ICONS[fileKind(mime, name)];
  return <Icon size={size} aria-hidden="true" className={cn('shrink-0', className)} />;
}
