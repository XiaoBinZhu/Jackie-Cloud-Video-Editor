/**
 * 自定义错误类
 * 提供统一的错误处理格式
 */

/**
 * 应用基础错误类
 */
export class AppError extends Error {
  /**
   * @param {string} message - 错误消息
   * @param {number} statusCode - HTTP 状态码
   * @param {boolean} isOperational - 是否为可操作错误（非系统错误）
   */
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 验证错误（400）
 */
export class ValidationError extends AppError {
  /**
   * @param {string} message - 错误消息
   * @param {any} details - 错误详情
   */
  constructor(message, details = null) {
    super(message, 400);
    this.details = details;
  }
}

/**
 * 未找到错误（404）
 */
export class NotFoundError extends AppError {
  /**
   * @param {string} message - 错误消息
   */
  constructor(message = '资源未找到') {
    super(message, 404);
  }
}

/**
 * 任务错误
 */
export class TaskError extends AppError {
  /**
   * @param {string} message - 错误消息
   * @param {string} taskId - 任务ID
   * @param {number} statusCode - HTTP 状态码
   */
  constructor(message, taskId = null, statusCode = 500) {
    super(message, statusCode);
    this.taskId = taskId;
  }
}

/**
 * 文件错误
 */
export class FileError extends AppError {
  /**
   * @param {string} message - 错误消息
   * @param {string} filePath - 文件路径
   */
  constructor(message, filePath = null) {
    super(message, 400);
    this.filePath = filePath;
  }
}

/**
 * 渲染错误
 */
export class RenderError extends AppError {
  /**
   * @param {string} message - 错误消息
   * @param {string} taskId - 任务ID
   * @param {any} originalError - 原始错误
   */
  constructor(message, taskId = null, originalError = null) {
    super(message, 500);
    this.taskId = taskId;
    this.originalError = originalError;
  }
}

