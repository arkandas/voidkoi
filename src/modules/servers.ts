import type { AppId, AppServer } from '@/modules/types';

import { server as files } from '@/modules/files/server';
import { server as habits } from '@/modules/habits/server';
import { server as notes } from '@/modules/notes/server';
import { server as talk } from '@/modules/talk/server';
import { server as tasks } from '@/modules/tasks/server';
import { server as utilikit } from '@/modules/utilikit/server';
import { server as wiki } from '@/modules/wiki/server';

/** Each app's server side, for what the suite does with all of them. */
export const SERVERS: Record<AppId, AppServer> = { notes, tasks, files, talk, habits, utilikit, wiki };
