import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

import { Shell } from '@/components/shell';
import { restoreSession } from '@/lib/open-folder';
import { sessionStore } from '@/lib/session';

export const Route = createFileRoute('/_shell')({
  beforeLoad: async () => {
    await restoreSession();
    if (typeof window !== 'undefined' && sessionStore.getState().status === 'empty') {
      throw redirect({ to: '/' });
    }
  },
  component: ShellLayout
});

function ShellLayout() {
  return (
    <Shell>
      <Outlet />
    </Shell>
  );
}
