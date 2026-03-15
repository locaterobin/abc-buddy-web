ALTER TABLE `dog_records` ADD `addedByStaffId` varchar(64);--> statement-breakpoint
ALTER TABLE `dog_records` ADD `addedByStaffName` varchar(128);--> statement-breakpoint
ALTER TABLE `dog_records` ADD `updatedByStaffId` varchar(64);--> statement-breakpoint
ALTER TABLE `dog_records` ADD `updatedByStaffName` varchar(128);--> statement-breakpoint
ALTER TABLE `dog_records` ADD `updatedAt` timestamp;--> statement-breakpoint
ALTER TABLE `dog_records` ADD `releasedByStaffId` varchar(64);--> statement-breakpoint
ALTER TABLE `dog_records` ADD `releasedByStaffName` varchar(128);--> statement-breakpoint
ALTER TABLE `release_plan_dogs` ADD `addedByStaffId` varchar(64);--> statement-breakpoint
ALTER TABLE `release_plan_dogs` ADD `addedByStaffName` varchar(128);