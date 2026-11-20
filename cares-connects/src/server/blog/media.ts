export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

const startsWith = (data: Uint8Array, bytes: number[], at = 0) => bytes.every((b, i) => data[at + i] === b);

/**
 * The image type according to the file's own bytes, or null if it isn't one we accept. What the
 * browser claims isn't trusted, and SVG is left out because it can carry scripts.
 */
export function detectImageType(data: Uint8Array): string | null {
  if (startsWith(data, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(data, [0x47, 0x49, 0x46, 0x38])) return 'image/gif';
  if (startsWith(data, [0x52, 0x49, 0x46, 0x46]) && startsWith(data, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  return null;
}
