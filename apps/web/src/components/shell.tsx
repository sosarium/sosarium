import { useNavigate } from '@tanstack/react-router';
import { type ReactNode, useEffect, useState } from 'react';

import { Sidebar } from '@/components/atelier/sidebar';
import { reconnect } from '@/lib/open-folder';
import { useSession } from '@/lib/session';

function useScrollFades() {
  useEffect(() => {
    const update = (element: Element) => {
      const scrollable = element.scrollHeight - element.clientHeight > 1;
      const above = scrollable && element.scrollTop > 1;
      const below = scrollable && element.scrollTop + element.clientHeight < element.scrollHeight - 1;
      element.classList.toggle('scroll-fade', below && !above);
      element.classList.toggle('scroll-fade-top', above && !below);
      element.classList.toggle('scroll-fade-both', above && below);
    };
    const updateAll = () => {
      for (const element of document.querySelectorAll('.sf-opt')) {
        update(element);
      }
    };
    let frame = 0;
    const schedule = () => {
      if (frame) {
        return;
      }
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        updateAll();
      });
    };
    document.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    schedule();
    return () => {
      document.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      observer.disconnect();
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, []);
}

export function Shell({ children }: Readonly<{ children?: ReactNode }>) {
  useScrollFades();
  const session = useSession();

  if (session.status === 'needs-permission') {
    return <ReconnectPanel />;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
    </div>
  );
}

function ReconnectPanel() {
  const session = useSession();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const handleReconnect = async () => {
    setBusy(true);
    const restored = await reconnect();
    setBusy(false);
    if (!restored) {
      await navigate({ to: '/' });
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-sm text-parchment/70">
        Sosarium needs permission to read <span className="text-bronze-bright">{session.name ?? 'your folder'}</span>{' '}
        again.
      </p>
      <button
        className="rounded border border-bronze/60 bg-bronze/10 px-6 py-3 text-xs tracking-widest text-bronze-bright uppercase hover:bg-bronze/20"
        disabled={busy}
        onClick={handleReconnect}
        type="button"
      >
        {busy ? 'Requesting…' : 'Reconnect'}
      </button>
      <button
        className="text-xs text-parchment/40 underline hover:text-parchment/70"
        onClick={() => navigate({ to: '/' })}
        type="button"
      >
        Choose a different folder
      </button>
    </div>
  );
}
