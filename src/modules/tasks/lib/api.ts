import { request } from '@/lib/api'
import type {
  BoardDetail,
  BoardDto,
  Priority,
  SearchResults,
  SectionDto,
  StickyColor,
  StickyNoteDto,
  TaskDto,
  TodoDto,
} from '@/modules/tasks/lib/api-types'

export interface BoardInput {
  title?: string
  description?: string | null
}

export interface ItemInput {
  title?: string
  description?: string | null
  priority?: Priority
  /** A day, "2026-10-27", or null for none. */
  deadline?: string | null
  completed?: boolean
}

export interface StickyInput {
  content?: string
  color?: StickyColor
  x?: number
  y?: number
  width?: number
  height?: number
  z?: number
}

/** Tasks' calls to its routes under /api/tasks. */
export const api = {
  boards: () => request<BoardDto[]>('GET', '/tasks/boards', undefined, 'loadFailed'),
  board: (id: number) => request<BoardDetail>('GET', `/tasks/boards/${id}`, undefined, 'loadFailed'),
  createBoard: (board: BoardInput) => request<BoardDto>('POST', '/tasks/boards', board, 'saveFailed'),
  updateBoard: (id: number, board: BoardInput) => request<BoardDto>('PUT', `/tasks/boards/${id}`, board, 'saveFailed'),
  deleteBoard: (id: number) => request<unknown>('DELETE', `/tasks/boards/${id}`, undefined, 'deleteFailed'),
  moveBoard: (boardId: number, position: number) =>
    request<unknown>('PUT', '/tasks/boards/reorder', { boardId, position }, 'saveFailed'),

  createSection: (boardId: number, title: string) => request<SectionDto>('POST', '/tasks/sections', { boardId, title }, 'saveFailed'),
  renameSection: (id: number, title: string) => request<SectionDto>('PUT', `/tasks/sections/${id}`, { title }, 'saveFailed'),
  deleteSection: (id: number) => request<unknown>('DELETE', `/tasks/sections/${id}`, undefined, 'deleteFailed'),

  createTask: (sectionId: number, task: ItemInput) => request<TaskDto>('POST', '/tasks/tasks', { ...task, sectionId }, 'saveFailed'),
  updateTask: (id: number, task: ItemInput) => request<TaskDto>('PUT', `/tasks/tasks/${id}`, task, 'saveFailed'),
  moveTask: (id: number, sectionId: number, position: number) =>
    request<TaskDto>('PUT', `/tasks/tasks/${id}/move`, { sectionId, position }, 'saveFailed'),
  deleteTask: (id: number) => request<unknown>('DELETE', `/tasks/tasks/${id}`, undefined, 'deleteFailed'),


  todos: () => request<TodoDto[]>('GET', '/tasks/todos', undefined, 'loadFailed'),
  createTodo: (todo: ItemInput) => request<TodoDto>('POST', '/tasks/todos', todo, 'saveFailed'),
  updateTodo: (id: number, todo: ItemInput & { position?: number }) => request<TodoDto>('PUT', `/tasks/todos/${id}`, todo, 'saveFailed'),
  deleteTodo: (id: number) => request<unknown>('DELETE', `/tasks/todos/${id}`, undefined, 'deleteFailed'),

  stickyNotes: () => request<StickyNoteDto[]>('GET', '/tasks/stickynotes', undefined, 'loadFailed'),
  createStickyNote: (note: StickyInput) => request<StickyNoteDto>('POST', '/tasks/stickynotes', note, 'saveFailed'),
  updateStickyNote: (id: number, note: StickyInput) => request<StickyNoteDto>('PUT', `/tasks/stickynotes/${id}`, note, 'saveFailed'),
  trashStickyNote: (id: number) => request<unknown>('DELETE', `/tasks/stickynotes/${id}`, undefined, 'deleteFailed'),
  trash: () => request<StickyNoteDto[]>('GET', '/tasks/stickynotes/trash', undefined, 'loadFailed'),
  restoreStickyNote: (id: number) => request<StickyNoteDto>('POST', `/tasks/stickynotes/${id}/restore`, undefined, 'restoreFailed'),
  emptyTrash: () => request<unknown>('DELETE', '/tasks/stickynotes/trash', undefined, 'deleteFailed'),

  search: (query: string) => request<SearchResults>('GET', `/tasks/search?q=${encodeURIComponent(query)}`, undefined, 'loadFailed'),
}
