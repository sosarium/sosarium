import { createRoot } from 'react-dom/client';

import type { Plugin } from '@/plugins/types';

import { PackPanel } from './pack-panel';

export const manifest: Plugin['manifest'] = {
  id: 'uop-packer',
  name: 'UOP Packer',
  description: 'Packs the legacy .mul file sets in the open folder into UOP containers and verifies the result.',
  version: '1.0.0',
  author: 'Sosarium',
  defaultEnabled: true
};

export function render(root: HTMLElement) {
  const reactRoot = createRoot(root);
  reactRoot.render(<PackPanel />);
  return () => reactRoot.unmount();
}
