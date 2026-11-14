import { afterEach, describe, expect, it, vi } from 'vitest';

import { applyDocumentMeta } from './document-meta';

function stubDocument(title: string, description: string) {
  const meta = { content: description, setAttribute: vi.fn() };
  const doc = {
    title,
    head: { querySelector: () => meta, appendChild: vi.fn() },
    createElement: () => meta
  };
  vi.stubGlobal('document', doc);
  return { doc, meta };
}

describe('applyDocumentMeta', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('restores the previous title and description when cleaned up', () => {
    const { doc, meta } = stubDocument('Sosarium', 'View and edit Ultima Online files.');

    const restore = applyDocumentMeta('Gump 0x0001 — Sosarium', 'Ultima Online gump 0x0001 — Sosarium.');
    expect(doc.title).toBe('Gump 0x0001 — Sosarium');
    expect(meta.content).toBe('Ultima Online gump 0x0001 — Sosarium.');

    restore();
    expect(doc.title).toBe('Sosarium');
    expect(meta.content).toBe('View and edit Ultima Online files.');
  });
});
