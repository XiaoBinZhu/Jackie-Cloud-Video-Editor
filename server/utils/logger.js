import util from 'util';

/**
 * 结构化日志工具
 * 支持不同日志级别和格式化输出
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

const LOG_LEVEL_NAMES = {
  [LOG_LEVELS.DEBUG]: 'DEBUG',
  [LOG_LEVELS.INFO]: 'INFO',
  [LOG_LEVELS.WARN]: 'WARN',
  [LOG_LEVELS.ERROR]: 'ERROR',
};

// 从环境变量获取日志级别，默认为 INFO
const getLogLevel = () => {
  const level = process.env.LOG_LEVEL?.toUpperCase() || 'INFO';
  return LOG_LEVELS[level] ?? LOG_LEVELS.INFO;
};

const currentLogLevel = getLogLevel();

/**
 * 安全序列化附加数据，避免循环引用导致崩溃
 * @param {any} data
 * @returns {string}
 */
function safeSerialize(data) {
  if (data === null || data === undefined) return '';
  if (typeof data !== 'object') return String(data);

  const seen = new WeakSet();
  try {
    return JSON.stringify(
      data,
      (key, value) => {
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) return '[Circular]';
          seen.add(value);
        }
        if (typeof value === 'function') {
          return `[Function ${value.name || 'anonymous'}]`;
        }
        return value;
      },
      2
    );
  } catch (err) {
    // 回退到 util.inspect，保证不会抛异常
    return util.inspect(data, { depth: 3, breakLength: 120 });
  }
}

/**
 * 格式化日志消息
 * @param {string} level - 日志级别
 * @param {string} message - 日志消息
 * @param {any} data - 附加数据
 * @returns {string} 格式化后的日志字符串
 */
function formatLog(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${LOG_LEVEL_NAMES[level]}]`;
  
  if (data !== null && data !== undefined) {
    return `${prefix} ${message} ${safeSerialize(data)}`;
  }
  
  return `${prefix} ${message}`;
}

/**
 * 日志记录器类
 */
class Logger {
  /**
   * 记录调试日志
   * @param {string} message - 日志消息
   * @param {any} data - 附加数据
   */
  debug(message, data = null) {
    if (currentLogLevel <= LOG_LEVELS.DEBUG) {
      console.log(formatLog(LOG_LEVELS.DEBUG, message, data));
    }
  }

  /**
   * 记录信息日志
   * @param {string} message - 日志消息
   * @param {any} data - 附加数据
   */
  info(message, data = null) {
    if (currentLogLevel <= LOG_LEVELS.INFO) {
      console.log(formatLog(LOG_LEVELS.INFO, message, data));
    }
  }

  /**
   * 记录警告日志
   * @param {string} message - 日志消息
   * @param {any} data - 附加数据
   */
  warn(message, data = null) {
    if (currentLogLevel <= LOG_LEVELS.WARN) {
      console.warn(formatLog(LOG_LEVELS.WARN, message, data));
    }
  }

  /**
   * 记录错误日志
   * @param {string} message - 日志消息
   * @param {Error|any} error - 错误对象或附加数据
   */
  error(message, error = null) {
    if (currentLogLevel <= LOG_LEVELS.ERROR) {
      if (error instanceof Error) {
        console.error(formatLog(LOG_LEVELS.ERROR, message), error);
      } else {
        console.error(formatLog(LOG_LEVELS.ERROR, message, error));
      }
    }
  }

  /**
   * 创建带任务ID的日志记录器
   * @param {string} taskId - 任务ID
   * @returns {Object} 带任务ID前缀的日志方法
   */
  withTaskId(taskId) {
    return {
      debug: (message, data) => this.debug(`[${taskId}] ${message}`, data),
      info: (message, data) => this.info(`[${taskId}] ${message}`, data),
      warn: (message, data) => this.warn(`[${taskId}] ${message}`, data),
      error: (message, error) => this.error(`[${taskId}] ${message}`, error),
    };
  }
}

// 导出单例实例
export const logger = new Logger();
export default logger;

