# voidkoi

voidkoi is a self-hosted suite: Notes, Tasks, Files, Utilikit, Habits, Talk and Wiki in one
web app with one sign-in, plus a Mac app around it (`macos/`). It is white-label: the server
address and the sign-in provider come from configuration, never from the code. The same
folder holds the voidkoi brand kit (`brand/`, `tools/`).

## Rules

- Never commit or push unless asked, and then only that once.
- Nothing about one deployment in code, tests or README: no domain, no provider name. The
  sign-in provider is "an OpenID Connect provider".
- UI text: titles and real state only, no explanatory subtitles under headers, sections,
  switches or empty states. README: short declarative sentences.
- Check the UI with headless Chrome (CDP) or an off-screen WebKit view. Never open
  windows on the user's screen. Remove test accounts and their files afterwards.
- `npx tsc --noEmit -p .`, `npm run lint`, `npx vitest run` and `npm run build` must pass.

## Layout

- `src/app/`: routes.
  - `(suite)/`: everything behind the sign-in, inside the shell, with one folder per app
    (`(suite)/notes/`…) plus `settings/` and `admin/`.
  - `login`, `setup`, `welcome`: signed-out pages and the first sign-in.
  - `s/[token]`, `u/[token]`, `share-target`: Files' public link pages.
  - `w/`: the wiki for visitors. `src/proxy.ts` serves it at the pages' own
    addresses, `/wiki/…`, to anyone signed out, and sends `/w/…` back to `/wiki/…`.
  - `api/`: the suite's own routes (`me`, `users`, `people`, `auth`, `logout`) and one
    folder per app (`api/files/…`).
- `src/modules/<app>/`: each app's own code.
  - `manifest.ts`: id, route, sub-apps, and whether it has Settings and Admin pages.
  - `settings.tsx`, `admin.tsx`: its pages in Settings and Admin, for apps that have them.
  - `server.ts`: what it does for the suite on the server: files to remove with an
    account, background jobs.
  - `errors.ts`: its own API error codes. The messages are in `<app>.errors.<code>`.
  - `components/`, `lib/`: everything else.
- `src/modules/registry.ts`: the apps in rail order, from their manifests. `servers.ts`,
  `settings-pages.ts` and `admin-pages.ts` gather the per-app files.
- `src/components/`: shared. `ui/` is the kit (Button, Modal, Input, Segmented,
  FileIcon…). `shell/` has the rail, the phone app switcher and the account menu.
  `layout/` has the frame every app uses: AppSidebar (its mark, name and places on a
  wide screen), AppPanel (the page beside it) and AppTabBar (the places on a phone).
  Inside the panel, PageLayout and PageHeader. Settings and Admin use SuiteFrame, the
  same frame with their sections as places. Tasks has its parts in a bar across the
  top instead, and Utilikit shows its tool list only inside a tool. `markdown.tsx` draws
  Markdown without raw HTML (Files, Tasks); Notes has its own pipeline, which allows
  some HTML. `brand/` has Mark, AppIcon and Wordmark.
- `src/lib/`: shared server and client code. Look here before writing a helper.
  - Sign-in: `auth`, `auth-config`, `auth-cookies`, `oidc`, `session`.
  - Accounts and access: `accounts` (`createAccountRow` makes every account), `app-access`.
  - Requests: `request` (`readJson`, `readBody` and `saveBody`, all with a size limit),
    `validate`, `like` (LIKE patterns), `rate-limit`, `http` (ranges, Content-Disposition).
  - Storage and errors: `storage`, `error-codes`, `api-errors`.
  - Formats: `format` (sizes, durations, dates), `file-types` (kinds, previews),
    `media-input` (what ffmpeg may read).
  - `api.ts`: the client for the suite's own routes.
- `prisma/schema/`: one schema file per app plus `core.prisma` (User). Tables are
  prefixed with their app (`files_items`, `notes_notes`…). Every row belongs to a user,
  except the wiki's: one wiki that everyone who uses it shares.
- `src/messages/<locale>/`: `core.json` and one file per app, loaded by
  `src/i18n/messages.ts`. An app's messages live under its id: `useTranslations('notes.editor')`.
  Each app's `app` block holds its name and sub-app names.
