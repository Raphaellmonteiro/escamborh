export function normalizeBarcode(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value)
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase();

  return normalized || null;
}
