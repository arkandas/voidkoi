'use client';

import '@/styles/markdown.css';

import { Markdown as SuiteMarkdown } from '@/components/markdown';
import { cn } from '@/lib/cn';

/** A Markdown file, drawn like the preview in Notes. Raw HTML in it is left out. */
export function Markdown({ text, className }: { text: string; className?: string }) {
  return <SuiteMarkdown className={cn('markdown-body', className)}>{text}</SuiteMarkdown>;
}
