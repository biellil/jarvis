CREATE TABLE `actions_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text NOT NULL,
	`path` text NOT NULL,
	`action` text NOT NULL,
	`result` text NOT NULL,
	`model` text,
	`client_id` text,
	`request_id` text,
	CHECK(`result` IN ('approved','denied','timeout'))
);
