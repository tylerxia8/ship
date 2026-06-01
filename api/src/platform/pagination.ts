export interface CursorPayload {
  id: string;
  timestamp: string;
}

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string | undefined): CursorPayload | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Partial<CursorPayload>;
    if (!parsed.id || !parsed.timestamp) return null;
    return { id: parsed.id, timestamp: parsed.timestamp };
  } catch {
    return null;
  }
}
