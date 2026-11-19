CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`r2_key` text NOT NULL,
	`generation_id` text,
	`prompt` text,
	`model` text,
	`settings` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `assets_user_created` ON `assets` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `assets_created` ON `assets` (`created_at`);--> statement-breakpoint
CREATE TABLE `generations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`model` text NOT NULL,
	`prompt` text NOT NULL,
	`settings` text NOT NULL,
	`input_asset_id` text,
	`status` text NOT NULL,
	`error` text,
	`prediction_ids` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	`finished_at` text
);
--> statement-breakpoint
CREATE INDEX `generations_user_created` ON `generations` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `generations_status` ON `generations` (`status`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`created_at` text NOT NULL
);
