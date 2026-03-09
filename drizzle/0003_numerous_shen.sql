ALTER TABLE `dog_records` ADD `releasedAt` timestamp;--> statement-breakpoint
ALTER TABLE `dog_records` ADD `releaseLatitude` double;--> statement-breakpoint
ALTER TABLE `dog_records` ADD `releaseLongitude` double;--> statement-breakpoint
ALTER TABLE `dog_records` ADD `releaseAreaName` varchar(255);--> statement-breakpoint
ALTER TABLE `dog_records` ADD `releaseDistanceMetres` int;