import { createRoot } from 'react-dom/client';

import type { Plugin } from '@/plugins/types';

import { ImportPanel } from './import-panel';

export const manifest: Plugin['manifest'] = {
  id: 'mass-import',
  name: 'MassImport',
  description: 'Imports a directory of PNGs into art or gumps in bulk.',
  version: '1.0.0',
  author: 'Sosarium',
  defaultEnabled: true
};

export function render(root: HTMLElement) {
  const reactRoot = createRoot(root);
  reactRoot.render(<ImportPanel />);
  return () => reactRoot.unmount();
}
