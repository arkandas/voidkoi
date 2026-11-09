import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import { MESSAGES } from '@/i18n/messages';

describe('Tasks messages', () => {
  it('count sections and tasks in the delete warnings', () => {
    const t = createTranslator({ locale: 'en', messages: MESSAGES.en, namespace: 'tasks' });
    expect(t('board.deleteContents', { sections: 1, tasks: 0 })).toBe('This will also delete 1 section.');
    expect(t('board.deleteContents', { sections: 3, tasks: 1 })).toBe('This will also delete 3 sections and 1 task.');
    expect(t('section.deleteTasks', { count: 14 })).toBe('This will also delete 14 tasks in this section.');

    const tEs = createTranslator({ locale: 'es', messages: MESSAGES.es, namespace: 'tasks' });
    expect(tEs('board.deleteContents', { sections: 2, tasks: 5 })).toBe('Esto también eliminará 2 secciones y 5 tareas.');
    expect(tEs('section.deleteTasks', { count: 1 })).toBe('Esto también eliminará 1 tarea de esta sección.');
  });

});
