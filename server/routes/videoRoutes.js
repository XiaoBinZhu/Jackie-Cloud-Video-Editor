/**
 * 视频相关路由
 */
import express from 'express';
import {
  createTask,
  getTaskStatusResponse,
  getTaskResultResponse,
  getTaskDownloadFile
} from '../services/taskService.js';
import { deleteTask } from '../services/videoService.js';
import { NotFoundError } from '../utils/errors.js';

const router = express.Router();

/**
 * 创建视频合成任务
 * POST /node-api/video/create
 */
router.post('/create', async (req, res, next) => {
  try {
    const { settings, segments, segmentDuration } = req.body;

    const { taskId } = await createTask({
      settings,
      segments,
      segmentDuration,
      taskIdPrefix: 'video_',
      taskType: '视频合成'
    });

    // 立即返回 taskId
    res.json({
      success: true,
      taskId,
      message: '视频合成任务已创建'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 查询任务状态
 * GET /node-api/video/:taskId/status
 */
router.get('/:taskId/status', (req, res, next) => {
  try {
    const { taskId } = req.params;
    const status = getTaskStatusResponse(taskId);

    if (!status) {
      return next(new NotFoundError('任务不存在或服务器已重启'));
    }

    res.json(status);
  } catch (error) {
    next(error);
  }
});

/**
 * 获取合成结果（Base64 视频数据）
 * GET /node-api/video/:taskId/result
 */
router.get('/:taskId/result', (req, res, next) => {
  try {
    const { taskId } = req.params;
    const result = getTaskResultResponse(taskId);

    if (!result) {
      return next(new NotFoundError('任务不存在或服务器已重启'));
    }

    if (result.error) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * 下载视频文件
 * GET /node-api/video/:taskId/download
 */
router.get('/:taskId/download', (req, res, next) => {
  try {
    const { taskId } = req.params;
    const download = getTaskDownloadFile(taskId);

    if (!download) {
      const status = getTaskStatusResponse(taskId);
      if (!status) {
        return next(new NotFoundError('任务不存在'));
      }
      if (status.status !== 'completed') {
        return res.status(400).json({ error: '视频尚未合成完成' });
      }
      return res.status(404).json({ error: '视频文件不存在' });
    }

    res.download(download.filePath);
  } catch (error) {
    next(error);
  }
});

/**
 * 删除任务
 * DELETE /node-api/video/:taskId
 */
router.delete('/:taskId', (req, res, next) => {
  try {
    const { taskId } = req.params;
    const deleted = deleteTask(taskId);

    if (deleted) {
      res.json({ success: true, message: '任务已删除' });
    } else {
      next(new NotFoundError('任务不存在'));
    }
  } catch (error) {
    next(error);
  }
});

export default router;
