CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`account_key` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'available' NOT NULL,
	`created_at` text NOT NULL,
	`sold_at` text,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_account_key_unique` ON `accounts` (`account_key`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`action` text NOT NULL,
	`count` integer NOT NULL,
	`summary` text NOT NULL,
	`created_at` text NOT NULL
);
