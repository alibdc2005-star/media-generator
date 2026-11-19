import { createFileRoute } from "@tanstack/react-router";
import { asViewer } from "@/server/api";
import { ASSET_FILTERS, listAssets, type AssetFilter } from "@/server/assets";

export const Route = createFileRoute("/api/assets/")({
  server: {
    handlers: {
      GET: ({ request }) =>
        asViewer(request, async (viewer) => {
          const params = new URL(request.url).searchParams;
          const type = (ASSET_FILTERS as readonly string[]).includes(params.get("type") ?? "")
            ? (params.get("type") as AssetFilter)
            : "all";
          const page = await listAssets(viewer.id, {
            type,
            page: Number(params.get("page")) || 1,
            limit: Number(params.get("limit")) || undefined,
          });
          return Response.json({ assets: page.items, total: page.total, page: page.page, pageCount: page.pageCount });
        }),
    },
  },
});
