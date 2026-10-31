export const CONTRACT_LIMITS = Object.freeze({
  TITLE_MAX_CHARACTERS: 255,
  USER_MESSAGE_MAX_BYTES: 32 * 1024,
  STORED_MESSAGE_MAX_BYTES: 256 * 1024,
  MEMORY_MAX_BYTES: 4 * 1024,
  STREAM_DELTA_MAX_BYTES: 8 * 1024,
  NORMAL_JSON_MAX_BYTES: 1024 * 1024,
  CONVERSATIONS_PAGE_MAX: 30,
  MESSAGES_PAGE_MAX: 50,
  MEMORIES_PAGE_MAX: 100,
  SYNC_PULL_MAX_CHANGES: 500,
  SYNC_PUSH_MAX_OPERATIONS: 100,
  VALIDATION_MAX_ISSUES: 20
} as const);

const utf8Encoder = new TextEncoder();

export function utf8ByteLength(value: string): number {
  return utf8Encoder.encode(value).byteLength;
}

export function hasMaxUtf8Bytes(value: string, maximum: number): boolean {
  return utf8ByteLength(value) <= maximum;
}