- `public/apps/<app>.svg`: the app icons. `public/brand/`: the koi marks.
- `macos/`: the Mac app.
- `docs/`: the README's screenshots, taken from a demo instance with made-up people and
  content. Never from a real account.

## How the suite works

- Sign-in is `VOIDKOI_AUTH=local` (accounts and passwords here; `/setup` makes the first
  one, the admin) or `oidc` (one OpenID Connect client for the whole suite). A first OIDC
  sign-in asks before it creates an account, and signing out ends the provider's
  session too.
- At the first sign-in, `/welcome` asks which apps the account uses and which of their
  parts (sub-apps) it leaves out, changed later in Settings. `users.apps` holds the apps
  ("files") and the parts left out ("-tasks.stickies"), so a part added later is on for
  everyone. Read it with `uses(keys, app, subApp?)`. `requireAppPage(app, subApp?)` in an
  app's layout sends anyone who doesn't use it home.
  `/` opens the app used last (cookie `voidkoi-app`) or the first one.
- The shell: on a wide screen, a rail of the account's apps on the left (the open one
  marked at the edge, the account menu at the foot). On a phone, `AppSwitcher` at the
  start of a page's header opens every app, Settings and signing out. `PageHeader`
  includes it.
- Each app keeps its own accent through `data-app="<id>"` on its root element. The
  colours are in `src/app/globals.css`. The theme is `@theme inline`, so `bg-accent`
  takes the app's colour.
- Settings has General (picture, name, password, apps, theme, language) and a page for
  each app the account uses whose manifest has `settings`. Admin has People and a page
  for each app whose manifest has `admin`.
- Data on disk lives under `VOIDKOI_DATA_DIR` (`data/` by default): `avatars/`, `files/…`,
  and a folder per app from `dataPath('<app>', …)`.
- One process serves everything: `server.ts` runs Next and the WebSocket endpoints apps
  register (Talk's), and Talk starts its STUN server there (UDP `VOIDKOI_STUN_PORT`,
  3478). Before Next, it refuses browser writes from other sites (sibling subdomains
  included) and works out the client's address for rate limits (`server-guards.ts`). For an account that uses Talk, the shell wraps every app in `TalkEverywhere`, so
  a call rings and goes on in any app.
- The rail's counts come from `/api/badges`, which asks each app's `server.badge()`.
  Inside the Mac app the page also posts the total to `window.webkit.messageHandlers.voidkoi`
  for the Dock (see `macos/README.md`).

## Moving an app in

The old apps are untouched in `~/Projects/{notes,tasks,habits-v2,utilikit,itodenwa,wiki}`;
Files came first and is the model.

1. Pages go under `src/app/(suite)/<app>/`. Its `layout.tsx` already guards it and sets
   `data-app`. Replace the placeholder page. Inside, use the shared kit and tokens. Leave
   out the app's own user menu, theme and language switches and sign-out: the suite has
   them. Frame it like the other apps: AppSidebar with its places, AppPanel, and
   AppTabBar on phones. Each page's header is a `PageHeader`, which starts with
   `<AppSwitcher />` on phones.
2. API routes go under `src/app/api/<app>/`, with `requireUser()` from `@/lib/session`.
   The client calls `/api/<app>/…`.
3. Use the models in `prisma/schema/<app>.prisma` with `prisma` from `@/lib/prisma` and
   types from `@/generated/prisma/client`. A schema change is a migration:
   `npx prisma migrate dev --name <what_changed>`, then commit its folder. Rules Prisma
   can't state (check constraints) go into the migration's SQL by hand, as Talk's in the
   first one.
4. Messages go in `src/messages/{en,es}/<app>.json`, both languages with the same keys
   (`src/messages/messages.test.ts` checks).
5. Sub-apps are declared in the manifest. Guard their routes with
   `requireAppPage('<app>', '<sub>')`, and hide what the account leaves out.
6. App settings go in `settings.tsx` with `settings: true`, listed in
   `settings-pages.ts`; admin-only ones in `admin.tsx` with `admin: true`, listed in
   `admin-pages.ts`. Files the app stores go under `dataPath('<app>')`.
   `server.ts` removes them with the account.
7. Port the app's unit tests next to the code.

## Development

```bash
npm install
npm run db:migrate      # creates or updates the tables
npm run dev             # server.ts: http://localhost:3000, STUN on UDP 3478
```

