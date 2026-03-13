CREATE TABLE `team_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teamIdentifier` varchar(64) NOT NULL,
	`docxTemplateUrl` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `team_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `team_settings_teamIdentifier_unique` UNIQUE(`teamIdentifier`)
);
