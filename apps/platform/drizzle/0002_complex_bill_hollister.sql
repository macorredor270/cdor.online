ALTER TABLE `session` ADD `device_id` char(26);--> statement-breakpoint
CREATE INDEX `session_user_device_idx` ON `session` (`user_id`,`device_id`);