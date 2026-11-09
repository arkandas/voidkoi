import type { Board, Section, StickyNote, Task, TodoItem } from '@/generated/prisma/client'
import type {
  BoardDto,
  SectionDto,
  StickyNoteDto,
  TaskDto,
  TodoDto,
} from '@/modules/tasks/lib/api-types'

/** Rows as the API sends them. Server only: it reads Prisma's rows. */

export function boardDto(board: Board): BoardDto {
  return {
    id: board.id,
    title: board.title,
    description: board.description,
    position: board.position,
    createdAt: board.created_at.toISOString(),
    updatedAt: board.updated_at.toISOString(),
  }
}

export function sectionDto(section: Section): SectionDto {
  return { id: section.id, title: section.title, position: section.position, boardId: section.board_id }
}

export function taskDto(task: Task): TaskDto {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    priority: task.priority,
    position: task.position,
    deadline: task.deadline?.toISOString() ?? null,
    completed: task.completed,
    sectionId: task.section_id,
    createdAt: task.created_at.toISOString(),
    updatedAt: task.updated_at.toISOString(),
  }
}


export function todoDto(todo: TodoItem): TodoDto {
  return {
    id: todo.id,
    title: todo.title,
    description: todo.description,
    priority: todo.priority,
    position: todo.position,
    deadline: todo.deadline?.toISOString() ?? null,
    completed: todo.completed,
    createdAt: todo.created_at.toISOString(),
    updatedAt: todo.updated_at.toISOString(),
  }
}

export function stickyNoteDto(note: StickyNote): StickyNoteDto {
  return {
    id: note.id,
    content: note.content,
    color: note.color,
    x: note.position_x,
    y: note.position_y,
    width: note.width,
    height: note.height,
    z: note.z_index,
    deletedAt: note.deleted_at?.toISOString() ?? null,
    createdAt: note.created_at.toISOString(),
    updatedAt: note.updated_at.toISOString(),
  }
}
