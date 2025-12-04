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
import { SERVER_CONFIG, DIRS } from './config/config.js';
import videoRoutes from './routes/videoRoutes.js';
import mergeRoutes from './routes/mergeRoutes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { logger } from './utils/logger.js';
import { startCleanupScheduler } from './utils/cleanup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 初始化 FFmpeg - 使用 Node.js 包中的 FFmpeg
const ffmpegPath = ffmpegInstaller.path;
const ffprobePath = ffmpegPath.replace('ffmpeg', 'ffprobe');

// 设置环境变量，让 FFCreatorLite 使用我们的 FFmpeg
process.env.FFMPEG_PATH = ffmpegPath;
process.env.FFPROBE_PATH = ffprobePath;

// 将 FFmpeg 目录添加到 PATH，确保可以找到
const ffmpegDir = path.dirname(ffmpegPath);
process.env.PATH = `${ffmpegDir}${path.delimiter}${process.env.PATH}`;

// 验证 FFmpeg 文件是否存在
if (!fs.existsSync(ffmpegPath)) {
  logger.error(`FFmpeg 文件不存在: ${ffmpegPath}`);
  throw new Error(`FFmpeg 文件不存在: ${ffmpegPath}`);
}

logger.info(`使用 Node.js 包中的 FFmpeg: ${ffmpegPath}`);
logger.info(`FFmpeg 版本: ${ffmpegInstaller.version || '未知'}`);

const app = express();

// 中间件
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// 静态文件服务 - 用于下载渲染完成的视频
app.use('/output', express.static(DIRS.output));

// 注册路由
app.use('/api/video', videoRoutes);

// 兼容原有接口：/api/merge（向后兼容）
// 保持原有功能可用，原有代码无需修改
app.use('/api/merge', mergeRoutes);

/**
 * 健康检查
 * GET /api/health
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    ffmpeg: {
      path: ffmpegPath,
      version: ffmpegInstaller.version || '未知'
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
