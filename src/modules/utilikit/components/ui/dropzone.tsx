'use client';

import { Upload, type LucideIcon } from 'lucide-react';
import { useState } from 'react';

import { cn } from '@/lib/cn';

interface DropzoneProps {
  id?: string;
  onFiles: (files: File[]) => void;
  title: string;
  hint?: string;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  icon?: LucideIcon;
  className?: string;
}

/** Where a file is dropped or picked. */
export function Dropzone({
  id,
  onFiles,
  title,
  hint,
  accept,
  multiple = false,
  disabled = false,
  icon: Icon = Upload,
  className,
}: DropzoneProps) {
  const [dragging, setDragging] = useState(false);

  const emit = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (files.length > 0) onFiles(multiple ? files : files.slice(0, 1));
  };

  return (
    <label
      onDragOver={event => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={event => {
        event.preventDefault();
        setDragging(false);
        if (!disabled) emit(event.dataTransfer.files);
      }}
      className={cn(
        'flex min-h-48 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:border-accent hover:bg-accent-soft/30',
        dragging ? 'border-accent bg-accent-soft/40' : 'border-line-strong bg-raised',
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">
        <Icon size={22} aria-hidden="true" />
      </span>
      <span className="text-sm font-semibold text-ink">{title}</span>
      {hint ? <span className="text-xs text-ink-muted">{hint}</span> : null}
      <input
        id={id}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="sr-only"
        onChange={event => {
          emit(event.target.files);
          event.target.value = '';
        }}
      />
    </label>
  );
}
