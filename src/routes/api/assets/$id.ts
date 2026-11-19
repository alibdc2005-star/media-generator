import { createFileRoute } from "@tanstack/react-router";
import { asViewer } from "@/server/api";
import { deleteAsset, getAsset } from "@/server/assets";

export const Route = createFileRoute("/api/assets/$id")({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        asViewer(request, async (viewer) => Response.json({ asset: await getAsset(viewer, params.id) })),
      DELETE: ({ request, params }) =>
        asViewer(request, async (viewer) => {
          await deleteAsset(viewer, params.id);
          return Response.json({ deleted: true });
        }),
    },
  },
});
