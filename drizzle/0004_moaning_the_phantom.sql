CREATE TABLE `release_plan_dogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`planId` int NOT NULL,
	`dogId` varchar(32) NOT NULL,
	`addedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `release_plan_dogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `release_plans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teamIdentifier` varchar(64) NOT NULL,
	`planDate` varchar(6) NOT NULL,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `release_plans_id` PRIMARY KEY(`id`)
);
