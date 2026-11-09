import enCore from '@/messages/en/core.json';
import enFiles from '@/messages/en/files.json';
import enHabits from '@/messages/en/habits.json';
import enNotes from '@/messages/en/notes.json';
import enTalk from '@/messages/en/talk.json';
import enTasks from '@/messages/en/tasks.json';
import enUtilikit from '@/messages/en/utilikit.json';
import enWiki from '@/messages/en/wiki.json';
import esCore from '@/messages/es/core.json';
import esFiles from '@/messages/es/files.json';
import esHabits from '@/messages/es/habits.json';
import esNotes from '@/messages/es/notes.json';
import esTalk from '@/messages/es/talk.json';
import esTasks from '@/messages/es/tasks.json';
import esUtilikit from '@/messages/es/utilikit.json';
import esWiki from '@/messages/es/wiki.json';

/**
 * Every message, per language: the suite's own at the top, each app's under
 * its id. An app's component reads its own with `useTranslations('notes.editor')`.
 */
const en = { ...enCore, notes: enNotes, tasks: enTasks, files: enFiles, talk: enTalk, habits: enHabits, utilikit: enUtilikit, wiki: enWiki };
const es = { ...esCore, notes: esNotes, tasks: esTasks, files: esFiles, talk: esTalk, habits: esHabits, utilikit: esUtilikit, wiki: esWiki };

export type Messages = typeof en;

export const MESSAGES: Record<'en' | 'es', Messages> = { en, es: es as Messages };
