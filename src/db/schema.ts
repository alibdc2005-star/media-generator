import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Every row is keyed by the Gateway's user id (`user.id`).
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  createdAt: text("created_at").notNull(),
});

export const generations = sqliteTable(
  "generations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    kind: text("kind", { enum: ["image", "video"] }).notNull(),
    model: text("model").notNull(),
    prompt: text("prompt").notNull(),
    // JSON: { aspectRatio, count? , duration? }
    settings: text("settings").notNull(),
    inputAssetId: text("input_asset_id"),
    status: text("status", {
      enum: ["queued", "running", "succeeded", "failed"],
    }).notNull(),
    error: text("error"),
    // JSON array of the model service's prediction ids.
    predictionIds: text("prediction_ids").notNull().default("[]"),
    createdAt: text("created_at").notNull(),
    finishedAt: text("finished_at"),
  },
  (table) => [
    index("generations_user_created").on(table.userId, table.createdAt),
    index("generations_status").on(table.status),
  ],
);

export const assets = sqliteTable(
  "assets",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    type: text("type", { enum: ["image", "video", "upload"] }).notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    r2Key: text("r2_key").notNull(),
    generationId: text("generation_id"),
    prompt: text("prompt"),
    model: text("model"),
    settings: text("settings"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("assets_user_created").on(table.userId, table.createdAt),
    index("assets_created").on(table.createdAt),
  ],
);
