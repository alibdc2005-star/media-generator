import { z } from "zod";
import { AppError } from "./errors";

export interface ImageModel {
  id: string;
  label: string;
  /** The model's input that takes a reference image, if it takes one. */
  referenceParam: string | null;
}

export interface VideoModel {
  id: string;
  label: string;
  /** The model's input that takes a start frame. */
  imageParam: string;
  durations: number[];
}

export const IMAGE_MODELS: ImageModel[] = [
  { id: "black-forest-labs/flux-schnell", label: "Flux Schnell", referenceParam: null },
  { id: "black-forest-labs/flux-1.1-pro", label: "Flux 1.1 Pro", referenceParam: "image_prompt" },
  { id: "black-forest-labs/flux-kontext-pro", label: "Flux Kontext Pro", referenceParam: "input_image" },
  { id: "google/imagen-4", label: "Imagen 4", referenceParam: null },
];

export const VIDEO_MODELS: VideoModel[] = [
  { id: "bytedance/seedance-1-lite", label: "Seedance 1 Lite", imageParam: "image", durations: [5, 10] },
  { id: "kwaivgi/kling-v1.6-standard", label: "Kling 1.6 Standard", imageParam: "start_image", durations: [5, 10] },
  { id: "luma/ray-flash-2-540p", label: "Ray Flash 2", imageParam: "start_image_url", durations: [5] },
];

export const IMAGE_RATIOS = ["1:1", "3:4", "4:3", "9:16", "16:9"] as const;
export const VIDEO_RATIOS = ["16:9", "9:16", "1:1"] as const;
export const IMAGE_COUNTS = [1, 2, 3, 4] as const;
export const PROMPT_LIMIT = 2000;
export const PENDING_LIMIT = 4;

export function modelLabel(id: string | null): string | null {
  if (!id) return null;
  return [...IMAGE_MODELS, ...VIDEO_MODELS].find((m) => m.id === id)?.label ?? id;
}

export const generationInput = z.object({
  kind: z.enum(["image", "video"]),
  model: z.string().max(200),
  prompt: z.string().max(100_000),
  aspectRatio: z.string().max(20),
  count: z.number().int().optional(),
  duration: z.number().int().optional(),
  inputAssetId: z.string().max(100).nullish(),
});

export interface GenerationSettings {
  aspectRatio: string;
  count?: number;
  duration?: number;
}

export interface ValidGeneration {
  kind: "image" | "video";
  model: string;
  prompt: string;
  settings: GenerationSettings;
  inputAssetId: string | null;
}

/** The checks every submission passes on the server, whatever sent it. */
export function validateGeneration(raw: unknown): ValidGeneration {
  const parsed = generationInput.safeParse(raw);
  if (!parsed.success) throw new AppError(400, "The request is missing a field.");
  const input = parsed.data;
  const prompt = input.prompt.trim();
  if (!prompt) throw new AppError(400, "Write a prompt.");
  if (prompt.length > PROMPT_LIMIT) {
    throw new AppError(400, `Keep the prompt to ${PROMPT_LIMIT} characters or fewer.`);
  }
  const inputAssetId = input.inputAssetId || null;
  if (input.kind === "image") {
    const model = IMAGE_MODELS.find((m) => m.id === input.model);
    if (!model) throw new AppError(400, "Choose a model from the list.");
    if (!(IMAGE_RATIOS as readonly string[]).includes(input.aspectRatio)) {
      throw new AppError(400, "Choose one of the listed aspect ratios.");
    }
    const count = input.count ?? 1;
    if (count < 1 || count > 4) throw new AppError(400, "Make between 1 and 4 images.");
    if (inputAssetId && !model.referenceParam) {
      throw new AppError(400, `${model.label} doesn't take a reference image.`);
    }
    return { kind: "image", model: model.id, prompt, settings: { aspectRatio: input.aspectRatio, count }, inputAssetId };
  }
  const model = VIDEO_MODELS.find((m) => m.id === input.model);
  if (!model) throw new AppError(400, "Choose a model from the list.");
  if (!(VIDEO_RATIOS as readonly string[]).includes(input.aspectRatio)) {
    throw new AppError(400, "Choose one of the listed aspect ratios.");
  }
  const duration = input.duration ?? model.durations[0]!;
  if (!model.durations.includes(duration)) {
    throw new AppError(400, `${model.label} makes clips of ${model.durations.join(" or ")} seconds.`);
  }
  return { kind: "video", model: model.id, prompt, settings: { aspectRatio: input.aspectRatio, duration }, inputAssetId };
}

/** The model's own input for one prediction. */
export function modelInput(gen: ValidGeneration, imageUrl: string | null): Record<string, unknown> {
  if (gen.kind === "image") {
    const model = IMAGE_MODELS.find((m) => m.id === gen.model)!;
    const input: Record<string, unknown> = { prompt: gen.prompt, aspect_ratio: gen.settings.aspectRatio };
    if (imageUrl && model.referenceParam) input[model.referenceParam] = imageUrl;
    return input;
  }
  const model = VIDEO_MODELS.find((m) => m.id === gen.model)!;
  const input: Record<string, unknown> = {
    prompt: gen.prompt,
    aspect_ratio: gen.settings.aspectRatio,
    duration: gen.settings.duration,
  };
  if (imageUrl) input[model.imageParam] = imageUrl;
  return input;
}
