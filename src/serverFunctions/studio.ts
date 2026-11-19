import { createServerFn } from "@tanstack/react-start";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { z } from "zod";
import * as assets from "@/server/assets";
import * as generations from "@/server/generations";
import { serviceStatus } from "@/server/replicate";
import { viewerFrom } from "@/server/users";

// Every server function runs behind ensureUserMiddleware: `context.user` is
// the member the Gateway signed in, and every query is scoped by them.
const idInput = (data: unknown) => z.object({ id: z.string().min(1).max(100) }).parse(data);

export const getComposer = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => z.object({ assetId: z.string().max(100).optional() }).parse(data))
  .handler(async ({ data, context }) => {
    const viewer = await viewerFrom(context.user);
    const [status, pickable] = await Promise.all([serviceStatus(), assets.listPickable(viewer.id)]);
    let selected: assets.AssetView | null = null;
    if (data.assetId) {
      selected = pickable.find((a) => a.id === data.assetId) ?? null;
      if (!selected) {
        selected = await assets.ownImage(viewer.id, data.assetId).then(assets.toView, () => null);
      }
    }
    return { status, pickable, selected };
  });

export const submitGeneration = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => data)
  .handler(async ({ data, context }) => {
    const viewer = await viewerFrom(context.user);
    return generations.createGeneration(viewer.id, data);
  });

export const getGenerations = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(async ({ context }) => {
    const viewer = await viewerFrom(context.user);
    return generations.listGenerations(viewer.id);
  });

export const getGeneration = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator(idInput)
  .handler(async ({ data, context }) => {
    const viewer = await viewerFrom(context.user);
    return generations.getGeneration(viewer.id, data.id);
  });

export const retryGeneration = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator(idInput)
  .handler(async ({ data, context }) => {
    const viewer = await viewerFrom(context.user);
    return generations.retryGeneration(viewer.id, data.id);
  });

export const regenerate = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator(idInput)
  .handler(async ({ data, context }) => {
    const viewer = await viewerFrom(context.user);
    return generations.regenerate(viewer.id, data.id);
  });

export const getLibrary = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) =>
    z.object({ type: z.enum(assets.ASSET_FILTERS), page: z.number().int().min(1) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const viewer = await viewerFrom(context.user);
    return assets.listAssets(viewer.id, { type: data.type, page: data.page, limit: 12 });
  });

export const getAsset = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator(idInput)
  .handler(async ({ data, context }) => {
    const viewer = await viewerFrom(context.user);
    return assets.getAsset(viewer, data.id);
  });

export const deleteAsset = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator(idInput)
  .handler(async ({ data, context }) => {
    const viewer = await viewerFrom(context.user);
    await assets.deleteAsset(viewer, data.id);
    return { deleted: true };
  });

export const getAllAssets = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => z.object({ page: z.number().int().min(1) }).parse(data))
  .handler(async ({ data, context }) => {
    const viewer = await viewerFrom(context.user);
    if (!viewer.admin) return { allowed: false as const };
    return { allowed: true as const, ...(await assets.listAllAssets(viewer, { page: data.page, limit: 24 })) };
  });
