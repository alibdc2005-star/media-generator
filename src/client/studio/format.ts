export function settingsLine(settings: { aspectRatio: string; count?: number; duration?: number } | null): string {
  if (!settings) return "";
  const parts = [settings.aspectRatio];
  if (settings.count) parts.push(settings.count === 1 ? "1 image" : `${settings.count} images`);
  if (settings.duration) parts.push(`${settings.duration} s`);
  return parts.join(" · ");
}

export function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function errorText(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "That didn't work.";
}
