CREATE TABLE `dog_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teamIdentifier` varchar(64) NOT NULL,
	`dogId` varchar(32) NOT NULL,
	`imageUrl` text,
	`originalImageUrl` text,
	`description` text,
	`notes` text,
	`latitude` double,
	`longitude` double,
	`areaName` varchar(255),
	`source` enum('camera','upload') NOT NULL DEFAULT 'upload',
	`recordedAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `dog_records_id` PRIMARY KEY(`id`)
);
