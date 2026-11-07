import { useEffect } from 'react';

function ensureMeta(title: string, description: string | null): void {
  document.title = title;
  if (!description) {
    return;
  }
  let element = document.head.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute('name', 'description');
    document.head.appendChild(element);
  }
  element.content = description;
}

export function useDocumentMeta(title: string | null, description?: string | null): void {
  useEffect(() => {
    if (title) {
      ensureMeta(title, description ?? null);
    }
  }, [title, description]);
}
