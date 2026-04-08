CREATE TABLE `conversations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversation_id` integer NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `summaries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversation_id` integer NOT NULL,
	`content` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tool_calls` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text NOT NULL,
	`tool_name` text NOT NULL,
	`params_json` text,
	`outcome` text NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `user_profile` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`source` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_profile_key_unique` ON `user_profile` (`key`);