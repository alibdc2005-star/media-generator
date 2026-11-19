import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { asViewer } from "@/server/api";
import { visibleAsset } from "@/server/assets";
import { extensionOf } from "@/server/media";

// The file behind an asset: to its owner, or to an admin.
export const Route = createFileRoute("/media/$id")({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        asViewer(request, async (viewer) => {
          const asset = await visibleAsset(viewer, params.id);
          const missing = () => new Response("Not found", { status: 404 });
          if (!asset) return missing();
          const range = parseRange(request.headers.get("range"), asset.size);
          const object = await env.media.get(asset.r2Key, range ? { range } : {});
          if (!object) return missing();
          const headers = new Headers({
            "content-type": asset.contentType,
            "cache-control": "private, max-age=3600",
            "x-content-type-options": "nosniff",
            "content-security-policy": "default-src 'none'; sandbox",
            "accept-ranges": "bytes",
          });
          if (new URL(request.url).searchParams.has("download")) {
            headers.set("content-disposition", `attachment; filename="${asset.id}.${extensionOf(asset.contentType)}"`);
          }
          if (range) {
            const end = range.offset + range.length - 1;
            headers.set("content-range", `bytes ${range.offset}-${end}/${asset.size}`);
            headers.set("content-length", String(range.length));
            return new Response(object.body, { status: 206, headers });
          }
          headers.set("content-length", String(asset.size));
          return new Response(object.body, { headers });
        }),
    },
  },
});

function parseRange(header: string | null, size: number): { offset: number; length: number } | null {
  const match = header ? /^bytes=(\d*)-(\d*)$/.exec(header.trim()) : null;
  if (!match || size === 0) return null;
  if (!match[1]) {
    const length = Math.min(Number(match[2]), size);
    return length > 0 ? { offset: size - length, length } : null;
  }
  const offset = Number(match[1]);
  if (offset >= size) return null;
  const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  return end >= offset ? { offset, length: end - offset + 1 } : null;
}
