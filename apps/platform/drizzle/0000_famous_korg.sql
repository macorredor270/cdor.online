CREATE TABLE `account` (
	`id` char(26) NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` char(26) NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` datetime(3),
	`refresh_token_expires_at` datetime(3),
	`scope` text,
	`password` text,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `account_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` char(26) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`token` varchar(255) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` char(26) NOT NULL,
	CONSTRAINT `session_id` PRIMARY KEY(`id`),
	CONSTRAINT `session_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` char(26) NOT NULL,
	`name` varchar(255) NOT NULL,
	`email` varchar(255) NOT NULL,
	`email_verified` boolean NOT NULL DEFAULT false,
	`image` text,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `user_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `verification` (
	`id` char(26) NOT NULL,
	`identifier` varchar(255) NOT NULL,
	`value` text NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `verification_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` char(26) NOT NULL,
	`user_id` char(26) NOT NULL,
	`title` varchar(255) NOT NULL,
	`model_mode` varchar(64) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`deleted_at` datetime(3),
	`sync_version` bigint unsigned NOT NULL DEFAULT 0,
	CONSTRAINT `conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `devices` (
	`id` char(26) NOT NULL,
	`user_id` char(26) NOT NULL,
	`name` varchar(120) NOT NULL,
	`platform` enum('web','android','ios','desktop') NOT NULL,
	`app_version` varchar(32) NOT NULL,
	`last_seen_at` datetime(3) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`revoked_at` datetime(3),
	CONSTRAINT `devices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `generation_requests` (
	`id` char(26) NOT NULL,
	`user_id` char(26) NOT NULL,
	`conversation_id` char(26) NOT NULL,
	`assistant_message_id` char(26) NOT NULL,
	`provider` varchar(32) NOT NULL,
	`model_id` varchar(160) NOT NULL,
	`state` enum('queued','streaming','completed','cancelled','failed') NOT NULL,
	`cancel_requested_at` datetime(3),
	`started_at` datetime(3),
	`completed_at` datetime(3),
	`latency_first_token_ms` int unsigned,
	`latency_total_ms` int unsigned,
	`input_tokens` int unsigned,
	`output_tokens` int unsigned,
	`error_code` varchar(64),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `generation_requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `generation_assistant_message_uq` UNIQUE(`assistant_message_id`)
);
--> statement-breakpoint
CREATE TABLE `idempotency_keys` (
	`user_id` char(26) NOT NULL,
	`idempotency_key` char(26) NOT NULL,
	`route` varchar(160) NOT NULL,
	`request_hash` char(64) NOT NULL,
	`state` enum('processing','completed','failed') NOT NULL DEFAULT 'processing',
	`resource_id` char(26),
	`response_status` smallint unsigned,
	`response_body` json,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`expires_at` datetime(3) NOT NULL,
	CONSTRAINT `idempotency_keys_pk` PRIMARY KEY(`user_id`,`idempotency_key`)
);
--> statement-breakpoint
CREATE TABLE `memories` (
	`id` char(26) NOT NULL,
	`user_id` char(26) NOT NULL,
	`content` text NOT NULL,
	`category` varchar(64) NOT NULL,
	`importance` tinyint unsigned NOT NULL DEFAULT 1,
	`enabled` boolean NOT NULL DEFAULT true,
	`source_message_id` char(26),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`deleted_at` datetime(3),
	`sync_version` bigint unsigned NOT NULL DEFAULT 0,
	CONSTRAINT `memories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` char(26) NOT NULL,
	`conversation_id` char(26) NOT NULL,
	`user_id` char(26) NOT NULL,
	`client_operation_id` char(26),
	`role` enum('user','assistant','system','tool') NOT NULL,
	`content` longtext NOT NULL,
	`status` enum('pending','streaming','completed','cancelled','failed') NOT NULL,
	`model_provider` varchar(32),
	`model_id` varchar(160),
	`input_tokens` int unsigned,
	`output_tokens` int unsigned,
	`finish_reason` varchar(32),
	`error_code` varchar(64),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`deleted_at` datetime(3),
	`sync_version` bigint unsigned NOT NULL DEFAULT 0,
	CONSTRAINT `messages_id` PRIMARY KEY(`id`),
	CONSTRAINT `messages_client_operation_uq` UNIQUE(`client_operation_id`)
);
--> statement-breakpoint
CREATE TABLE `model_presets` (
	`id` char(26) NOT NULL,
	`key` varchar(64) NOT NULL,
	`display_name` varchar(80) NOT NULL,
	`provider` varchar(32) NOT NULL,
	`model_id` varchar(160) NOT NULL,
	`mode` varchar(64) NOT NULL,
	`enabled` boolean NOT NULL DEFAULT false,
	`sort_order` smallint unsigned NOT NULL DEFAULT 0,
	`configuration` json NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `model_presets_id` PRIMARY KEY(`id`),
	CONSTRAINT `model_presets_key_uq` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`user_id` char(26) NOT NULL,
	`username` varchar(32),
	`public_name` varchar(80) NOT NULL,
	`avatar_url` varchar(2048),
	`locale` varchar(16) NOT NULL DEFAULT 'es-ES',
	`timezone` varchar(64) NOT NULL DEFAULT 'UTC',
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `profiles_user_id` PRIMARY KEY(`user_id`),
	CONSTRAINT `profiles_username_uq` UNIQUE(`username`)
);
--> statement-breakpoint
CREATE TABLE `rate_limit_buckets` (
	`scope` varchar(32) NOT NULL,
	`subject_hash` char(64) NOT NULL,
	`window_started_at` datetime(3) NOT NULL,
	`request_count` int unsigned NOT NULL DEFAULT 0,
	`expires_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `rate_limit_buckets_pk` PRIMARY KEY(`scope`,`subject_hash`,`window_started_at`)
);
--> statement-breakpoint
CREATE TABLE `sync_changes` (
	`change_id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` char(26) NOT NULL,
	`entity_type` varchar(32) NOT NULL,
	`entity_id` char(26) NOT NULL,
	`operation` enum('upsert','delete') NOT NULL,
	`entity_version` bigint unsigned NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `sync_changes_change_id` PRIMARY KEY(`change_id`)
);
--> statement-breakpoint
CREATE TABLE `usage_events` (
	`id` char(26) NOT NULL,
	`user_id` char(26) NOT NULL,
	`generation_id` char(26),
	`kind` varchar(32) NOT NULL,
	`provider` varchar(32),
	`model_id` varchar(160),
	`input_tokens` int unsigned NOT NULL DEFAULT 0,
	`output_tokens` int unsigned NOT NULL DEFAULT 0,
	`cost_microusd` bigint unsigned,
	`metadata` json,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `usage_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_preferences` (
	`id` char(26) NOT NULL,
	`user_id` char(26) NOT NULL,
	`locale` varchar(16) NOT NULL DEFAULT 'es-ES',
	`timezone` varchar(64) NOT NULL DEFAULT 'UTC',
	`theme` enum('system','light','dark') NOT NULL DEFAULT 'system',
	`default_model_mode` varchar(64) NOT NULL DEFAULT 'balanced',
	`memory_enabled` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`deleted_at` datetime(3),
	`sync_version` bigint unsigned NOT NULL DEFAULT 0,
	CONSTRAINT `user_preferences_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_preferences_user_uq` UNIQUE(`user_id`)
);
--> statement-breakpoint
ALTER TABLE `account` ADD CONSTRAINT `account_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `session` ADD CONSTRAINT `session_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `conversations` ADD CONSTRAINT `conversations_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `devices` ADD CONSTRAINT `devices_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `generation_requests` ADD CONSTRAINT `generation_requests_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `generation_requests` ADD CONSTRAINT `generation_requests_conversation_id_conversations_id_fk` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `generation_requests` ADD CONSTRAINT `generation_requests_assistant_message_id_messages_id_fk` FOREIGN KEY (`assistant_message_id`) REFERENCES `messages`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `idempotency_keys` ADD CONSTRAINT `idempotency_keys_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `memories` ADD CONSTRAINT `memories_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `memories` ADD CONSTRAINT `memories_source_message_id_messages_id_fk` FOREIGN KEY (`source_message_id`) REFERENCES `messages`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `messages` ADD CONSTRAINT `messages_conversation_id_conversations_id_fk` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `messages` ADD CONSTRAINT `messages_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `profiles` ADD CONSTRAINT `profiles_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sync_changes` ADD CONSTRAINT `sync_changes_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `usage_events` ADD CONSTRAINT `usage_events_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `usage_events` ADD CONSTRAINT `usage_events_generation_id_generation_requests_id_fk` FOREIGN KEY (`generation_id`) REFERENCES `generation_requests`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_preferences` ADD CONSTRAINT `user_preferences_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE INDEX `conversations_user_updated_idx` ON `conversations` (`user_id`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `conversations_user_deleted_updated_idx` ON `conversations` (`user_id`,`deleted_at`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `devices_user_last_seen_idx` ON `devices` (`user_id`,`last_seen_at`);--> statement-breakpoint
CREATE INDEX `devices_user_revoked_idx` ON `devices` (`user_id`,`revoked_at`);--> statement-breakpoint
CREATE INDEX `generation_user_state_idx` ON `generation_requests` (`user_id`,`state`,`created_at`);--> statement-breakpoint
CREATE INDEX `generation_conversation_created_idx` ON `generation_requests` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idempotency_expires_idx` ON `idempotency_keys` (`expires_at`);--> statement-breakpoint
CREATE INDEX `memories_user_enabled_updated_idx` ON `memories` (`user_id`,`enabled`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `memories_source_message_idx` ON `memories` (`source_message_id`);--> statement-breakpoint
CREATE INDEX `messages_conversation_created_idx` ON `messages` (`conversation_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `messages_user_conversation_created_idx` ON `messages` (`user_id`,`conversation_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `messages_user_updated_idx` ON `messages` (`user_id`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `model_presets_enabled_order_idx` ON `model_presets` (`enabled`,`sort_order`);--> statement-breakpoint
CREATE INDEX `rate_limit_expires_idx` ON `rate_limit_buckets` (`expires_at`);--> statement-breakpoint
CREATE INDEX `sync_changes_user_change_idx` ON `sync_changes` (`user_id`,`change_id`);--> statement-breakpoint
CREATE INDEX `sync_changes_created_idx` ON `sync_changes` (`created_at`);--> statement-breakpoint
CREATE INDEX `usage_user_created_idx` ON `usage_events` (`user_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `usage_generation_idx` ON `usage_events` (`generation_id`);--> statement-breakpoint
CREATE INDEX `user_preferences_user_updated_idx` ON `user_preferences` (`user_id`,`updated_at`);