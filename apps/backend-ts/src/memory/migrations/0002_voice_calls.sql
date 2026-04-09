CREATE TABLE `voice_calls` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversation_id` integer,
	`timestamp` text NOT NULL,
	`audio_bytes` integer NOT NULL,
	`transcription` text,
	`stt_provider` text NOT NULL,
	`stt_latency_ms` integer,
	`tts_provider` text,
	`tts_latency_ms` integer,
	`tts_bytes` integer,
	`success` integer NOT NULL,
	`error` text,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action
);
