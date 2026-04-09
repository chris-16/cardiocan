CREATE TABLE `respiratory_measurements` (
	`id` text PRIMARY KEY NOT NULL,
	`dog_id` text NOT NULL,
	`user_id` text NOT NULL,
	`breath_count` integer NOT NULL,
	`duration_seconds` integer NOT NULL,
	`breaths_per_minute` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`dog_id`) REFERENCES `dogs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
