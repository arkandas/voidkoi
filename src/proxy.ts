import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';
import { sessionCookieName } from '@/lib/auth-cookies';

/** The wiki. Every page has one address, for members and for visitors. */
const WIKI = /^\/wiki(?:\/|$)/;
/** Its pages for editors only, which have nothing to show signed out. */
const WIKI_TOOLS = /^\/wiki\/(?:edit|history|trash)(?:\/|$)/;
/** Where the wiki is drawn for visitors. Never an address of its own. */
const VISITORS_WIKI = /^\/w(?:\/|$)/;

export default withAuth(
  function middleware(request) {
    const { pathname } = request.nextUrl;
    const url = request.nextUrl.clone();
    // Signed out, a wiki page shows as visitors see it, at its own address.
    if (!request.nextauth.token && WIKI.test(pathname)) {
      url.pathname = `/w${pathname.slice('/wiki'.length)}`;
      return NextResponse.rewrite(url);
    }
    if (VISITORS_WIKI.test(pathname)) {
      url.pathname = `/wiki${pathname.slice('/w'.length)}`;
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  },
  {
    secret: process.env.VOIDKOI_NEXTAUTH_SECRET,
    cookies: {
      sessionToken: { name: sessionCookieName },
    },
    callbacks: {
      authorized: ({ token, req }) => {
        const { pathname } = req.nextUrl;
        return !!token || VISITORS_WIKI.test(pathname) || (WIKI.test(pathname) && !WIKI_TOOLS.test(pathname));
      },
    },
    pages: {
      signIn: '/login',
    },
  }
);

// API routes check the session themselves. Leaving them out also keeps the
// proxy from buffering upload bodies, which it cuts off at 10 MB. The brand's
// marks, the app icons and the tab icons show on pages for visitors too.
export const config = {
  matcher: [
    '/((?!api/|s/|u/|login|setup|share-target|sw.js|_next|brand/|apps/|favicons/|favicon.ico|robots.txt|manifest.webmanifest|icon.svg|icon-192.png|icon-512.png|icon-maskable-512.png|apple-touch-icon.png).*)',
  ],
};
