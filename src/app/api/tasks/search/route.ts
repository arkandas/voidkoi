import { NextRequest, NextResponse } from 'next/server'
import { handle } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { uses } from '@/modules/registry'
import type { SearchResults } from '@/modules/tasks/lib/api-types'
import { ownTask } from '@/modules/tasks/lib/scope'
import { escapeLike } from '@/lib/like'

const MAX_QUERY_LENGTH = 100
const MAX_RESULTS = 25

/** Tasks, to-dos and sticky notes whose text has the query, in the parts of Tasks the account uses. */
export async function GET(request: NextRequest) {
  return handle('loadFailed', async () => {
    const user = await requireUser()
    const query = (request.nextUrl.searchParams.get('q') ?? '').trim().slice(0, MAX_QUERY_LENGTH)
    const empty: SearchResults = { tasks: [], todos: [], stickyNotes: [] }
    if (!query) return NextResponse.json(empty)

    const matches = { contains: escapeLike(query), mode: 'insensitive' as const }
    const [tasks, todos, stickyNotes] = await Promise.all([
      uses(user.apps, 'tasks', 'boards')
        ? prisma.task.findMany({
            where: { ...ownTask(user.id), OR: [{ title: matches }, { description: matches }] },
            select: {
              id: true,
              title: true,
              description: true,
              priority: true,
              section: { select: { id: true, title: true, board: { select: { id: true, title: true } } } },
            },
            orderBy: { updated_at: 'desc' },
            take: MAX_RESULTS,
          })
        : [],
      uses(user.apps, 'tasks', 'todo')
        ? prisma.todoItem.findMany({
            where: { user_id: user.id, OR: [{ title: matches }, { description: matches }] },
            select: { id: true, title: true, description: true, completed: true },
            orderBy: [{ completed: 'asc' }, { updated_at: 'desc' }],
            take: MAX_RESULTS,
          })
        : [],
      uses(user.apps, 'tasks', 'stickies')
        ? prisma.stickyNote.findMany({
            where: { user_id: user.id, deleted_at: null, content: matches },
            select: { id: true, content: true, color: true },
            orderBy: { updated_at: 'desc' },
            take: MAX_RESULTS,
          })
        : [],
    ])

    const results: SearchResults = {
      tasks: tasks.map(task => ({
        id: task.id,
        title: task.title,
        description: task.description,
        priority: task.priority,
        sectionId: task.section.id,
        sectionTitle: task.section.title,
        boardId: task.section.board.id,
        boardTitle: task.section.board.title,
      })),
      todos,
      stickyNotes,
    }
    return NextResponse.json(results)
  })
}
