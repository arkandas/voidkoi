<img src="public/icon.svg" alt="voidkoi logo" width="64" height="64">

# voidkoi

voidkoi is a self-hosted suite for your notes, tasks, files, habits, chats and wiki, with a native Mac client

![voidkoi with Notes open](docs/notes.jpg)

## Apps

### Notes

![Notes](docs/notes-dark.jpg)

Notes is a Markdown notebook that saves every change automatically

- Supports live preview, pinned notes, LaTeX equations and code highlighting
- Paste or drop images directly into a note
- Group notes into fully customizable folders
- Search the full text of every note
- Export any note to Markdown, PDF or Word

### Tasks

![Tasks](docs/tasks.jpg)

Tasks is a project management app based on Kanban boards

- Supports multiple Kanban boards with custom columns
- Drag tasks between columns to update their status
- Priorities, deadlines and full Markdown support for every task
- Keep one-off jobs on a separate to-do list
- Write and organize reminders and ideas on a whiteboard of virtual Post-it notes
- Unified text search for boards, to-dos and sticky notes

### Files

![Files](docs/files.jpg)

Files is an online drive for storage and sharing

- Support for file and folder uploads
- Browser preview and playback for audio, video, images, PDFs, text and Markdown files
- In-browser editing for text and Markdown
- Dedicated EPUB reader
- Share links with QR codes, access control, passwords, expiry dates and download limits
- Direct sharing with other internal users
- Create public upload links for receiving files from people without an account

### Utilikit

![Utilikit](docs/utilikit.jpg)

Utilikit is a collection of utilities for working with files and data

- Media transcoding, compression and trimming, including GIF export
- Video and audio downloads from YouTube and many other sites
- Document conversion between Markdown, Word, HTML, PDF and plain text
- PDF merging, splitting, page extraction and export to images
- Image cropping, resizing and conversion, including HEIC
- QR code generation and scanning
- Formatters and decoders for JSON, SQL, Base64 and JWTs
- Generators for hashes, UUIDs and secure passwords
- DNS lookups and TLS certificate inspection

### Habits

![Habits](docs/habits.jpg)

Habits is a fitness tracker and meal log

- Record weigh-ins and follow the trend on charts
- Projected date for reaching a target weight
- Workout history with a weekly session goal
- Meal logging with daily calorie totals
- Reusable templates for frequent foods and exercises
- Monthly calendar and yearly grid of active days

### Talk

![Talk](docs/talk.jpg)

Talk is an instant messenger

- One-to-one and group chats
- Image and file sharing up to 1 GB
- Peer-to-peer voice and video calls
- Online and busy status for every contact
- History of missed and answered calls
- Push notifications

### Wiki

![Wiki](docs/wiki.jpg)

Wiki is a team documentation site

- Separate permissions for authors and readers
- Drag-and-drop folder tree
- Markdown editor with live preview and inline images, tables, math, Mermaid diagrams and annotated code blocks
- Draft and publish, revision history, diffs and page restore
- Public, private and password-protected pages
- Full-text search across all pages

## Installation

PostgreSQL must be provided as an external database instance. The Docker image includes all third-party tools required by Files and Utilikit

### Local installation with Docker Compose

1. Build the image:

   ```bash
   docker build -t voidkoi .
   ```

2. Save the following as `compose.yaml` in an empty directory:

   ```yaml
   services:
     db:
       image: postgres:17-alpine
       environment:
         POSTGRES_USER: voidkoi
         POSTGRES_PASSWORD: ${DB_PASSWORD}
         POSTGRES_DB: voidkoi
       volumes:
         - db:/var/lib/postgresql/data
       restart: unless-stopped

     voidkoi:
       image: voidkoi
       depends_on:
         - db
       ports:
         - "3000:3000"
         - "3478:3478/udp"
       environment:
         VOIDKOI_DATABASE_URL: postgresql://voidkoi:${DB_PASSWORD}@db:5432/voidkoi
         VOIDKOI_NEXTAUTH_SECRET: ${SECRET}
         VOIDKOI_NEXTAUTH_URL: http://localhost:3000
       volumes:
         - data:/app/data
       restart: unless-stopped

   volumes:
     db:
     data:
   ```

3. In the same directory, create a `.env` file that holds the database password and the session secret:

   ```bash
   printf 'DB_PASSWORD=%s\nSECRET=%s\n' "$(openssl rand -hex 16)" "$(openssl rand -base64 32)" > .env
   ```

4. Start the services:

   ```bash
   docker compose up -d
   ```

5. Open http://localhost:3000/setup and create the administrator account. Further accounts are created under **Admin**.

The container creates or updates the database tables on every start and stores files, pictures and attachments in the `data` volume.

### OpenID Connect sign-in

To authenticate users through an OpenID Connect provider instead of voidkoi passwords:

