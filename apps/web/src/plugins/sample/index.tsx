import type { Plugin, PluginApi } from '@/plugins/types';

export const manifest: Plugin['manifest'] = {
  id: 'sample',
  name: 'API sample',
  description:
    'Reference plugin: lists the session files and reads the bytes of the one you pick, using only the plugin API.',
  version: '1.0.0',
  author: 'Sosarium'
};

export function render(root: HTMLElement, api: PluginApi) {
  root.className = 'sf-opt scroll-area min-h-0 flex-1 overflow-y-auto p-4 text-sm text-parchment/70';
  const title = document.createElement('h2');
  title.className = 'text-xs tracking-widest text-parchment/40 uppercase';
  title.textContent = 'Session files';
  const summary = document.createElement('p');
  summary.className = 'mt-2 text-parchment/50';
  const files = api.files.list();
  summary.textContent = `${files.length} files · ${api.session.mode === 'readwrite' ? 'read/write' : 'read-only'}${api.session.name ? ` · ${api.session.name}` : ''}`;
  const select = document.createElement('select');
  select.className =
    'field-select mt-3 rounded border border-bronze/30 bg-ink py-1.5 pl-2 pr-7 text-xs text-parchment/80';
  for (const file of files) {
    const option = document.createElement('option');
    option.value = file.name;
    option.textContent = `${file.name} (${file.size.toLocaleString()} bytes)`;
    select.append(option);
  }
  const button = document.createElement('button');
  button.type = 'button';
  button.className =
    'ml-2 rounded border border-bronze/30 px-3 py-1.5 text-xs tracking-widest text-parchment/70 uppercase hover:border-bronze/60';
  button.textContent = 'Read file';
  const output = document.createElement('pre');
  output.className = 'mt-3 whitespace-pre-wrap font-mono text-xs text-parchment/50';
  output.textContent = 'Pick a file and read it. Parsers and serializers are exposed as api.formats / api.core.';
  const onClick = async () => {
    button.disabled = true;
    try {
      const bytes = await api.files.read(select.value);
      output.textContent = bytes
        ? `${select.value} · ${bytes.byteLength.toLocaleString()} bytes\nfirst bytes: ${Array.from(bytes.slice(0, 8), (byte) => byte.toString(16).padStart(2, '0')).join(' ')}`
        : `${select.value} · not readable in this session`;
    } finally {
      button.disabled = false;
    }
  };
  button.addEventListener('click', onClick);
  root.replaceChildren(title, summary, select, button, output);
  return () => {
    button.removeEventListener('click', onClick);
    root.replaceChildren();
  };
}
