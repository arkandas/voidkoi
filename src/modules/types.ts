/** What every app tells the suite about itself. */

export const APP_IDS = ['notes', 'tasks', 'files', 'utilikit', 'habits', 'talk', 'wiki'] as const;

export type AppId = (typeof APP_IDS)[number];

export interface SubApp {
  /** Unique within its app. Stored as "<app>.<id>". */
  id: string;
}

export interface AppManifest {
  id: AppId;
  /** Where the app lives. Everything under it belongs to the app. */
  href: string;
  /** Parts of the app that can be left out. Empty for an app that is all one thing. */
  subApps: readonly SubApp[];
  /** Has a page of its own in Settings, from its `settings.tsx`. */
  settings?: boolean;
  /** Has a page of its own in Admin, from its `admin.tsx`. */
  admin?: boolean;
}

/** What an app does on the server for the suite, from its `server.ts`. */
export interface AppServer {
  /**
   * Before an account is deleted: gathers what the account keeps on disk. What
   * it returns removes those files, and runs once the account's rows are gone.
   */
  collectAccountFiles?(userId: number): Promise<() => Promise<void>>;
  /** Housekeeping while the server runs: started once, at startup. */
  startJobs?(): Promise<void> | void;
  /** Something new for the account, counted on the app's icon in the rail: unread messages, new shares. */
  badge?(userId: number): Promise<number>;
}
