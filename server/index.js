/**
 * FFCreatorLite 视频合成服务
 * 基于 https://github.com/tnfe/FFCreatorLite
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import { SERVER_CONFIG, DIRS } from './config/config.js';
import videoRoutes from './routes/videoRoutes.js';
import mergeRoutes from './routes/mergeRoutes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { logger } from './utils/logger.js';
import { startCleanupScheduler } from './utils/cleanup.js';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 优先使用系统已安装的 FFmpeg/FFprobe，没有则回退到 @ffmpeg-installer / @ffprobe-installer
const detectSystemBinary = (name) => {
  try {
    const binPath = execSync(`which ${name}`, { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
    if (binPath && fs.existsSync(binPath)) {
      // 简单验证一次版本，确保可执行
      execSync(`${binPath} -version`, { stdio: ['ignore', 'pipe', 'pipe'] });
      return binPath;
    }
  } catch (err) {
    return null;
  }
  return null;
};

const isWindows = process.platform === 'win32';
const systemFfmpeg = isWindows ? null : detectSystemBinary('ffmpeg');
const systemFfprobe = isWindows ? null : detectSystemBinary('ffprobe');

let ffmpegPath = systemFfmpeg;
let ffprobePath = systemFfprobe;
let ffmpegVersion = '未知';
let usingSystem = false;

if (ffmpegPath && ffprobePath) {
  usingSystem = true;
  ffmpegVersion = execSync(`${ffmpegPath} -version`, { stdio: ['pipe', 'pipe', 'pipe'] }).toString().split('\n')[0] || '未知';
  logger.info(`[FFmpeg] 检测到系统已安装版本: ${ffmpegPath}`);
  logger.info(`[FFmpeg] 版本信息: ${ffmpegVersion}`);
} else {
  // Windows 或未检测到系统 FFmpeg 时，回退到 npm 安装的二进制
  ffmpegPath = ffmpegInstaller.path;
  ffprobePath = ffprobeInstaller?.path || ffmpegPath.replace('ffmpeg', 'ffprobe');
  ffmpegVersion = ffmpegInstaller.version || '未知';

  // 验证 FFmpeg / FFprobe 文件是否存在
  const missing = [];
  if (!fs.existsSync(ffmpegPath)) missing.push(`FFmpeg 文件不存在: ${ffmpegPath}`);
  if (!fs.existsSync(ffprobePath)) missing.push(`FFprobe 文件不存在: ${ffprobePath}`);
  if (missing.length) {
    missing.forEach(msg => logger.error(msg));
    throw new Error(missing.join(' | '));
  }

  logger.info(`[FFmpeg] 使用 npm 包中的二进制: ${ffmpegPath}`);
  logger.info(`[FFmpeg] 版本: ${ffmpegVersion}`);
}

// 设置环境变量，让 FFCreatorLite 使用已选定的 FFmpeg/FFprobe
process.env.FFMPEG_PATH = ffmpegPath;
process.env.FFPROBE_PATH = ffprobePath;

// 将 FFmpeg 目录添加到 PATH，确保可以找到
const ffmpegDir = path.dirname(ffmpegPath);
process.env.PATH = `${ffmpegDir}${path.delimiter}${process.env.PATH}`;

const app = express();

// 中间件
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// 静态文件服务 - 用于下载渲染完成的视频
app.use('/output', express.static(DIRS.output));

// 注册路由
app.use('/node-api/video', videoRoutes);

// 兼容原有接口：/node-api/merge（向后兼容）
// 保持原有功能可用，原有代码无需修改
app.use('/node-api/merge', mergeRoutes);

/**
 * 健康检查
 * GET /node-api/health
 */
app.get('/node-api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    ffmpeg: {
      path: ffmpegPath,
      version: ffmpegVersion,
      source: usingSystem ? 'system' : 'npm-installer'
    }
  });
});

// 404 处理（必须在所有路由之后）
app.use(notFoundHandler);

// 错误处理中间件（必须在最后）
app.use(errorHandler);

// 启动服务器
app.listen(SERVER_CONFIG.port, SERVER_CONFIG.host, () => {
  logger.info(`${'='.repeat(60)}`);
  logger.info(`🎬 FFCreatorLite 视频合成服务`);
  logger.info(`📡 运行在 http://${SERVER_CONFIG.host}:${SERVER_CONFIG.port}`);
  logger.info(`📁 输出目录: ${DIRS.output}`);
  logger.info(`📁 缓存目录: ${DIRS.cache}`);
  logger.info(`📁 上传目录: ${DIRS.uploads}`);
  logger.info(`${'='.repeat(60)}`);

  // 启动定时清理任务
  startCleanupScheduler();
});
