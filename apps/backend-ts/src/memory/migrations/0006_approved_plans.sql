CREATE TABLE `approved_plans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`plan_json` text NOT NULL,
	`approved_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	UNIQUE(`key`)
);
