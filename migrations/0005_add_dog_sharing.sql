CREATE TABLE `dog_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`dog_id` text NOT NULL REFERENCES `dogs`(`id`) ON DELETE CASCADE,
	`user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
	`role` text NOT NULL DEFAULT 'caretaker',
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `share_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`dog_id` text NOT NULL REFERENCES `dogs`(`id`) ON DELETE CASCADE,
	`invited_by` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
	`email` text,
	`token` text NOT NULL,
	`status` text NOT NULL DEFAULT 'pending',
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `share_invitations_token_unique` ON `share_invitations` (`token`);
