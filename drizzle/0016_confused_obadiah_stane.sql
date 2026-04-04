CREATE TABLE `blocked_ips` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ip` varchar(64) NOT NULL,
	`blockedAt` timestamp NOT NULL DEFAULT (now()),
	`reason` varchar(255) NOT NULL DEFAULT 'Too many failed login attempts',
	`unblockedAt` timestamp,
	CONSTRAINT `blocked_ips_id` PRIMARY KEY(`id`),
	CONSTRAINT `blocked_ips_ip_unique` UNIQUE(`ip`)
);
--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ip` varchar(64) NOT NULL,
	`email` varchar(320),
	`success` boolean NOT NULL DEFAULT false,
	`attemptedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `login_attempts_id` PRIMARY KEY(`id`)
);
