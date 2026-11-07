export function formatIndexParam(index: number): string {
  return `0x${index.toString(16).toUpperCase().padStart(4, '0')}`;
}

export function parseIndexParam(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  const parsed = /^0x[0-9a-f]+$/i.test(trimmed) ? Number.parseInt(trimmed.slice(2), 16) : Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
