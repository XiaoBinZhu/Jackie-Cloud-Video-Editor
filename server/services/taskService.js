/**
 * 任务服务
 * 提取任务创建、状态查询等公共逻辑
 */
import path from 'path';
import fs from 'fs';
import { buildTimelineFromSegments } from './timelineService.js';
import { createVideoTask, getTaskStatus, getTaskResult, deleteTask, checkTaskTimeout, videoTasks } from './videoService.js';
import { DIRS, VIDEO_DEFAULTS } from '../config/config.js';
import { ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { taskQueue } from './taskQueue.js';

/**
 * 验证任务创建参数
 * @param {Object} body - 请求体
 * @throws {ValidationError} 验证失败时抛出
 */
export function validateTaskParams(body) {
  const { settings, segments, segmentDuration } = body;

  if (!settings) {
    throw new ValidationError('缺少 settings 参数');
  }

  if (!segments || !Array.isArray(segments) || segments.length === 0) {
    throw new ValidationError('segments 必须是非空数组');
  }

  // 验证每个片段必须有 video
  for (let i = 0; i < segments.length; i++) {
    if (!segments[i].video) {
      throw new ValidationError(`片段 ${i + 1} 缺少 video 字段`);
    }
  }

  const finalSegmentDuration = segmentDuration || VIDEO_DEFAULTS.segmentDuration;
  if (finalSegmentDuration <= 0) {
    throw new ValidationError('segmentDuration 必须大于 0');
  }
}

/**
 * 创建视频任务
 * @param {Object} options - 任务选项
 * @param {Object} options.settings - 视频设置
 * @param {Array} options.segments - 片段数组
 * @param {number} options.segmentDuration - 片段时长
 * @param {string} options.taskIdPrefix - 任务ID前缀（默认为 'video_'）
 * @param {string} options.taskType - 任务类型（用于日志）
 * @returns {Promise<{taskId: string, startTime: number}>} 任务ID和开始时间
 */
export async function createTask({ settings, segments, segmentDuration, taskIdPrefix = 'video_', taskType = '视频合成' }) {
  // 验证参数
  validateTaskParams({ settings, segments, segmentDuration });

  const finalSegmentDuration = segmentDuration || VIDEO_DEFAULTS.segmentDuration;
  
  // 生成任务 ID
  const taskId = `${taskIdPrefix}${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const startTime = Date.now();

  const taskLogger = logger.withTaskId(taskId);
  taskLogger.info(`开始${taskType}任务`);
  taskLogger.info(`设置: ${JSON.stringify(settings)}`);
  taskLogger.info(`片段数量: ${segments.length}`);
  taskLogger.info(`每段时长: ${finalSegmentDuration}秒`);

  // 创建任务专用文件夹
  const taskDir = path.join(DIRS.uploads, taskId);
  if (!fs.existsSync(taskDir)) {
    fs.mkdirSync(taskDir, { recursive: true });
    taskLogger.info(`创建任务文件夹: ${taskDir}`);
  }

  // 先初始化任务状态，确保可以立即查询
  const initialTask = {
    status: 'processing',
    progress: 0,
    message: '正在初始化...',
    outputFile: null,
    base64Data: null,
    error: null,
    startTime,
    lastUpdate: startTime,
    logs: [],
    tempFiles: [],
    taskDir
  };
  videoTasks.set(taskId, initialTask);

  // 使用任务队列异步处理任务
  taskQueue.add(taskId, async () => {
    let tempFiles = [];

    try {
      // 构建时间线（传递 taskId，文件会下载到 taskId 文件夹）
      const { timeline, tempFiles: files } = await buildTimelineFromSegments(
        segments,
        settings,
        finalSegmentDuration,
        taskId
      );
      tempFiles = files;

      taskLogger.info(`构建的 timeline 时长: ${timeline.duration}秒`);
      taskLogger.info(`Tracks 数量: ${timeline.tracks.length}`);

      // 创建视频任务（传递 taskDir）
      await createVideoTask(taskId, settings, timeline, tempFiles, taskDir);

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      taskLogger.info(`${taskType}完成! 耗时: ${duration}秒`);

    } catch (error) {
      taskLogger.error(`${taskType}失败`, error);

      const errorTask = videoTasks.get(taskId);
      if (errorTask) {
        errorTask.status = 'error';
        errorTask.error = error.message || `${taskType}失败`;
        errorTask.message = error.message || `${taskType}失败`;
        errorTask.lastUpdate = Date.now();
      }
      throw error;
    }
  }).catch(error => {
    // 任务队列错误已在上面处理
    taskLogger.error(`任务队列错误`, error);
  });

  // 设置超时检查定时器
  const timeoutChecker = setInterval(() => {
    checkTaskTimeout(taskId);
    const task = videoTasks.get(taskId);
    if (task && (task.status === 'completed' || task.status === 'error')) {
      clearInterval(timeoutChecker);
    }
  }, 10000);

  return { taskId, startTime };
}

/**
 * 获取任务状态响应
 * @param {string} taskId - 任务ID
 * @returns {Object} 任务状态响应对象
 */
export function getTaskStatusResponse(taskId) {
  const task = getTaskStatus(taskId);

  if (!task) {
    return null;
  }

  // 计算耗时
  const elapsed = task.startTime ? Math.round((Date.now() - task.startTime) / 1000) : 0;
  const lastUpdateAgo = task.lastUpdate ? Math.round((Date.now() - task.lastUpdate) / 1000) : 0;

  return {
    taskId,
    status: task.status,
    progress: task.progress,
    message: task.message,
    error: task.error,
    elapsed: `${elapsed}秒`,
    lastUpdateAgo: `${lastUpdateAgo}秒前`,
    outputFile: task.outputFile ? `/output/${path.basename(task.outputFile)}` : null,
    recentLogs: (task.logs || []).slice(-10)
  };
}

/**
 * 获取任务结果响应
 * @param {string} taskId - 任务ID
 * @returns {Object|null} 任务结果响应对象
 */
export function getTaskResultResponse(taskId) {
  return getTaskResult(taskId);
}

/**
 * 下载任务文件
 * @param {string} taskId - 任务ID
 * @returns {{filePath: string}|null} 文件路径或 null
 */
export function getTaskDownloadFile(taskId) {
  const task = getTaskStatus(taskId);

  if (!task) {
    return null;
  }

  if (task.status !== 'completed' || !task.outputFile) {
    return null;
  }

  if (!fs.existsSync(task.outputFile)) {
    return null;
  }

  return { filePath: task.outputFile };
}

