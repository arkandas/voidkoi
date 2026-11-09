#!/usr/bin/env node
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const prismaBin = join(root, 'node_modules', '.bin', 'prisma');
const connectAttempts = 15;

class Failure extends Error {}

function prisma(...args) {
  const result = spawnSync(prismaBin, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, CHECKPOINT_DISABLE: '1' },
  });
  if (result.status !== 0) throw new Failure(`"prisma ${args.join(' ')}" failed.`);
}

function reason(error) {
  return error.errors?.map(inner => inner.message).join('; ') || error.message;
}

async function waitForDatabase() {
  for (let attempt = 1; ; attempt++) {
    const client = new pg.Client({ connectionString: process.env.VOIDKOI_DATABASE_URL });
    try {
      await client.connect();
      await client.end();
      return;
    } catch (error) {
      await client.end().catch(() => {});
      if (attempt === connectAttempts) throw new Failure(`Could not connect to the database: ${reason(error)}`);
      console.log(`Database not reachable yet (${reason(error)}), retrying...`);
      await sleep(2000);
    }
  }
}

async function main() {
  if (!process.env.VOIDKOI_DATABASE_URL) throw new Failure('VOIDKOI_DATABASE_URL is not set.');
  await waitForDatabase();
  prisma('migrate', 'deploy');
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Failure ? error.message : error);
  process.exit(1);
}
