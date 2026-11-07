import type { ClientFlavor } from '@sosarium/core';

export interface PluginFileEntry {
  name: string;
  size: number;
}

export interface PluginApi {
  session: {
    name: string | null;
    mode: 'readwrite' | 'readonly';
    files: PluginFileEntry[];
  };
  files: {
    list(): PluginFileEntry[];
    find(name: string): string | null;
    read(name: string): Promise<Uint8Array | null>;
    write(name: string, bytes: Uint8Array): Promise<string>;
    canWrite(): boolean;
  };
  formats: typeof import('@sosarium/formats');
  core: typeof import('@sosarium/core');
  images: {
    tileToCanvas: typeof import('@/lib/art-image').tileToCanvas;
  };
}

export interface PluginManifest {
  id: string;
  name: string;
  description?: string;
  version?: string;
  author?: string;
  defaultEnabled?: boolean;
  available?: (flavor: ClientFlavor) => boolean;
}

export type PluginCleanup = () => void;

export interface Plugin {
  manifest: PluginManifest;
  render(root: HTMLElement, api: PluginApi): PluginCleanup | Promise<PluginCleanup> | undefined;
}
