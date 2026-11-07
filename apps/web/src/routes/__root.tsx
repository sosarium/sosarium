import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router';
import { lazy, type ReactNode, Suspense, useEffect } from 'react';

const Devtools = import.meta.env.DEV ? lazy(() => import('@/components/devtools')) : null;

import { description, keywords, siteUrl, title } from '@/constants';
import { watchTheme } from '@/lib/theme';
import stylesheet from '@/styles/globals.css?url';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'color-scheme', content: 'dark light' },
      { title },
      { name: 'description', content: description },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: title },
      { property: 'og:url', content: `${siteUrl}/` },
      { property: 'og:image', content: `${siteUrl}/og.png` },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
      { name: 'twitter:image', content: `${siteUrl}/og.png` },
      { name: 'keywords', content: keywords.join(',') },
      { name: 'theme-color', content: '#16130e' }
    ],
    links: [{ rel: 'stylesheet', href: stylesheet }]
  }),
  notFoundComponent: NotFound,
  component: RootComponent
});

function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink text-parchment">
      <p>Page not found.</p>
    </div>
  );
}

function RootComponent() {
  useEffect(() => watchTheme(), []);
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html className="m-0 p-0" data-theme="system" lang="en" suppressHydrationWarning={true}>
      <head>
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: static pre-paint theme attribute, no user input
          dangerouslySetInnerHTML={{
            __html:
              "try{var p=JSON.parse(localStorage.getItem('sosarium.preferences.v1')||'{}');var t=p.theme;document.documentElement.dataset.theme=t==='light'||t==='dark'?t:'system';}catch(e){document.documentElement.dataset.theme='system';}"
          }}
        />
        <link href={stylesheet} rel="stylesheet" />
        <HeadContent />
      </head>
      <body className="m-0 bg-ink text-parchment antialiased">
        {children}
        {Devtools ? (
          <Suspense fallback={null}>
            <Devtools />
          </Suspense>
        ) : null}
        <Scripts />
      </body>
    </html>
  );
}
