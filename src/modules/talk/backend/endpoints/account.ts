import type { User } from '@/generated/prisma/client';
import { ApiError } from '@/lib/error-codes';
import { requireUser } from '@/lib/session';
import { uses } from '@/modules/registry';

/** The signed-in account, if it uses Talk. */
export async function requireTalkUser(): Promise<User> {
  const user = await requireUser();
  if (!uses(user.apps, 'talk')) throw new ApiError('forbidden', 403);
  return user;
}
