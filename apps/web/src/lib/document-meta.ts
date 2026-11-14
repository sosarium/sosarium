import { useEffect } from 'react';

export function applyDocumentMeta(title: string, description: string | null): () => void {
  const previousTitle = document.title;
  document.title = title;
  if (!description) {
    return () => {
      document.title = previousTitle;
    };
  }
  let element = document.head.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute('name', 'description');
    document.head.appendChild(element);
  }
  const meta = element;
  const previousDescription = meta.content;
  meta.content = description;
  return () => {
    document.title = previousTitle;
    meta.content = previousDescription;
  };
}

export function useDocumentMeta(title: string | null, description?: string | null): void {
  useEffect(() => {
    if (title) {
      return applyDocumentMeta(title, description ?? null);
    }
  }, [title, description]);
}
