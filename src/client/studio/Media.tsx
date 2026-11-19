import { cn } from "cn";

export const mediaUrl = (id: string) => `/media/${encodeURIComponent(id)}`;
export const downloadUrl = (id: string) => `${mediaUrl(id)}?download=1`;

/** An asset's picture or clip. */
export function Media({
  asset,
  className,
  controls = false,
  testId,
}: {
  asset: { id: string; type: string; prompt?: string | null };
  className?: string;
  controls?: boolean;
  testId?: string;
}) {
  if (asset.type === "video") {
    return (
      <video
        src={mediaUrl(asset.id)}
        className={cn("bg-muted", className)}
        controls={controls}
        muted={!controls}
        playsInline
        preload="metadata"
        data-testid={testId}
      />
    );
  }
  return (
    <img
      src={mediaUrl(asset.id)}
      alt={asset.prompt ?? "Uploaded image"}
      className={cn("bg-muted", className)}
      loading="lazy"
      data-testid={testId}
    />
  );
}
