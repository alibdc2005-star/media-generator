import { createFileRoute } from "@tanstack/react-router";
import { asViewer, readJson } from "@/server/api";
import { createGeneration, listGenerations } from "@/server/generations";

export const Route = createFileRoute("/api/generations/")({
  server: {
    handlers: {
      GET: ({ request }) =>
        asViewer(request, async (viewer) => Response.json({ generations: await listGenerations(viewer.id) })),
      POST: ({ request }) =>
        asViewer(request, async (viewer) =>
          Response.json({ generation: await createGeneration(viewer.id, await readJson(request)) }, { status: 201 }),
        ),
    },
  },
});
