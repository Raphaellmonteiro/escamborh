import { randomUUID } from 'node:crypto';

export function generatePublicId(prefix: string) {
  return `${prefix}_${randomUUID().replace(/-/g, '')}`;
}
