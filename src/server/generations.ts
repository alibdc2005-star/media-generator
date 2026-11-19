import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { db } from "@/db";
import { assets, generations } from "@/db/schema";
import { listAssetsOfGeneration, ownImage, type AssetView } from "./assets";
import { AppError, notFound } from "./errors";
import { extensionOf, r2Key, sniff } from "./media";
import {
  PENDING_LIMIT,
  modelInput,
  modelLabel,
  validateGeneration,
  type GenerationSettings,
  type ValidGeneration,
} from "./models";
import {
  createPrediction,
  fetchOutput,
  getPrediction,
  outputUrls,
  serviceStatus,
  serviceUnavailable,
  uploadInput,
  type Target,
} from "./replicate";

type GenerationRow = typeof generations.$inferSelect;
export type GenerationStatus = GenerationRow["status"];

export interface GenerationView {
  id: string;
  kind: "image" | "video";
  model: string;
  modelLabel: string;
  prompt: string;
  settings: GenerationSettings;
  inputAssetId: string | null;
  status: GenerationStatus;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

function toView(row: GenerationRow): GenerationView {
  return {
    id: row.id,
    kind: row.kind,
    model: row.model,
    modelLabel: modelLabel(row.model) ?? row.model,
    prompt: row.prompt,
    settings: JSON.parse(row.settings) as GenerationSettings,
    inputAssetId: row.inputAssetId,
    status: row.status,
    error: row.error,
    createdAt: row.createdAt,
    finishedAt: row.finishedAt,
  };
}

const PENDING: GenerationStatus[] = ["queued", "running"];
const LIMIT_MESSAGE = `You already have ${PENDING_LIMIT} generations in progress. Start another when one finishes.`;
/** A job that never reached the model service is given up after this long. */
const STUCK_MS = 10 * 60 * 1000;

async function ownRow(userId: string, id: string): Promise<GenerationRow> {
  const [row] = await db
    .select()
    .from(generations)
    .where(and(eq(generations.id, id), eq(generations.userId, userId)))
    .limit(1);
  if (!row) throw notFound("That generation");
  return row;
}

/** Validates, checks the member's input image and the pending limit, records the job and starts it. */
export async function createGeneration(userId: string, raw: unknown): Promise<GenerationView> {
  const valid = validateGeneration(raw);
  if (valid.inputAssetId) await ownImage(userId, valid.inputAssetId);
  const status = await serviceStatus();
  if (!status.ready) throw serviceUnavailable(status);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  // One statement, so two quick submissions can't both slip under the limit.
  const result = await db.run(sql`
    INSERT INTO generations (id, user_id, kind, model, prompt, settings, input_asset_id, status, prediction_ids, created_at)
    SELECT ${id}, ${userId}, ${valid.kind}, ${valid.model}, ${valid.prompt}, ${JSON.stringify(valid.settings)},
           ${valid.inputAssetId}, 'queued', '[]', ${now}
    WHERE (SELECT count(*) FROM generations WHERE user_id = ${userId} AND status IN ('queued', 'running')) < ${PENDING_LIMIT}
  `);
  if (!result.meta.changes) throw new AppError(429, LIMIT_MESSAGE);
  return start(await ownRow(userId, id), undefined);
}

/** Sends a queued job to the model service; a refusal fails the job with the service's words. */
async function start(row: GenerationRow, target: Target): Promise<GenerationView> {
  const valid: ValidGeneration = {
    kind: row.kind,
    model: row.model,
    prompt: row.prompt,
    settings: JSON.parse(row.settings) as GenerationSettings,
    inputAssetId: row.inputAssetId,
  };
  let next: Partial<GenerationRow>;
  try {
    let imageUrl: string | null = null;
    if (row.inputAssetId) {
      const input = await ownImage(row.userId, row.inputAssetId);
      const object = await env.media.get(input.r2Key);
      if (!object) throw new Error("The input image is missing.");
      imageUrl = await uploadInput(target, await object.arrayBuffer(), input.contentType, `${input.id}.${extensionOf(input.contentType)}`);
    }
    const runs = row.kind === "image" ? (valid.settings.count ?? 1) : 1;
    const ids: string[] = [];
    for (let i = 0; i < runs; i++) {
      ids.push((await createPrediction(target, row.model, modelInput(valid, imageUrl))).id);
    }
    next = { status: "running", predictionIds: JSON.stringify(ids) };
  } catch (error) {
    next = { status: "failed", error: messageOf(error), finishedAt: new Date().toISOString() };
  }
  const [updated] = await db
    .update(generations)
    .set(next)
    .where(and(eq(generations.id, row.id), eq(generations.status, "queued")))
    .returning();
  return toView(updated ?? row);
}

function messageOf(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.slice(0, 1000) || "The model service failed.";
}

/** Checks a running job with the model service and saves its outputs once it's done. */
async function sync(row: GenerationRow, target: Target): Promise<void> {
  if (row.status === "queued") {
    if (Date.now() - Date.parse(row.createdAt) > STUCK_MS) {
      await finish(row, { status: "failed", error: "The job never started. Retry it." }, "queued");
    }
    return;
  }
  if (row.status !== "running") return;
  const ids = JSON.parse(row.predictionIds) as string[];
  try {
    const predictions = await Promise.all(ids.map((id) => getPrediction(target, id)));
    const broken = predictions.find((p) => p.status === "failed" || p.status === "canceled");
    if (broken) {
      await finish(row, { status: "failed", error: broken.error || "The model stopped before finishing." });
      return;
    }
    if (!predictions.every((p) => p.status === "succeeded")) return;
    const urls = predictions.flatMap((p) => outputUrls(p.output));
    if (!urls.length) throw new Error("The model finished without a result.");
    const rows: (typeof assets.$inferInsert)[] = [];
    for (const [index, url] of urls.entries()) {
      const { bytes } = await fetchOutput(url);
      const contentType = sniff(bytes);
      const wanted = row.kind === "video" ? "video/" : "image/";
      if (!contentType?.startsWith(wanted)) throw new Error("The model returned a file this app can't show.");
      const id = `${row.id}-${index + 1}`;
      const key = r2Key(row.userId, id);
      await env.media.put(key, bytes, { httpMetadata: { contentType } });
      rows.push({
        id,
        userId: row.userId,
        type: row.kind,
        contentType,
        size: bytes.byteLength,
        r2Key: key,
        generationId: row.id,
        prompt: row.prompt,
        model: row.model,
        settings: row.settings,
        createdAt: new Date(Date.now() + index).toISOString(),
      });
    }
    await db.insert(assets).values(rows).onConflictDoNothing();
    await finish(row, { status: "succeeded" });
  } catch (error) {
    await finish(row, { status: "failed", error: messageOf(error) });
  }
}

async function finish(
  row: GenerationRow,
  change: { status: GenerationStatus; error?: string },
  from: GenerationStatus = "running",
): Promise<void> {
  await db
    .update(generations)
    .set({ ...change, finishedAt: new Date().toISOString() })
    .where(and(eq(generations.id, row.id), eq(generations.status, from)));
}

/** Brings the member's pending jobs up to date: called when they look at them. */
async function syncPendingOf(userId: string): Promise<void> {
  const pending = await db
    .select()
    .from(generations)
    .where(and(eq(generations.userId, userId), inArray(generations.status, PENDING)));
  await Promise.all(pending.map((row) => sync(row, undefined)));
}

/** The background pass: every pending job, whoever's watching. */
export async function syncAllPending(): Promise<void> {
  const pending = await db
    .select()
    .from(generations)
    .where(inArray(generations.status, PENDING))
    .orderBy(generations.createdAt)
    .limit(100);
  const target: Target = { background: true };
  const status = await serviceStatus(target);
  for (const row of pending) {
    if (!status.ready && row.status === "running") continue;
    await sync(row, target);
  }
}

export async function listGenerations(userId: string): Promise<GenerationView[]> {
  await syncPendingOf(userId);
  const rows = await db
    .select()
    .from(generations)
    .where(eq(generations.userId, userId))
    .orderBy(desc(generations.createdAt), desc(generations.id))
    .limit(100);
  return rows.map(toView);
}

export async function getGeneration(
  userId: string,
  id: string,
): Promise<{ generation: GenerationView; assets: AssetView[] }> {
  let row = await ownRow(userId, id);
  if (PENDING.includes(row.status)) {
    await sync(row, undefined);
    row = await ownRow(userId, id);
  }
  return { generation: toView(row), assets: await listAssetsOfGeneration(userId, id) };
}

/** Runs a failed job again, in place. */
export async function retryGeneration(userId: string, id: string): Promise<GenerationView> {
  const row = await ownRow(userId, id);
  if (row.status !== "failed") throw new AppError(409, "Only a failed generation can be retried.");
  if (row.inputAssetId) await ownImage(userId, row.inputAssetId).catch(() => {
    throw new AppError(400, "The image this used has been deleted.");
  });
  const status = await serviceStatus();
  if (!status.ready) throw serviceUnavailable(status);
  const result = await db.run(sql`
    UPDATE generations SET status = 'queued', error = NULL, finished_at = NULL, prediction_ids = '[]'
    WHERE id = ${id} AND user_id = ${userId} AND status = 'failed'
      AND (SELECT count(*) FROM generations WHERE user_id = ${userId} AND status IN ('queued', 'running')) < ${PENDING_LIMIT}
  `);
  if (!result.meta.changes) throw new AppError(429, LIMIT_MESSAGE);
  return start(await ownRow(userId, id), undefined);
}

/** A new job with the same settings. */
export async function regenerate(userId: string, id: string): Promise<GenerationView> {
  const row = await ownRow(userId, id);
  const settings = JSON.parse(row.settings) as GenerationSettings;
  if (row.inputAssetId) await ownImage(userId, row.inputAssetId).catch(() => {
    throw new AppError(400, "The image this used has been deleted.");
  });
  return createGeneration(userId, {
    kind: row.kind,
    model: row.model,
    prompt: row.prompt,
    aspectRatio: settings.aspectRatio,
    count: settings.count,
    duration: settings.duration,
    inputAssetId: row.inputAssetId,
  });
}

export async function hasPending(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: generations.id })
    .from(generations)
    .where(and(eq(generations.userId, userId), inArray(generations.status, PENDING)))
    .limit(1);
  return Boolean(row);
}

