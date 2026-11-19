import { createFileRoute } from "@tanstack/react-router";
import { asViewer } from "@/server/api";
import { createUpload } from "@/server/assets";
import { AppError } from "@/server/errors";

// A reference or start image, uploaded into the member's library.
export const Route = createFileRoute("/api/uploads")({
  server: {
    handlers: {
      POST: ({ request }) =>
        asViewer(request, async (viewer) => {
          const form = await request.formData().catch(() => null);
          const file = form?.get("file");
          if (!(file instanceof File)) throw new AppError(400, "Choose an image to upload.");
          return Response.json({ asset: await createUpload(viewer.id, file) }, { status: 201 });
        }),
    },
  },
});
