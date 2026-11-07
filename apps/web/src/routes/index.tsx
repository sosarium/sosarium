import { createFileRoute } from '@tanstack/react-router';

import { Overview } from '@/components/overview';
import { Shell } from '@/components/shell';
import { Splash } from '@/components/splash';
import { restoreSession } from '@/lib/open-folder';
import { useSession } from '@/lib/session';

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    await restoreSession();
  },
  component: Home
});

function Home() {
  const session = useSession();

  if (session.status === 'ready') {
    return (
      <Shell>
        <Overview />
      </Shell>
    );
  }
  if (session.status === 'needs-permission') {
    return <Shell />;
  }
  return <Splash />;
}
