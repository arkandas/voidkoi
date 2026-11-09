import 'katex/dist/katex.min.css';
import '@/styles/markdown.css';
import '@/modules/notes/notes.css';
import '@/modules/notes/font-faces';

import { requireAppPage } from '@/lib/app-access';
import { appMetadata } from '@/lib/page-title';

export const generateMetadata = () => appMetadata('notes');

export default async function NotesLayout({ children }: { children: React.ReactNode }) {
  await requireAppPage('notes');
  return (
    <div data-app="notes" className="flex min-w-0 flex-1">
      {children}
    </div>
  );
}
