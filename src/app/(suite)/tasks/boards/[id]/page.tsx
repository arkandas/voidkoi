import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { currentUser } from '@/lib/session';
import { parseId } from '@/lib/validate';
import { Board } from '@/modules/tasks/components/boards/board';
import { boardTitle } from '@/modules/tasks/lib/boards';

/** The board's title, for the account it belongs to. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const id = parseId((await params).id);
  const user = id ? await currentUser() : null;
  const title = user && id ? await boardTitle(user.id, id) : null;
  return title ? { title } : {};
}

export default async function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const id = parseId((await params).id);
  if (!id) notFound();
  return <Board key={id} id={id} />;
}
