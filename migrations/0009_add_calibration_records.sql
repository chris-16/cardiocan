CREATE TABLE `calibration_records` (
  `id` text PRIMARY KEY NOT NULL,
  `dog_id` text NOT NULL REFERENCES `dogs`(`id`) ON DELETE CASCADE,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `measurement_id` text NOT NULL REFERENCES `respiratory_measurements`(`id`) ON DELETE CASCADE,
  `ai_breaths_per_minute` integer NOT NULL,
  `final_breaths_per_minute` integer NOT NULL,
  `deviation` integer NOT NULL,
  `action` text NOT NULL,
  `ai_method` text NOT NULL,
  `ai_confidence` text NOT NULL,
  `correction_notes` text,
  `created_at` integer NOT NULL DEFAULT (unixepoch())
);
