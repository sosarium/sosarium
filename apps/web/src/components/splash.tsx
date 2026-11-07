import { isUoClientFolder } from '@sosarium/core';
import { type ChangeEvent, type DragEvent, useEffect, useRef, useState } from 'react';

import { Logo } from '@/components/logo';
import { loadDirectoryHandle } from '@/lib/idb';
import {
  openDirectory,
  openDroppedDirectory,
  openFileList,
  pickUoFolder,
  supportsDirectoryPicker
} from '@/lib/open-folder';
import { type SessionState, sessionStore } from '@/lib/session';

const NOT_A_CLIENT_MESSAGE =
  "This doesn't look like a Ultima Online client folder — no art, gump, map or tiledata files were found.";

export function Splash() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [recentName, setRecentName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadDirectoryHandle()
      .then((handle) => setRecentName(handle?.name ?? null))
      .catch(() => setRecentName(null));
  }, []);

  useEffect(() => {
    inputRef.current?.setAttribute('webkitdirectory', '');
  }, []);

  const enterSession = (state: SessionState | null) => {
    if (!state) {
      return;
    }
    if (!state.flavor || !isUoClientFolder(state.flavor) || state.files.length === 0) {
      setError(NOT_A_CLIENT_MESSAGE);
      return;
    }
    sessionStore.set(state);
  };

  const handleOpen = async () => {
    setError(null);
    if (!supportsDirectoryPicker()) {
      inputRef.current?.click();
      return;
    }
    setBusy(true);
    try {
      const handle = await pickUoFolder();
      if (handle) {
        enterSession(await openDirectory(handle, 'readwrite'));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open the folder.');
    } finally {
      setBusy(false);
    }
  };

  const handleRecent = async () => {
    setError(null);
    setBusy(true);
    try {
      const handle = await loadDirectoryHandle();
      if (!handle) {
        setRecentName(null);
        return;
      }
      const writePermission = await handle.requestPermission({ mode: 'readwrite' });
      if (writePermission === 'granted') {
        enterSession(await openDirectory(handle, 'readwrite'));
        return;
      }
      if ((await handle.requestPermission({ mode: 'read' })) === 'granted') {
        enterSession(await openDirectory(handle, 'readonly'));
        return;
      }
      setError('Permission was denied — pick the folder again to continue.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not reconnect to the folder.');
    } finally {
      setBusy(false);
    }
  };

  const handleFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const list = event.target.files;
    if (!list || list.length === 0) {
      return;
    }
    enterSession(await openFileList(list));
    event.target.value = '';
  };

  const handleDrop = async (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const items = Array.from(event.dataTransfer.items);
      for (const item of items) {
        if (item.kind !== 'file' || !item.getAsFileSystemHandle) {
          continue;
        }
        const handle = await item.getAsFileSystemHandle();
        if (handle?.kind === 'directory') {
          enterSession(await openDroppedDirectory(handle as FileSystemDirectoryHandle));
          return;
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open the dropped folder.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6"
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            'linear-gradient(45deg, transparent 46%, #d8a860 46%, #d8a860 54%, transparent 54%), linear-gradient(-45deg, transparent 46%, #d8a860 46%, #d8a860 54%, transparent 54%)',
          backgroundSize: '64px 64px'
        }}
      />
      <div className="relative flex w-full max-w-xl flex-col items-center gap-8 text-center">
        <Logo className="h-24 w-24" />
        <div>
          <h1 className="font-serif text-5xl tracking-[0.3em] text-bronze-bright uppercase">Sosarium</h1>
          <p className="mt-3 text-sm tracking-widest text-parchment/60">View and edit Ultima Online files.</p>
        </div>

        {error ? (
          <p className="w-full rounded border border-red-900/60 bg-red-950/40 px-4 py-2 text-sm text-red-200/90">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col items-center gap-3">
          <button
            className="group inline-flex items-center gap-3 rounded border border-bronze/60 bg-bronze/10 px-8 py-4 text-sm tracking-widest text-bronze-bright uppercase transition hover:border-bronze hover:bg-bronze/20 disabled:opacity-50"
            disabled={busy}
            onClick={handleOpen}
            type="button"
          >
            <svg
              aria-hidden="true"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              viewBox="0 0 24 24"
            >
              <path
                d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {busy ? 'Opening…' : 'Select'}
          </button>

          {recentName ? (
            <button
              className="text-xs text-parchment/50 underline hover:text-parchment/80 disabled:opacity-50"
              disabled={busy}
              onClick={handleRecent}
              type="button"
            >
              Continue with “{recentName}”
            </button>
          ) : null}

          <button
            className="text-xs text-parchment/35 underline hover:text-parchment/60 disabled:opacity-50"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            type="button"
          >
            Use the file dialog instead (read-only)
          </button>
        </div>

        <p className="text-xs text-parchment/40">
          Requires a Chromium-based browser for editing.
          <br />
          Other browsers can browse and export. You can also drop a folder onto this page.
        </p>
      </div>

      <input className="hidden" multiple={true} onChange={handleFiles} ref={inputRef} type="file" />
    </main>
  );
}
