CREATE TABLE `instances` (
	`id` int AUTO_INCREMENT NOT NULL,
	`createdBy` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`instanceUrl` varchar(2048) NOT NULL,
	`status` enum('pending','online','offline') NOT NULL DEFAULT 'pending',
	`enrollmentTokenHash` varchar(128) NOT NULL,
	`agentTokenHash` varchar(128),
	`agentTokenCiphertext` text,
	`cpuPercent` int NOT NULL DEFAULT 0,
	`memoryPercent` int NOT NULL DEFAULT 0,
	`memoryTotalMb` int NOT NULL DEFAULT 0,
	`activeSessions` int NOT NULL DEFAULT 0,
	`lastSeenAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `instances_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `terminalEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` varchar(40) NOT NULL,
	`sequence` int NOT NULL,
	`kind` enum('stdout','stderr','stdin','status') NOT NULL,
	`payload` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `terminalEvents_id` PRIMARY KEY(`id`),
	CONSTRAINT `terminalEvents_session_sequence_unique` UNIQUE(`sessionId`,`sequence`)
);
--> statement-breakpoint
CREATE TABLE `terminalSessions` (
	`id` varchar(40) NOT NULL,
	`instanceId` int NOT NULL,
	`createdBy` int NOT NULL,
	`command` text NOT NULL,
	`state` enum('queued','running','completed','failed') NOT NULL DEFAULT 'queued',
	`exitCode` int,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `terminalSessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `instances` ADD CONSTRAINT `instances_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `terminalEvents` ADD CONSTRAINT `terminalEvents_sessionId_terminalSessions_id_fk` FOREIGN KEY (`sessionId`) REFERENCES `terminalSessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `terminalSessions` ADD CONSTRAINT `terminalSessions_instanceId_instances_id_fk` FOREIGN KEY (`instanceId`) REFERENCES `instances`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `terminalSessions` ADD CONSTRAINT `terminalSessions_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `instances_createdBy_idx` ON `instances` (`createdBy`);--> statement-breakpoint
CREATE INDEX `instances_agentTokenHash_idx` ON `instances` (`agentTokenHash`);--> statement-breakpoint
CREATE INDEX `terminalEvents_sessionId_idx` ON `terminalEvents` (`sessionId`);--> statement-breakpoint
CREATE INDEX `terminalSessions_instanceId_idx` ON `terminalSessions` (`instanceId`);--> statement-breakpoint
CREATE INDEX `terminalSessions_createdBy_idx` ON `terminalSessions` (`createdBy`);