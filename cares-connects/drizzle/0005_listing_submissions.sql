CREATE TABLE `listing_submissions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`status` text DEFAULT 'awaiting_email' NOT NULL,
	`name` text NOT NULL,
	`website` text NOT NULL,
	`phone` text NOT NULL,
	`address` text,
	`ein` text,
	`contact_name` text NOT NULL,
	`contact_email` text NOT NULL,
	`mission` text,
	`services` text NOT NULL,
	`statewide` integer DEFAULT false NOT NULL,
	`county_ids` text NOT NULL,
	`category_ids` text NOT NULL,
	`answers` text NOT NULL,
	`spam_flags` text NOT NULL,
	`checks` text,
	`db_matches` text,
	`email_status` text DEFAULT 'not_sent' NOT NULL,
	`email_token_hash` text,
	`email_token_expires_at` integer,
	`email_sent_at` integer,
	`email_send_count` integer DEFAULT 0 NOT NULL,
	`email_answered_at` integer,
	`reviewed_at` integer,
	`reviewed_by` text,
	`resource_id` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`resource_id`) REFERENCES `resources`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `listing_submissions_status_idx` ON `listing_submissions` (`status`);--> statement-breakpoint
CREATE INDEX `listing_submissions_email_idx` ON `listing_submissions` (`contact_email`);--> statement-breakpoint
CREATE INDEX `listing_submissions_token_idx` ON `listing_submissions` (`email_token_hash`);--> statement-breakpoint
CREATE TABLE `submission_throttle` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 1 NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `submission_throttle_expires_idx` ON `submission_throttle` (`expires_at`);