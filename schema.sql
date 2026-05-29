-- Create Database if not exists
CREATE DATABASE IF NOT EXISTS `schedule_db`;
USE `schedule_db`;

-- Create Schedules Table
CREATE TABLE IF NOT EXISTS `schedules` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `title` VARCHAR(255) NOT NULL,
  `description` TEXT NULL,
  `schedule_datetime` DATETIME NOT NULL,
  `hourly_reminder` BOOLEAN DEFAULT FALSE,
  `priority` VARCHAR(20) DEFAULT 'medium',
  `ringtone` VARCHAR(30) DEFAULT 'default',
  `is_completed` BOOLEAN DEFAULT FALSE,
  `last_reminded_at` DATETIME NULL DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
