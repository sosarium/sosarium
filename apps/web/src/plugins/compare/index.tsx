import { createRoot } from 'react-dom/client';

import type { Plugin } from '@/plugins/types';

import { ComparePanel } from './compare-panel';

export const manifest: Plugin['manifest'] = {
  id: 'compare',
  name: 'Compare',
  description: 'Compares the open folder against another folder: tiledata, hues, art and gumps.',
  version: '1.0.0',
  author: 'Sosarium',
  defaultEnabled: true
};

export function render(root: HTMLElement) {
  const reactRoot = createRoot(root);
  reactRoot.render(<ComparePanel />);
  return () => reactRoot.unmount();
}