`.env` holds `VOIDKOI_DATABASE_URL`, `VOIDKOI_NEXTAUTH_SECRET`, `VOIDKOI_NEXTAUTH_URL`,
`VOIDKOI_DATA_DIR` and `VOIDKOI_AUTH`, plus Talk's `VOIDKOI_STUN_PORT` and
`VOIDKOI_ICE_SERVERS` and Utilikit's `VOIDKOI_YTDLP_COOKIES` (see `.env.example`).

A second dev server beside the first needs its own build folder inside `.next`:
`PORT=3100 NEXT_DIST_DIR=.next/second npm run dev`. Utilikit's converters need ffmpeg,
pandoc, typst, poppler and yt-dlp on the machine; the Docker image has them.

## The brand kit

- `brand/logo/`: the shipped logo files. They're generated, so change `tools/logo/` and
  re-export instead of editing them.
- `brand/README.md`: which file to use where, the palette, the favicon and manifest tags.
- `brand/DESIGN-LOG.md`: how the logo was designed; pictures in `brand/explorations/`.
- `tools/logo/`: the Python generator. Details in `tools/logo/README.md`.
- `brand/apps/`: the app icons, also in `public/apps/`.
- `brand/sign-in/`: a sign-in page background and logos for an identity provider
  (`tools/sign-in/background.py` makes them).

## The logo in one paragraph

A white Tancho koi (the koi with a single red spot on its head), seen from above, swims
upward in a 158° arc inside a circular void. The rim of the disk is a gravitationally
lensed crescent: thick and bright at the lower-left, a cyan hairline at the upper-right.
The custom geometric wordmark VOIDKOI repeats that crescent in the O of VOID. Vermilion
appears only on the Tancho.

## Working on the logo

```sh
python3 tools/logo/export.py     # regenerate brand/logo/ (deterministic)
python3 tools/logo/preview.py    # tools/logo/_preview/review.png: all variants and favicon sizes
python3 tools/logo/explore.py    # tools/logo/_preview/explore.png: pose/anatomy sweeps (edit VARIANTS)
```

- Render and **look** at the PNGs (Read tool) before judging any change. Every decision on
  this logo came from side-by-side renders, never from the numbers.
- Where the design constants live:
  - `ANATOMY`, `POSE`, `TANCHO_*` in `tools/logo/koi.py`.
  - Layout, ring and colours (`PAL`) in `tools/logo/emblem.py`.
  - Letters, tracking and `KERN` in `tools/logo/wordmark.py`.
  - Lockup proportions in `tools/logo/export.py`.
- To check that a refactor changed nothing, export to a temp dir and compare checksums
  with `brand/logo/`. They matched byte for byte on 2026-09-26.
- Check the favicon row at 16 and 32 px after any change to the koi or the ring.

## Palette

Void `#08070D` (page) · Abyss `#0E0A1F` (disk) · Horizon `#9D86FF` (violet ring) · Lens
`#63E6F7` (cyan ring end) · Pearl `#F7F5FF` (koi) · Tancho `#FF4D2E` (red spot only) · Ink
`#110E1C` / Mist `#F2EEFF` (wordmark on light / dark).

## Design canvas on claude.ai

https://claude.ai/artifact/S1AwMCuCzB7Wk9bYiRS6F5 is a Design-type canvas with five
artboards: Primary lockup, Horizontal lockups, Mark variants, Favicon and app icon, and
Palette. Its images are uploaded assets (`/_blob/…`). After re-exporting, upload the
changed files again and repoint the artboards. The user may edit the canvas, so read its
files with the Artifact tool's `read` action before changing it.


## Environment (this Mac)

- `python3` is a zsh function that lazy-loads pyenv into
  `/Users/guillermo/.pyenv/versions/3.12.3`, which has numpy 1.26.4 and shapely 2.1.2. On a
  fresh machine: `pip install -r tools/logo/requirements.txt`.
- `rsvg-convert` 2.63 and ImageMagick 7 (`magick`) are installed via Homebrew. Chrome and
  Firefox are available.
- Adobe Illustrator 2025 is installed. If the user hand-edits an SVG, the generator no
  longer reproduces it: fold the edit back into the code, or note it here.
- Node is via fnm (lazy-loaded), for when the web app starts.
