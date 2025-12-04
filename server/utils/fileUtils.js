/**
 * 文件工具函数
 */
import path from 'path';
import fs from 'fs';
import { logger } from './logger.js';

/**
 * 判断是否为 URL
 */
export function isURL(str) {
  return str && (str.startsWith('http://') || str.startsWith('https://'));
}

/**
 * 判断是否为绝对路径
 */
export function isAbsolutePath(filePath) {
  return path.isAbsolute(filePath);
}

/**
 * 获取文件扩展名
 */
export function getFileExtension(filePath) {
  return path.extname(new URL(filePath).pathname) || path.extname(filePath) || '';
}

/**
 * 确保目录存在
 */
export function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * 清理文件
 */
export function cleanupFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
  } catch (error) {
    logger.warn(`清理文件失败: ${filePath}`, error.message);
  }
  return false;
}

/**
 * 清理多个文件
 */
export function cleanupFiles(filePaths) {
  if (!Array.isArray(filePaths)) return;
  
  filePaths.forEach(filePath => {
    cleanupFile(filePath);
  });
}

/**
 * 清理目录（递归删除）
 */
export function cleanupDirectory(dirPath) {
  try {
    if (fs.existsSync(dirPath)) {
      const files = fs.readdirSync(dirPath);
      files.forEach(file => {
        const filePath = path.join(dirPath, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          cleanupDirectory(filePath);
        } else {
          fs.unlinkSync(filePath);
        }
      });
      fs.rmdirSync(dirPath);
      return true;
    }
  } catch (error) {
    logger.warn(`清理目录失败: ${dirPath}`, error.message);
  }
  return false;
}

/**
 * 生成唯一文件名
 */
export function generateUniqueFileName(prefix, extension, dir) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 9);
  const fileName = `${prefix}_${timestamp}_${random}${extension}`;
  return path.join(dir, fileName);
}

/**
 * 检查文件是否存在
 */
export function fileExists(filePath) {
  return fs.existsSync(filePath);
}

/**
 * 获取文件大小（字节）
 */
export function getFileSize(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      return stats.size;
    }
  } catch (error) {
    logger.warn(`获取文件大小失败: ${filePath}`, error.message);
  }
  return 0;
}

