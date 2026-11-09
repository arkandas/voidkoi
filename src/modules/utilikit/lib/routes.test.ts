import { readdirSync, readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const API_DIR = path.join(process.cwd(), 'src/app/api/utilikit');
const GUARDS = /\b(authorize|jobStatus|jobDownload)\(/;

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(full);
    return entry.name === 'route.ts' ? [path.relative(API_DIR, full)] : [];
  });
}

describe('Utilikit API routes', () => {
  const routes = routeFiles(API_DIR);

  it('finds the route handlers', () => {
    expect(routes.length).toBeGreaterThan(10);
  });

  it('check the account in every route, since the proxy does not cover /api', () => {
    const unguarded = routes.filter(route => !GUARDS.test(readFileSync(path.join(API_DIR, route), 'utf8')));
    expect(unguarded).toEqual([]);
  });

  it('start jobs through startJob, which keeps each account to a few at once', () => {
    const direct = routes.filter(route => /\bcreateJob\(/.test(readFileSync(path.join(API_DIR, route), 'utf8')));
    expect(direct).toEqual([]);
  });

  it('check the tool’s category wherever a job starts or the server reaches out', () => {
    const starting = routes.filter(route => /export async function POST/.test(readFileSync(path.join(API_DIR, route), 'utf8')));
    const unchecked = starting.filter(route => !/authorize\(request, '(media|developer|design|text|network|web)'/.test(readFileSync(path.join(API_DIR, route), 'utf8')));
    expect(starting.length).toBeGreaterThan(5);
    expect(unchecked).toEqual([]);
  });
});
