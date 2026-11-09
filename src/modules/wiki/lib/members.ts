import type { User } from '@/generated/prisma/client'
import { toPerson } from '@/lib/accounts'
import { ApiError } from '@/lib/error-codes'
import { prisma } from '@/lib/prisma'
import { uses } from '@/modules/registry'
import type { WikiMemberDto } from '@/modules/wiki/lib/api-types'

type Member = User & { wiki_editor: { user_id: number } | null }

function toMemberDto(user: Member): WikiMemberDto {
  const admin = user.role === 'ADMIN'
  return { ...toPerson(user), admin, editor: admin || user.wiki_editor !== null }
}

/** The accounts that use the wiki, by username, with whether each may write. */
export async function listMembers(): Promise<WikiMemberDto[]> {
  const users = await prisma.user.findMany({
    where: { apps: { has: 'wiki' } },
    include: { wiki_editor: { select: { user_id: true } } },
    orderBy: { username: 'asc' },
  })
  return users.map(toMemberDto)
}

/** Let an account that uses the wiki write in it, or only read. Admins always write. */
export async function setEditor(userId: number, editor: boolean): Promise<WikiMemberDto> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user || !uses(user.apps, 'wiki')) throw new ApiError('notFound', 404)
  if (editor) await prisma.wikiEditor.upsert({ where: { user_id: userId }, update: {}, create: { user_id: userId } })
  else await prisma.wikiEditor.deleteMany({ where: { user_id: userId } })
  return toMemberDto(await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { wiki_editor: { select: { user_id: true } } } }))
}