1. Register voidkoi with the provider as a confidential client:
   - Redirect URI: `http://localhost:3000/api/auth/callback/oidc`
   - Post-logout redirect URI: `http://localhost:3000/login?signedOut=1`
   - Scopes: `openid`, `email` and `profile`
   - ID tokens signed with RS256

   On a server, replace `http://localhost:3000` in both URIs with the server's public address.

2. Add the client to the `voidkoi` service in `compose.yaml`:

   ```yaml
         VOIDKOI_AUTH: oidc
         VOIDKOI_OIDC_ISSUER: https://sso.example.com/
         VOIDKOI_OIDC_CLIENT_ID: ${OIDC_CLIENT_ID}
         VOIDKOI_OIDC_CLIENT_SECRET: ${OIDC_CLIENT_SECRET}
         VOIDKOI_OIDC_NAME: SSO
   ```

   `VOIDKOI_OIDC_ISSUER` is the provider's issuer URL, which serves `/.well-known/openid-configuration`. `VOIDKOI_OIDC_NAME` is the label on the sign-in button. The client ID and secret belong in `.env`.

3. Run `docker compose up -d` again and sign in. On a new installation, the first user to sign in becomes the administrator.

[Authentication](#authentication) describes how voidkoi matches provider accounts and signs them out.

### From source

Without Docker, voidkoi requires Node.js 24 or newer and the following programs for the tools that run on the server:

- ffmpeg: video and song thumbnails, playback in Files and Utilikit's audio and video converters
- poppler: PDF thumbnails in Files and Utilikit's PDF tools
- pandoc and typst: Utilikit's document converter
- yt-dlp: Utilikit's video downloader

`setup-database.sql` creates the `voidkoi_db` database and the `voidkoi_user` role. Set a password in the file, then run it:

```bash
psql -h YOUR_POSTGRES_HOST -U postgres -f setup-database.sql
```

Then run:

```bash
cp .env.example .env    # fill it in, see Configuration
npm install
npm run db:migrate      # creates or updates the tables
npm run dev
```

The administrator account is created at http://localhost:3000/setup. Stored files go in `data/` inside the project directory.

### Server deployment

```bash
docker build -t voidkoi .

docker run -d --name voidkoi -p 3000:3000 -p 3478:3478/udp \
  -v voidkoi_data:/app/data \
  -e VOIDKOI_DATABASE_URL="postgresql://voidkoi_user:YOUR_PASSWORD@YOUR_POSTGRES_HOST:5432/voidkoi_db" \
  -e VOIDKOI_NEXTAUTH_SECRET="YOUR_SECRET" \
  -e VOIDKOI_NEXTAUTH_URL="https://voidkoi.example.com" \
  voidkoi
```

The container applies database migrations when it starts. The administrator account is created at `/setup`. [Reverse proxy](#reverse-proxy) covers serving the suite over HTTPS.

Stored files live in the `/app/data` volume. The container runs as UID 1001, so a bind-mounted directory must be writable by that user. UDP port 3478 is used by Talk's STUN server.

yt-dlp requires frequent updates to keep working. Each build installs the latest release, so the image should be rebuilt every few weeks.

## Configuration

| Variable | Description |
|---|---|
| `VOIDKOI_DATABASE_URL` | PostgreSQL connection string |
| `VOIDKOI_NEXTAUTH_SECRET` | Signs the session cookie and unlocked share links. Generate one with `openssl rand -base64 32` |
| `VOIDKOI_NEXTAUTH_URL` | The suite's public URL. When it starts with `https://`, cookies are marked secure |
| `VOIDKOI_DATA_DIR` | Directory for stored files. Defaults to `data` in the working directory or `/app/data` in the Docker image |
| `VOIDKOI_AUTH` | `local` (default) or `oidc` |
| `VOIDKOI_OIDC_ISSUER` | OIDC issuer URL |
| `VOIDKOI_OIDC_CLIENT_ID` | OIDC client ID |
| `VOIDKOI_OIDC_CLIENT_SECRET` | OIDC client secret |
| `VOIDKOI_OIDC_NAME` | The provider's name on the sign-in button. Defaults to `SSO` |
| `VOIDKOI_STUN_PORT` | UDP port of Talk's STUN server. Defaults to `3478`. `0` disables it |
| `VOIDKOI_ICE_SERVERS` | ICE servers for calls, as JSON. When set, calls use these instead of Talk's STUN server |
| `VOIDKOI_YTDLP_COOKIES` | Path to a `cookies.txt` file for sites that only allow downloads when signed in |

The maximum file size and the storage limits of Files are set under **Admin**.

### Authentication

![The sign-in page](docs/sign-in.jpg)

With `VOIDKOI_AUTH=local`, voidkoi stores accounts and passwords itself. The first account, created at `/setup`, is the administrator, who creates all other accounts under **Admin**. Users change their own passwords under **Settings**. The administrator can also set a new one under **Admin**. Changing a password signs the account out of its other sessions. Sign-in attempts are rate-limited per username and per address.

With `VOIDKOI_AUTH=oidc`, users sign in through an OpenID Connect provider, which manages their accounts. Password sign-in, `/setup` and account creation under **Admin** are disabled. The first user to sign in becomes the administrator. Deleting an account under **Admin** ends its sessions immediately.

On a user's first sign-in, voidkoi links the provider account to the voidkoi account with the same email address, provided that the provider marks the address as verified. If no such account exists, voidkoi asks for confirmation before creating one and offers to sign in with a different provider account instead. Later sign-ins match on the provider's ID. voidkoi applies any change to the username or email address made in the provider.

A provider account cannot sign in if it has no email address or if its address is already linked to a different provider account.

Signing out of voidkoi also ends the provider's session through its `end_session_endpoint` and returns to the sign-in page. The next sign-in asks for credentials again, which allows switching to another account.

To configure OpenID Connect sign-in:

1. Register voidkoi with the provider as a confidential client, with the redirect URI `https://voidkoi.example.com/api/auth/callback/oidc` and the post-logout redirect URI `https://voidkoi.example.com/login?signedOut=1`.
2. Set the provider to sign ID tokens with RS256. HS256 is not supported.
3. Make sure the provider ends its own session when an application signs out.
4. Set `VOIDKOI_AUTH=oidc` and the `VOIDKOI_OIDC_*` variables.

> [!WARNING]
> voidkoi trusts the email address that the provider sends and uses it to link existing accounts. Only a provider whose accounts are under the administrator's control should be used.

## Reverse proxy

Calls, notifications and installing the suite as an app all require HTTPS, because browsers only allow the microphone, the camera and push notifications on HTTPS or `localhost`.

The proxy must pass WebSockets through, since Talk keeps one open at `/api/talk/socket`. It must also accept large request bodies: up to 2 GB in a single request for Utilikit's video converter and up to 1 GB for Talk. An example configuration for nginx:

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    # listen, server_name and certificates

    location / {
        proxy_pass http://VOIDKOI_HOST:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        client_max_body_size 2100m;
        proxy_request_buffering off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

## Calls

Talk's STUN server must be reachable from the internet on UDP port 3478, so that port has to be forwarded to the machine running voidkoi. Browsers look for the STUN server at the suite's host name, so that name must point directly at the machine, without a CDN in between.

Talk has no TURN relay, so a call fails when both parties are behind strict NAT, as happens on some mobile networks. A TURN server such as [coturn](https://github.com/coturn/coturn) solves this when it is listed in `VOIDKOI_ICE_SERVERS` alongside Talk's STUN server:

```bash
VOIDKOI_ICE_SERVERS='[{"urls":"stun:voidkoi.example.com:3478"},{"urls":"turn:turn.example.com:3478","username":"USER","credential":"PASSWORD"}]'
```

## Backups

A complete backup covers the database (accounts and all content created in the apps) together with the data directory (files, pictures and attachments).

```bash
pg_dump "postgresql://voidkoi_user:YOUR_PASSWORD@YOUR_POSTGRES_HOST:5432/voidkoi_db" > voidkoi.sql
```

The data directory can be copied while voidkoi is running. The following command mirrors it into a backup directory and is suitable for a nightly job:

```bash
docker run --rm -v voidkoi_data:/data:ro -v /mnt/backups/voidkoi:/backup alpine \
  sh -c 'apk add -q rsync && rsync -a --delete --numeric-ids --exclude /files/incoming/ --exclude /utilikit/ /data/ /backup/data/'
```

The command skips `files/incoming` (unfinished uploads) and `utilikit` (the converters' temporary files). A mirror also removes anything deleted from the data directory, so restoring anything older than one night requires snapshots of the backup directory.

## Mac app

`macos/` contains a Mac app that opens one voidkoi server in its own window. It sends macOS notifications, shows a badge on the Dock icon, saves downloads to the Downloads folder and uploads files dropped on the Dock icon to Files.

Building it requires macOS 14 or newer, Xcode and `rsvg-convert`:

```bash
cd macos
VOIDKOI_SERVER=https://voidkoi.example.com ./build.sh --dmg
```

Without `VOIDKOI_SERVER`, the app asks for the server's address. [macos/README.md](macos/README.md) covers the remaining details.

## Development

```bash
npm test
npm run lint
npx tsc --noEmit -p .
```

To change the schema, edit `prisma/schema/`, run `npx prisma migrate dev --name describe_the_change` and commit the new folder in `prisma/migrations`. Prisma creates a temporary shadow database for this step, so the database user needs permission to create databases.

Talk's tests run the same migrations on PGlite and therefore do not require a database server.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
