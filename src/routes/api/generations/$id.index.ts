import { createFileRoute } from "@tanstack/react-router";
import { asViewer } from "@/server/api";
import { getGeneration } from "@/server/generations";

export const Route = createFileRoute("/api/generations/$id/")({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        asViewer(request, async (viewer) => Response.json(await getGeneration(viewer.id, params.id))),
    },
  },
});
