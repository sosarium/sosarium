import { createRouter } from '@tanstack/react-router';

import { routeTree } from './routeTree.gen';

const router = createRouter({
  routeTree,
  defaultPreload: 'intent'
});

export const getRouter = () => router;

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
