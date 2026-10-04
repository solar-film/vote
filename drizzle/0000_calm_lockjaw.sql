CREATE TABLE `current_round` (
	`id` integer PRIMARY KEY NOT NULL,
	`round_id` text NOT NULL,
	`title` text NOT NULL,
	`max_score` integer NOT NULL,
	`duration_seconds` integer NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`status` text NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`count` integer DEFAULT 0 NOT NULL
);
