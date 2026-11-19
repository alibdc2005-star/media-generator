/** The media types the app stores and serves, told apart by their first bytes. */
export function sniff(bytes: Uint8Array): string | null {
  const at = (i: number, ...values: number[]) => values.every((v, j) => bytes[i + j] === v);
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return "image/gif";
  if (at(4, 0x66, 0x74, 0x79, 0x70)) {
    return at(8, 0x71, 0x74) ? "video/quicktime" : "video/mp4";
  }
  if (at(0, 0x1a, 0x45, 0xdf, 0xa3)) return "video/webm";
  return null;
}

export const UPLOAD_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const UPLOAD_LIMIT = 10 * 1024 * 1024;

export function extensionOf(contentType: string): string {
  return contentType.split("/")[1]?.replace("jpeg", "jpg").replace("quicktime", "mov") ?? "bin";
}

export function r2Key(userId: string, assetId: string): string {
  return `users/${encodeURIComponent(userId)}/${assetId}`;
}
