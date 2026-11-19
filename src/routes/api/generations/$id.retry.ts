import { createFileRoute } from "@tanstack/react-router";
import { asViewer } from "@/server/api";
import { retryGeneration } from "@/server/generations";

export const Route = createFileRoute("/api/generations/$id/retry")({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        asViewer(request, async (viewer) => Response.json({ generation: await retryGeneration(viewer.id, params.id) })),
    },
  },
});
