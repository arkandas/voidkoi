import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';

import './globals.css';

import { Providers } from '@/components/providers';
import { TITLE_TEMPLATE } from '@/lib/page-title';
import { THEME_INIT_SCRIPT } from '@/lib/theme';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app');

  return {
    title: { default: 'voidkoi', template: TITLE_TEMPLATE },
    description: t('description'),
    manifest: '/manifest.webmanifest',
    applicationName: 'voidkoi',
    appleWebApp: {
      capable: true,
      title: 'voidkoi',
      statusBarStyle: 'default',
    },
    icons: {
      icon: [
        { url: '/icon.svg', type: 'image/svg+xml' },
        { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
      apple: '/apple-touch-icon.png',
    },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  // The surface colour, so an installed app's status bar runs into it.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f9fbfc' },
    { media: '(prefers-color-scheme: dark)', color: '#14191c' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="antialiased" suppressHydrationWarning>
        <NextIntlClientProvider>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
