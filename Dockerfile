FROM node:24-alpine AS base
WORKDIR /app

RUN apk add --no-cache libc6-compat openssl

FROM base AS deps

# npm ci runs prisma generate, which finds the schema folder through prisma.config.mjs.
COPY package.json package-lock.json prisma.config.mjs ./
COPY prisma ./prisma
RUN npm ci

FROM base AS migrate-deps
WORKDIR /migrate

COPY package-lock.json ./
RUN node -e " \
      const lock = require('./package-lock.json').packages; \
      const dependencies = Object.fromEntries(['prisma', 'pg', 'dotenv'].map(name => [name, lock['node_modules/' + name].version])); \
      require('fs').writeFileSync('package.json', JSON.stringify({ private: true, dependencies, allowScripts: { prisma: true, '@prisma/engines': true } })); \
    " \
 && npm install --omit=dev --no-audit --no-fund --no-package-lock

FROM deps AS builder

COPY . .

RUN npm run build

FROM base AS runner

# ffmpeg: video thumbnails, album art, playing what browsers can't, and Utilikit's audio and video converters.
# poppler: PDF thumbnails and Utilikit's PDF tools. The Liberation fonts stand in for the standard PDF
# fonts (Helvetica, Times, Courier), which PDFs often don't carry.
# pandoc and typst: Utilikit's document converter. tini: a proper init for the converters' child processes.
RUN apk add --no-cache tini ffmpeg poppler-utils font-liberation pandoc-cli typst

# yt-dlp, for Utilikit's video downloader: the release build, checked against its published checksums.
ADD https://github.com/yt-dlp/yt-dlp/releases/latest/download/SHA2-256SUMS /tmp/yt-dlp.sha256
RUN case "$(uname -m)" in \
      x86_64) name=yt-dlp_musllinux ;; \
      aarch64) name=yt-dlp_musllinux_aarch64 ;; \
      *) echo "yt-dlp has no build for $(uname -m)" >&2; exit 1 ;; \
    esac \
 && wget -qO /tmp/yt-dlp.zip "https://github.com/yt-dlp/yt-dlp/releases/latest/download/$name.zip" \
 && echo "$(grep " $name.zip\$" /tmp/yt-dlp.sha256 | cut -d' ' -f1)  /tmp/yt-dlp.zip" | sha256sum -c - \
 && mkdir -p /opt/yt-dlp \
 && unzip -q /tmp/yt-dlp.zip -d /opt/yt-dlp \
 && ln -s "/opt/yt-dlp/$name" /usr/local/bin/yt-dlp \
 && rm /tmp/yt-dlp.zip /tmp/yt-dlp.sha256 \
 && yt-dlp --version

ENV NODE_ENV=production
ENV CHECKPOINT_DISABLE=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=migrate-deps /migrate/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/prisma.config.mjs /app/start.sh ./
COPY --from=builder /app/public ./public

# The code belongs to root, so the server can't rewrite itself. It writes only to the data
# volume and to Next's cache.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# The suite's own server: Next.js and the apps' WebSockets on one port, and Talk's STUN server.
COPY --from=builder /app/server.ts /app/server-guards.ts ./

RUN mkdir -p /app/data /app/.next/cache && chown nextjs:nodejs /app/data /app/.next/cache
VOLUME ["/app/data"]

USER nextjs

EXPOSE 3000
# Talk's STUN server, so browsers on calls can find their public address.
EXPOSE 3478/udp

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV VOIDKOI_DATA_DIR=/app/data

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:3000/login || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["./start.sh"]
