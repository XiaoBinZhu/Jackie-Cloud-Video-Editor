/**
 * 资源清理工具
 * 提供定时清理和批量清理功能
 */
import { cleanupDirectory, cleanupFile } from './fileUtils.js';
import { logger } from './logger.js';
import { DIRS, TASK_CONFIG } from '../config/config.js';
import fs from 'fs';
import path from 'path';

/**
 * 清理任务目录
 * @param {string} taskDir - 任务目录路径
 * @param {string} taskId - 任务ID（用于日志）
 */
export function cleanupTaskDirectory(taskDir, taskId = null) {
  if (!taskDir) return;

  try {
    if (fs.existsSync(taskDir)) {
      const taskLogger = taskId ? logger.withTaskId(taskId) : logger;
      taskLogger.debug(`清理任务目录: ${taskDir}`);
      cleanupDirectory(taskDir);
    }
  } catch (error) {
    const taskLogger = taskId ? logger.withTaskId(taskId) : logger;
    taskLogger.warn(`清理任务目录失败: ${taskDir}`, error.message);
  }
}

/**
 * 清理过期任务
 * 清理超过指定时间的已完成或失败任务
 * @param {number} maxAge - 最大保留时间（毫秒），默认 24 小时
 */
export function cleanupExpiredTasks(maxAge = 24 * 60 * 60 * 1000) {
  try {
    const uploadsDir = DIRS.uploads;
    if (!fs.existsSync(uploadsDir)) {
      return;
    }

    const now = Date.now();
    const entries = fs.readdirSync(uploadsDir, { withFileTypes: true });

    let cleanedCount = 0;
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const taskDir = path.join(uploadsDir, entry.name);
        const stats = fs.statSync(taskDir);
        const age = now - stats.mtimeMs;

        if (age > maxAge) {
          try {
            cleanupDirectory(taskDir);
            cleanedCount++;
            logger.debug(`清理过期任务目录: ${entry.name}`);
          } catch (error) {
            logger.warn(`清理过期任务目录失败: ${entry.name}`, error.message);
          }
        }
      }
    }

    if (cleanedCount > 0) {
      logger.info(`清理了 ${cleanedCount} 个过期任务目录`);
    }
  } catch (error) {
    logger.error('清理过期任务失败', error);
  }
}

/**
 * 清理输出目录中的旧文件
 * @param {number} maxAge - 最大保留时间（毫秒），默认 7 天
 * @param {number} maxFiles - 最大保留文件数，默认 100
 */
export function cleanupOutputFiles(maxAge = 7 * 24 * 60 * 60 * 1000, maxFiles = 100) {
  try {
    const outputDir = DIRS.output;
    if (!fs.existsSync(outputDir)) {
      return;
    }

    const files = fs.readdirSync(outputDir)
      .map(file => ({
        name: file,
        path: path.join(outputDir, file),
        stats: fs.statSync(path.join(outputDir, file))
      }))
      .filter(file => file.stats.isFile())
      .sort((a, b) => b.stats.mtimeMs - a.stats.mtimeMs); // 按修改时间降序

    const now = Date.now();
    let cleanedCount = 0;

    // 清理过期文件
    for (const file of files) {
      const age = now - file.stats.mtimeMs;
      if (age > maxAge) {
        try {
          cleanupFile(file.path);
          cleanedCount++;
          logger.debug(`清理过期输出文件: ${file.name}`);
        } catch (error) {
          logger.warn(`清理过期输出文件失败: ${file.name}`, error.message);
        }
      }
    }

    // 如果文件数超过限制，删除最旧的文件
    const remainingFiles = files.filter(file => fs.existsSync(file.path));
    if (remainingFiles.length > maxFiles) {
      const toDelete = remainingFiles.slice(maxFiles);
      for (const file of toDelete) {
        try {
          cleanupFile(file.path);
          cleanedCount++;
          logger.debug(`清理超出限制的输出文件: ${file.name}`);
        } catch (error) {
          logger.warn(`清理输出文件失败: ${file.name}`, error.message);
        }
      }
    }

    if (cleanedCount > 0) {
      logger.info(`清理了 ${cleanedCount} 个输出文件`);
    }
  } catch (error) {
    logger.error('清理输出文件失败', error);
  }
}

/**
 * 启动定时清理任务
 * @param {number} interval - 清理间隔（毫秒），默认 1 小时
 */
export function startCleanupScheduler(interval = 60 * 60 * 1000) {
  // 立即执行一次清理
  cleanupExpiredTasks();
  cleanupOutputFiles();

  // 设置定时清理
  setInterval(() => {
    cleanupExpiredTasks();
    cleanupOutputFiles();
  }, interval);

  logger.info(`已启动定时清理任务，间隔: ${interval / 1000 / 60} 分钟`);
}

