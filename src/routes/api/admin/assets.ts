import { createFileRoute } from "@tanstack/react-router";
import { asViewer } from "@/server/api";
import { listAllAssets } from "@/server/assets";

export const Route = createFileRoute("/api/admin/assets")({
  server: {
    handlers: {
      GET: ({ request }) =>
        asViewer(request, async (viewer) => {
          const params = new URL(request.url).searchParams;
          const page = await listAllAssets(viewer, { page: Number(params.get("page")) || 1, limit: Number(params.get("limit")) || undefined });
          return Response.json({ assets: page.items, total: page.total, page: page.page, pageCount: page.pageCount });
        }),
    },
  },
});
