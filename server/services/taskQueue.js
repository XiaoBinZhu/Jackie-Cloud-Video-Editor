/**
 * 任务队列管理
 * 控制并发任务数量，防止资源耗尽
 */
import { TASK_CONFIG } from '../config/config.js';
import { logger } from '../utils/logger.js';

class TaskQueue {
  constructor() {
    this.maxConcurrent = TASK_CONFIG.maxConcurrentTasks || 5;
    this.running = new Set();
    this.queue = [];
  }

  /**
   * 添加任务到队列
   * @param {string} taskId - 任务ID
   * @param {Function} taskFn - 任务函数（返回 Promise）
   * @returns {Promise<any>} 任务执行结果
   */
  async add(taskId, taskFn) {
    return new Promise((resolve, reject) => {
      this.queue.push({
        taskId,
        taskFn,
        resolve,
        reject,
      });

      this.process();
    });
  }

  /**
   * 处理队列中的任务
   */
  async process() {
    // 如果已达到最大并发数或队列为空，不处理
    if (this.running.size >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const { taskId, taskFn, resolve, reject } = this.queue.shift();
    this.running.add(taskId);

    logger.debug(`任务队列: 开始执行任务 ${taskId} (运行中: ${this.running.size}/${this.maxConcurrent})`);

    try {
      const result = await taskFn();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.running.delete(taskId);
      logger.debug(`任务队列: 任务 ${taskId} 完成 (运行中: ${this.running.size}/${this.maxConcurrent})`);
      
      // 继续处理队列中的下一个任务
      this.process();
    }
  }

  /**
   * 获取当前运行中的任务数量
   * @returns {number}
   */
  getRunningCount() {
    return this.running.size;
  }

  /**
   * 获取队列中等待的任务数量
   * @returns {number}
   */
  getQueueLength() {
    return this.queue.length;
  }

  /**
   * 获取队列状态
   * @returns {Object}
   */
  getStatus() {
    return {
      running: this.running.size,
      queued: this.queue.length,
      maxConcurrent: this.maxConcurrent,
    };
  }

  /**
   * 检查任务是否在运行中
   * @param {string} taskId - 任务ID
   * @returns {boolean}
   */
  isRunning(taskId) {
    return this.running.has(taskId);
  }
}

// 导出单例实例
export const taskQueue = new TaskQueue();
export default taskQueue;

