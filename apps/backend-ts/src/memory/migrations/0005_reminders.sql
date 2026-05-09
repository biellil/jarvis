CREATE TABLE `reminders` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `due_at` integer NOT NULL,
  `message` text NOT NULL,
  `kind` text NOT NULL,
  `status` text NOT NULL DEFAULT 'pending',
  `created_at` integer NOT NULL,
  `fired_at` integer,
  `deferred_until` integer,
  CHECK(`kind` IN ('reminder','daily_summary','folder_event')),
  CHECK(`status` IN ('pending','fired','cancelled','deferred'))
);
--> statement-breakpoint
CREATE INDEX `reminders_due_at_idx` ON `reminders` (`due_at`);
--> statement-breakpoint
CREATE INDEX `reminders_status_idx` ON `reminders` (`status`);
