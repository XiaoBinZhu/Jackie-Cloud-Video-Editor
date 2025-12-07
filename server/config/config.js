/**
 * 项目配置文件
 */
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// 服务器配置
export const SERVER_CONFIG = {
  port: 8089,
  host: '0.0.0.0',
};

// 目录配置
export const DIRS = {
  root: PROJECT_ROOT,
  output: path.join(PROJECT_ROOT, 'output'),
  cache: path.join(PROJECT_ROOT, 'cache'),
  uploads: path.join(PROJECT_ROOT, 'uploads'),
};

// 确保目录存在
Object.values(DIRS).forEach(dir => {
  if (dir !== PROJECT_ROOT && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// FFmpeg 配置
export const FFMPEG_CONFIG = {
  timeout: 5 * 60 * 1000, // 5分钟超时
};

// 任务配置
export const TASK_CONFIG = {
  renderTimeout: parseInt(process.env.TASK_RENDER_TIMEOUT, 10) || 5 * 60 * 1000, // 渲染超时时间（5分钟）
  progressUpdateInterval: parseInt(process.env.TASK_PROGRESS_INTERVAL, 10) || 2000, // 进度更新间隔（2秒）
  maxConcurrentTasks: parseInt(process.env.TASK_MAX_CONCURRENT, 10) || 5, // 最大并发任务数
};

// 视频默认配置
export const VIDEO_DEFAULTS = {
  resolution: '720p',
  format: 'mp4',
  fps: 30,
  quality: 'medium',
  segmentDuration: 5, // 默认片段时长（秒）
};

// 导出所有配置
export default {
  SERVER_CONFIG,
  DIRS,
  FFMPEG_CONFIG,
  TASK_CONFIG,
  VIDEO_DEFAULTS,
};

