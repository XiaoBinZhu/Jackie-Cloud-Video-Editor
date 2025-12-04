/**
 * 兼容原有接口：/api/merge
 * 保持向后兼容，原有功能继续可用
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
 * 创建视频合并任务（原有接口）
 * POST /api/merge
 */
router.post('/', async (req, res, next) => {
    try {
        const { settings, segments, segmentDuration } = req.body;

        const { taskId } = await createTask({
            settings,
            segments,
            segmentDuration,
            taskIdPrefix: 'merge_',
            taskType: '视频合并'
        });

        // 立即返回 taskId（兼容原有接口格式）
        res.json({
            success: true,
            taskId,
            message: '合并任务已创建'
        });
    } catch (error) {
        next(error);
    }
});

/**
 * 查询任务状态（原有接口）
 * GET /api/merge/:taskId/status
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
 * 获取合成结果（原有接口）
 * GET /api/merge/:taskId/result
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
 * 下载视频文件（原有接口）
 * GET /api/merge/:taskId/download
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
 * 删除任务（原有接口）
 * DELETE /api/merge/:taskId
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
