/** The JSON Tasks' API speaks. Shared by its route handlers and its pages. */

export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const
export type Priority = (typeof PRIORITIES)[number]

export const STICKY_COLORS = ['yellow', 'blue', 'green', 'pink', 'orange', 'purple', 'cyan', 'red', 'lime'] as const
export type StickyColor = (typeof STICKY_COLORS)[number]

export interface BoardDto {
  id: number
  title: string
  description: string | null
  position: number
  createdAt: string
  updatedAt: string
}

export interface TaskDto {
  id: number
  title: string
  description: string | null
  priority: Priority
  position: number
  /** The day it is due, as midnight UTC. */
  deadline: string | null
  completed: boolean
  sectionId: number
  createdAt: string
  updatedAt: string
}

export interface SectionDto {
  id: number
  title: string
  position: number
  boardId: number
}

export interface SectionWithTasks extends SectionDto {
  tasks: TaskDto[]
}

/** A board with its sections and their tasks, in order. */
export interface BoardDetail extends BoardDto {
  sections: SectionWithTasks[]
}


export interface TodoDto {
  id: number
  title: string
  description: string | null
  priority: Priority
  position: number
  deadline: string | null
  completed: boolean
  createdAt: string
  updatedAt: string
}

export interface StickyNoteDto {
  id: number
  content: string
  color: StickyColor
  x: number
  y: number
  width: number
  height: number
  z: number
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface TaskHit {
  id: number
  title: string
  description: string | null
  priority: Priority
  sectionId: number
  sectionTitle: string
  boardId: number
  boardTitle: string
}

export interface TodoHit {
  id: number
  title: string
  description: string | null
  completed: boolean
}

export interface StickyNoteHit {
  id: number
  content: string
  color: StickyColor
}

/** What a search finds, in the parts of Tasks the account uses. */
export interface SearchResults {
  tasks: TaskHit[]
  todos: TodoHit[]
  stickyNotes: StickyNoteHit[]
}

/** A search result someone opened: where it is, to show it there. */
export type SearchHit =
  | { type: 'task'; id: number; boardId: number }
  | { type: 'todo'; id: number }
  | { type: 'stickyNote'; id: number }
