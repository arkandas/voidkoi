import { describe, expect, it } from 'vitest';

import { ADMIN_PAGES } from '@/modules/admin-pages';
import { APPS } from '@/modules/registry';
import { SETTINGS_PAGES } from '@/modules/settings-pages';

describe('the apps’ pages in Settings and Admin', () => {
  it('exist exactly for the apps whose manifests say so', () => {
    expect(Object.keys(SETTINGS_PAGES).sort()).toEqual(APPS.filter(app => app.settings).map(app => app.id).sort());
    expect(Object.keys(ADMIN_PAGES).sort()).toEqual(APPS.filter(app => app.admin).map(app => app.id).sort());
  });
});
