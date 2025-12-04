/**
 * 视频合成服务
 * 管理视频合成任务的状态和生命周期
 */
import { renderVideo } from '../render/renderVideo.js';
import { DIRS, TASK_CONFIG } from '../config/config.js';
import path from 'path';
import fs from 'fs';
import { cleanupFiles } from '../utils/fileUtils.js';
import { cleanupTaskDirectory } from '../utils/cleanup.js';
import { logger } from '../utils/logger.js';

// 存储任务状态
const videoTasks = new Map();

/**
 * 创建视频合成任务
 * @param {string} taskId - 任务 ID
 * @param {Object} settings - 视频设置
 * @param {Object} timeline - 时间线数据
 * @param {Array} tempFiles - 临时文件列表
 * @returns {Promise<void>}
 */
export async function createVideoTask(taskId, settings, timeline, tempFiles = [], taskDir = null) {
  const startTime = Date.now();

  // 获取或创建任务状态（可能已经在路由中初始化）
  let task = videoTasks.get(taskId);

  if (!task) {
    // 如果没有传入 taskDir，使用默认路径
    if (!taskDir) {
      taskDir = path.join(DIRS.uploads, taskId);
    }

    // 初始化任务状态
    task = {
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
    videoTasks.set(taskId, task);
  } else {
    // 更新现有任务的 tempFiles 和 taskDir（如果传入）
    task.tempFiles = tempFiles;
    if (taskDir) {
      task.taskDir = taskDir;
    }
    task.startTime = startTime;
    task.lastUpdate = startTime;
  }

  // 异步执行渲染
  return new Promise((resolve, reject) => {
    const outputFileName = `video_${taskId}.${settings.format || 'mp4'}`;
    const outputFile = path.join(DIRS.output, outputFileName);

    renderVideo({
      taskId,
      settings,
      timeline,
      outputDir: DIRS.output,
      cacheDir: DIRS.cache,
      onProgress: (progress, message) => {
        const currentTask = videoTasks.get(taskId);
        if (currentTask) {
          currentTask.progress = progress;
          currentTask.message = message;
          currentTask.lastUpdate = Date.now();
          currentTask.logs.push({
            time: new Date().toISOString(),
            progress,
            message
          });
        }
      },
      onComplete: (file) => {
        const completeTask = videoTasks.get(taskId);
        if (completeTask) {
          completeTask.status = 'completed';
          completeTask.progress = 100;
          completeTask.message = '视频合成完成';
          completeTask.outputFile = file;
          completeTask.lastUpdate = Date.now();

          // 读取视频文件并转换为 Base64
          try {
            if (fs.existsSync(file)) {
              const videoBuffer = fs.readFileSync(file);
              const base64String = videoBuffer.toString('base64');
              const mimeType = settings.format === 'webm' ? 'video/webm' : 'video/mp4';
              completeTask.base64Data = `data:${mimeType};base64,${base64String}`;
            }
          } catch (error) {
            logger.withTaskId(taskId).warn(`Base64 转换失败: ${error.message}`);
          }

          // 清理临时文件（删除整个 taskId 文件夹）
          const task = videoTasks.get(taskId);
          if (task && task.taskDir) {
            cleanupTaskDirectory(task.taskDir, taskId);
          } else {
            // 如果没有 taskDir，清理单个文件
            cleanupFiles(tempFiles);
          }
        }
        resolve(file);
      },
      onError: (error) => {
        const errorTask = videoTasks.get(taskId);
        if (errorTask) {
          errorTask.status = 'error';
          errorTask.error = error.message || '视频合成失败';
          errorTask.message = error.message || '视频合成失败';
          errorTask.lastUpdate = Date.now();
        }
        // 清理临时文件（删除整个 taskId 文件夹）
        const task = videoTasks.get(taskId);
        if (task && task.taskDir) {
          cleanupTaskDirectory(task.taskDir, taskId);
        } else {
          // 如果没有 taskDir，清理单个文件
          cleanupFiles(tempFiles);
        }
        reject(error);
      }
    });
  });
}

/**
 * 获取任务状态
 * @param {string} taskId - 任务 ID
 * @returns {Object|null} 任务状态
 */
export function getTaskStatus(taskId) {
  return videoTasks.get(taskId) || null;
}

/**
 * 获取任务结果
 * @param {string} taskId - 任务 ID
 * @returns {Object|null} 任务结果
 */
export function getTaskResult(taskId) {
  const task = videoTasks.get(taskId);
  if (!task) return null;

  if (task.status !== 'completed') {
    return {
      error: '任务尚未完成',
      status: task.status,
      progress: task.progress,
      message: task.message
    };
  }

  // Base64 转换成功后，删除输出视频文件
  try {
    fs.unlinkSync(task.outputFile);
    logger.withTaskId(taskId).info(`已删除输出视频文件: ${task.outputFile}`);
  } catch (deleteError) {
    logger.withTaskId(taskId).warn(`删除输出视频文件失败: ${deleteError.message}`);
  }
  return {
    success: true,
    taskId,
    mergedVideoUrl: task.base64Data,
    outputFile: task.outputFile ? `${path.basename(task.outputFile)}` : null,
    message: '视频合成完成'
  };
}

/**
 * 删除任务
 * @param {string} taskId - 任务 ID
 * @returns {boolean} 是否成功删除
 */
export function deleteTask(taskId) {
  const task = videoTasks.get(taskId);
  if (task) {
    // 删除输出文件
    if (task.outputFile && fs.existsSync(task.outputFile)) {
      fs.unlinkSync(task.outputFile);
    }
    // 清理任务文件夹
    if (task.taskDir) {
      cleanupTaskDirectory(task.taskDir, taskId);
    } else {
      // 如果没有 taskDir，清理单个文件
      cleanupFiles(task.tempFiles);
    }
    videoTasks.delete(taskId);
    return true;
  }
  return false;
}

/**
 * 检查任务超时
 * @param {string} taskId - 任务 ID
 */
export function checkTaskTimeout(taskId) {
  const task = videoTasks.get(taskId);
  if (task && task.status === 'processing') {
    const now = Date.now();
    const elapsed = now - task.startTime;

    // 如果超过超时时间，标记为超时
    if (elapsed > TASK_CONFIG.renderTimeout) {
      task.status = 'error';
      task.error = '渲染超时，请检查素材文件是否有效';
      task.message = '渲染超时';
      logger.withTaskId(taskId).error('渲染超时');
    } else if (elapsed > 60000 && now - task.lastUpdate > 60000) {
      // 如果超过 60 秒没有进度更新，标记为可能卡住
      task.message = `渲染中... (上次更新: ${Math.round((now - task.lastUpdate) / 1000)}秒前)`;
    }
  }
}

// 导出 videoTasks 以便路由可以直接访问
export { videoTasks };

