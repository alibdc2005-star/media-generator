import { createFileRoute } from "@tanstack/react-router";
import { asViewer } from "@/server/api";
import { regenerate } from "@/server/generations";

export const Route = createFileRoute("/api/generations/$id/regenerate")({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        asViewer(request, async (viewer) =>
          Response.json({ generation: await regenerate(viewer.id, params.id) }, { status: 201 }),
        ),
    },
  },
});
