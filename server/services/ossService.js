/**
 * OSS 文件下载服务
 * 支持从 HTTP/HTTPS URL 下载文件
 */
import fs from 'fs';
import path from 'path';
import { isURL, generateUniqueFileName, getFileExtension } from '../utils/fileUtils.js';
import { DIRS } from '../config/config.js';
import { logger } from '../utils/logger.js';

/**
 * 从 OSS URL 下载文件
 * @param {string} url - 文件 URL
 * @param {string} type - 文件类型 (video, audio, text)
 * @param {number} index - 文件索引（用于生成唯一文件名）
 * @param {string} taskId - 任务 ID（用于创建独立文件夹）
 * @returns {Promise<string>} 本地文件路径
 */
export async function downloadFromOSS(url, type = 'file', index = 0, taskId = null) {
  if (!url) {
    throw new Error('URL 不能为空');
  }

  // 如果不是 URL，直接返回（可能是本地路径）
  if (!isURL(url)) {
    // 如果是绝对路径，直接返回
    if (path.isAbsolute(url)) {
      return url;
    }
    // 相对路径，转换为绝对路径
    const PROJECT_ROOT = path.resolve(DIRS.root);
    return path.join(PROJECT_ROOT, url.startsWith('/') ? url.slice(1) : url);
  }

  try {
    logger.debug(`[OSS] 正在下载: ${url}`);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`下载失败: ${response.status} ${response.statusText}`);
    }

    // 获取文件扩展名
    let ext = getFileExtension(url);
    if (!ext) {
      // 根据 Content-Type 推断扩展名
      const contentType = response.headers.get('content-type');
      if (contentType) {
        if (contentType.includes('video/mp4')) ext = '.mp4';
        else if (contentType.includes('video/webm')) ext = '.webm';
        else if (contentType.includes('audio/mpeg')) ext = '.mp3';
        else if (contentType.includes('audio/wav')) ext = '.wav';
        else if (contentType.includes('text/plain')) ext = '.txt';
        else ext = '.bin';
      } else {
        // 默认扩展名
        if (type === 'video') ext = '.mp4';
        else if (type === 'audio') ext = '.mp3';
        else if (type === 'text') ext = '.txt';
        else ext = '.bin';
      }
    }

    // 确定存储目录：如果有 taskId，使用 taskId 文件夹，否则使用 uploads 根目录
    let targetDir = DIRS.uploads;
    if (taskId) {
      targetDir = path.join(DIRS.uploads, taskId);
    }

    // 确保目录存在
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // 生成唯一文件名
    const fileName = generateUniqueFileName(type, ext, targetDir);

    // 下载文件
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(fileName, Buffer.from(buffer));

    const fileSize = (buffer.byteLength / 1024 / 1024).toFixed(2);
    logger.info(`[OSS] ✅ 下载完成: ${fileName} (${fileSize}MB)`);

    return fileName;
  } catch (error) {
    logger.error(`[OSS] ❌ 下载失败: ${url}`, error.message);
    throw new Error(`下载 OSS 文件失败: ${error.message}`);
  }
}

/**
 * 批量下载文件
 * @param {Array<{url: string, type: string, index: number}>} files - 文件列表
 * @returns {Promise<Array<string>>} 本地文件路径列表
 */
export async function downloadMultipleFiles(files) {
  const results = [];
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      const localPath = await downloadFromOSS(file.url, file.type || 'file', file.index || i);
      results.push(localPath);
    } catch (error) {
      logger.error(`[OSS] 批量下载失败 [${i}]: ${error.message}`);
      throw error;
    }
  }

  return results;
}

/**
 * 处理文本内容
 * 支持 URL、文件路径、纯文本字符串
 * @param {string} textInput - 文本输入（URL、文件路径或纯文本）
 * @param {number} index - 索引
 * @param {string} taskId - 任务 ID（用于创建独立文件夹）
 * @returns {Promise<string>} 文本内容
 */
export async function processText(textInput, index = 0, taskId = null) {
  if (!textInput) return null;

  // 如果是纯文本字符串（不包含 http:// 或 https:// 且不是文件路径）
  if (!isURL(textInput) && !textInput.includes('/') && !textInput.includes('\\')) {
    return textInput;
  }

  // 如果是 URL，下载后读取
  if (isURL(textInput)) {
    const localPath = await downloadFromOSS(textInput, 'text', index, taskId);
    return fs.readFileSync(localPath, 'utf-8').trim();
  }

  // 如果是文件路径，直接读取
  const filePath = path.isAbsolute(textInput)
    ? textInput
    : path.join(DIRS.root, textInput.startsWith('/') ? textInput.slice(1) : textInput);

  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf-8').trim();
  }

  return null;
}

