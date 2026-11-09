import { NextResponse } from 'next/server';

/**
 * Files shared from another app normally never reach the server: the service
 * worker takes them. Without it there is nothing to do with them here.
 */
export function POST(request: Request) {
  return NextResponse.redirect(new URL('/files?shared=failed', request.url), 303);
}
