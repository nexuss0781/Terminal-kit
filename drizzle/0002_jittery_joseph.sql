ALTER TABLE `terminalEvents` DROP INDEX `terminalEvents_session_sequence_unique`;--> statement-breakpoint
ALTER TABLE `terminalEvents` DROP INDEX `terminalEvents_session_sequence_unique`;
--> statement-breakpoint
CREATE INDEX `terminalEvents_session_sequence_idx` ON `terminalEvents` (`sessionId`,`sequence`);
