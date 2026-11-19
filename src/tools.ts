// The app's tools for AI clients, served by the Gateway at /mcp with the
// signed-in user.
import { ToolError, defineTools } from "@every-app/sdk/server";
import { z } from "zod";
import { listAssets, ASSET_FILTERS } from "@/server/assets";
import { AppError } from "@/server/errors";
import { createGeneration, getGeneration, listGenerations } from "@/server/generations";
import { generationInput } from "@/server/models";

async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof AppError) throw new ToolError(error.message);
    throw error;
  }
}

export const tools = defineTools({
  list_generations: {
    description: "List the user's image and video generations, newest first, with their status.",
    risk: "read",
    input: z.object({}).strict(),
    handler: (_input, { user }) => guarded(() => listGenerations(user.id)),
  },
  get_generation: {
    description: "Get one generation and the assets it produced.",
    risk: "read",
    input: z.object({ id: z.string() }).strict(),
    handler: ({ id }, { user }) => guarded(() => getGeneration(user.id, id)),
  },
  list_assets: {
    description: "List the user's library: generated images and videos and uploaded images, newest first.",
    risk: "read",
    input: z.object({ type: z.enum(ASSET_FILTERS).optional(), page: z.number().int().min(1).optional() }).strict(),
    handler: (input, { user }) => guarded(() => listAssets(user.id, input)),
  },
  create_generation: {
    description:
      "Start an image (kind image, count 1-4) or video (kind video, duration in seconds) generation from a prompt. It runs in the background; poll get_generation.",
    risk: "write",
    idempotent: false,
    input: generationInput,
    handler: (input, { user }) => guarded(() => createGeneration(user.id, input)),
  },
});
