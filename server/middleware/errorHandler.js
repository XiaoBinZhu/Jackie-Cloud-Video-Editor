/**
 * 统一错误处理中间件
 */
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * 错误处理中间件
 * @param {Error} err - 错误对象
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @param {Function} next - Express next 函数
 */
export function errorHandler(err, req, res, next) {
  // 如果是 AppError，使用其状态码和消息
  if (err instanceof AppError) {
    logger.warn(`请求错误 [${err.statusCode}]: ${err.message}`, err.details || {});
    
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
      ...(err.details && { details: err.details })
    });
  }

  // 如果是验证错误（Express 内置）
  if (err.name === 'ValidationError') {
    logger.warn(`验证错误: ${err.message}`);
    return res.status(400).json({
      success: false,
      error: err.message
    });
  }

  // 未知错误
  logger.error('未处理的错误', err);
  
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? '服务器内部错误' 
      : err.message || '服务器内部错误'
  });
}

/**
 * 404 错误处理中间件
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @param {Function} next - Express next 函数
 */
export function notFoundHandler(req, res, next) {
  res.status(404).json({
    success: false,
    error: `路由 ${req.method} ${req.path} 不存在`
  });
}

