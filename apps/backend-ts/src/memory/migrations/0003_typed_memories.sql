CREATE TABLE `typed_memories` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` integer NOT NULL,
	`type` text NOT NULL,
	`content` text NOT NULL,
	`confidence` real,
	`extracted_at` text NOT NULL,
	`source_id` integer,
	`source` text,
	`created_at` text NOT NULL,
	CHECK(`type` IN ('semantic','episodic','procedural')),
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE set null
);
