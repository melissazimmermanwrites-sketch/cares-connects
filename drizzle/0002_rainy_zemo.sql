CREATE TABLE `counties` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fips` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `counties_fips_unique` ON `counties` (`fips`);--> statement-breakpoint
CREATE UNIQUE INDEX `counties_slug_unique` ON `counties` (`slug`);--> statement-breakpoint
CREATE TABLE `discoveries` (
	`ein` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`street` text,
	`city` text,
	`zip` text,
	`county_id` integer,
	`ntee` text NOT NULL,
	`ruling` text,
	`category_slug` text,
	`status` text DEFAULT 'available' NOT NULL,
	`in_irs` integer DEFAULT true NOT NULL,
	`first_seen_run_id` integer,
	`first_seen_at` integer DEFAULT (unixepoch()) NOT NULL,
	`last_seen_at` integer DEFAULT (unixepoch()) NOT NULL,
	`reviewed_at` integer,
	`reviewed_by` text,
	`resource_id` integer,
	FOREIGN KEY (`county_id`) REFERENCES `counties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resource_id`) REFERENCES `resources`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `discoveries_status_idx` ON `discoveries` (`status`);--> statement-breakpoint
CREATE INDEX `discoveries_county_idx` ON `discoveries` (`county_id`);--> statement-breakpoint
CREATE INDEX `discoveries_name_idx` ON `discoveries` (`name`);--> statement-breakpoint
CREATE INDEX `discoveries_category_idx` ON `discoveries` (`category_slug`);--> statement-breakpoint
CREATE TABLE `discovery_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`triggered_by` text NOT NULL,
	`source_modified` text,
	`rows_read` integer DEFAULT 0 NOT NULL,
	`rows_matched` integer DEFAULT 0 NOT NULL,
	`new_count` integer DEFAULT 0 NOT NULL,
	`error` text,
	`started_at` integer DEFAULT (unixepoch()) NOT NULL,
	`finished_at` integer
);
--> statement-breakpoint
CREATE TABLE `resource_counties` (
	`resource_id` integer NOT NULL,
	`county_id` integer NOT NULL,
	PRIMARY KEY(`resource_id`, `county_id`),
	FOREIGN KEY (`resource_id`) REFERENCES `resources`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`county_id`) REFERENCES `counties`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `resource_counties_county_idx` ON `resource_counties` (`county_id`);--> statement-breakpoint
ALTER TABLE `resources` ADD `statewide` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `resources` ADD `ein` text;--> statement-breakpoint
CREATE UNIQUE INDEX `resources_ein_unique` ON `resources` (`ein`);