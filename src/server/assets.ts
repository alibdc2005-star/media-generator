import { and, count, desc, eq, inArray } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { db } from "@/db";
import { assets, users } from "@/db/schema";
import { AppError, notFound } from "./errors";
import { UPLOAD_LIMIT, UPLOAD_TYPES, r2Key, sniff } from "./media";
import { modelLabel, type GenerationSettings } from "./models";
import type { Viewer } from "./users";

export type AssetType = "image" | "video" | "upload";
export const ASSET_FILTERS = ["all", "image", "video", "upload"] as const;
export type AssetFilter = (typeof ASSET_FILTERS)[number];

export interface AssetView {
  id: string;
  type: AssetType;
  contentType: string;
  size: number;
  generationId: string | null;
  prompt: string | null;
  model: string | null;
  modelLabel: string | null;
  settings: GenerationSettings | null;
  createdAt: string;
  ownerEmail?: string;
}

type AssetRow = typeof assets.$inferSelect;

export function toView(row: AssetRow, ownerEmail?: string): AssetView {
  return {
    id: row.id,
    type: row.type,
    contentType: row.contentType,
    size: row.size,
    generationId: row.generationId,
    prompt: row.prompt,
    model: row.model,
    modelLabel: modelLabel(row.model),
    settings: row.settings ? (JSON.parse(row.settings) as GenerationSettings) : null,
    createdAt: row.createdAt,
    ...(ownerEmail === undefined ? {} : { ownerEmail }),
  };
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageCount: number;
}

function paging(page: number | undefined, limit: number | undefined) {
  const size = Math.min(Math.max(Math.trunc(limit ?? 12), 1), 48);
  const current = Math.max(Math.trunc(page ?? 1), 1);
  return { size, current, offset: (current - 1) * size };
}

/** One member's library, newest first. */
export async function listAssets(
  userId: string,
  { type = "all", page, limit }: { type?: AssetFilter; page?: number; limit?: number },
): Promise<Page<AssetView>> {
  const { size, current, offset } = paging(page, limit);
  const where = type === "all" ? eq(assets.userId, userId) : and(eq(assets.userId, userId), eq(assets.type, type));
  const [rows, [{ total } = { total: 0 }]] = await Promise.all([
    db.select().from(assets).where(where).orderBy(desc(assets.createdAt), desc(assets.id)).limit(size).offset(offset),
    db.select({ total: count() }).from(assets).where(where),
  ]);
  return { items: rows.map((row) => toView(row)), total, page: current, pageCount: Math.max(1, Math.ceil(total / size)) };
}

/** Every member's assets with their owner's email: for admins only. */
export async function listAllAssets(viewer: Viewer, { page, limit }: { page?: number; limit?: number }): Promise<Page<AssetView>> {
  if (!viewer.admin) throw new AppError(403, "Only admins can see everyone's assets.");
  const { size, current, offset } = paging(page, limit);
  const [rows, [{ total } = { total: 0 }]] = await Promise.all([
    db
      .select({ asset: assets, email: users.email })
      .from(assets)
      .leftJoin(users, eq(users.id, assets.userId))
      .orderBy(desc(assets.createdAt), desc(assets.id))
      .limit(size)
      .offset(offset),
    db.select({ total: count() }).from(assets),
  ]);
  return {
    items: rows.map(({ asset, email }) => toView(asset, email ?? asset.userId)),
    total,
    page: current,
    pageCount: Math.max(1, Math.ceil(total / size)),
  };
}

/** An asset the viewer may see: their own, or anyone's for an admin. */
export async function visibleAsset(viewer: Viewer, id: string): Promise<AssetRow | null> {
  const [row] = await db
    .select()
    .from(assets)
    .where(viewer.admin ? eq(assets.id, id) : and(eq(assets.id, id), eq(assets.userId, viewer.id)))
    .limit(1);
  return row ?? null;
}

/** The viewer's own image (generated or uploaded), for use as a reference or start frame. */
export async function ownImage(userId: string, id: string): Promise<AssetRow> {
  const [row] = await db
    .select()
    .from(assets)
    .where(and(eq(assets.id, id), eq(assets.userId, userId), inArray(assets.type, ["image", "upload"])))
    .limit(1);
  if (!row) throw new AppError(400, "Pick one of your own images.");
  return row;
}

export async function getAsset(viewer: Viewer, id: string): Promise<AssetView> {
  const row = await visibleAsset(viewer, id);
  if (!row) throw notFound("That asset");
  return toView(row);
}

export async function listAssetsOfGeneration(userId: string, generationId: string): Promise<AssetView[]> {
  const rows = await db
    .select()
    .from(assets)
    .where(and(eq(assets.userId, userId), eq(assets.generationId, generationId)))
    .orderBy(assets.id);
  return rows.map((row) => toView(row));
}

/** Removes the file and its record. Owners delete their own; admins anyone's. */
export async function deleteAsset(viewer: Viewer, id: string): Promise<void> {
  const row = await visibleAsset(viewer, id);
  if (!row) throw notFound("That asset");
  await env.media.delete(row.r2Key);
  // visibleAsset() already scoped the row to this viewer.
  await db.delete(assets).where(eq(assets.id, row.id));
}

/** Stores an uploaded reference image. */
export async function createUpload(userId: string, file: File): Promise<AssetView> {
  if (file.size > UPLOAD_LIMIT) throw new AppError(413, "Images can be at most 10 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = sniff(bytes);
  if (!contentType || !UPLOAD_TYPES.includes(contentType)) {
    throw new AppError(400, "Upload a PNG, JPEG or WebP image.");
  }
  const id = crypto.randomUUID();
  const key = r2Key(userId, id);
  await env.media.put(key, bytes, { httpMetadata: { contentType } });
  const row: AssetRow = {
    id,
    userId,
    type: "upload",
    contentType,
    size: bytes.byteLength,
    r2Key: key,
    generationId: null,
    prompt: null,
    model: null,
    settings: null,
    createdAt: new Date().toISOString(),
  };
  await db.insert(assets).values(row);
  return toView(row);
}

/** Recent images the viewer can pick as a reference or start frame. */
export async function listPickable(userId: string): Promise<AssetView[]> {
  const rows = await db
    .select()
    .from(assets)
    .where(and(eq(assets.userId, userId), inArray(assets.type, ["image", "upload"])))
    .orderBy(desc(assets.createdAt))
    .limit(48);
  return rows.map((row) => toView(row));
}
