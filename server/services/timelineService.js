/**
 * 时间线构建服务
 * 从片段数据构建 FFCreatorLite 时间线
 */
import fs from 'fs';
import path from 'path';
import { downloadFromOSS, processText } from './ossService.js';
import { getResolution } from '../utils/videoUtils.js';
import { mergeVideoWithAudio, preprocessVideoForPortrait } from '../render/videoUtils.js';
import { DIRS } from '../config/config.js';
import { logger } from '../utils/logger.js';

/**
 * 从片段数据构建时间线
 * @param {Array} segments - 片段数组
 * @param {Object} settings - 设置对象
 * @param {number} defaultSegmentDuration - 默认片段时长（秒）
 * @param {string} taskId - 任务 ID（用于创建独立文件夹）
 * @returns {Promise<{timeline: Object, tempFiles: Array}>} 时间线和临时文件列表
 */
export async function buildTimelineFromSegments(segments, settings, defaultSegmentDuration = 5, taskId = null) {
    const orientation = settings.orientation || 'landscape';
    const resolution = getResolution(settings.resolution || '720p', orientation);
    const fitMode = settings.fitMode || 'contain';

    const videoClips = [];
    const textClips = [];
    const tempFiles = []; // 记录临时文件，用于后续清理

    let currentStartTime = 0; // 当前片段的开始时间（累加前面所有片段的时长）

    for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        // 每个片段可以使用自己的 duration，如果没有就用默认的 defaultSegmentDuration
        const currentSegmentDuration = segment.duration || defaultSegmentDuration;
        const startTime = currentStartTime;

        // 处理视频（必需）
        if (!segment.video) {
            throw new Error(`片段 ${i + 1} 缺少 video 字段`);
        }

        const videoPath = await downloadFromOSS(segment.video, 'video', i, taskId);
        tempFiles.push(videoPath);

        let finalVideoPath = videoPath;

        // 如果传入了独立音频，先与视频合并
        const hasAudio = typeof segment.audio === 'string' && segment.audio.trim() !== '';
        if (hasAudio) {
            logger.info(`[片段 ${i + 1}] 检测到 audio，开始下载并合并音频`);
            const audioPath = await downloadFromOSS(segment.audio, 'audio', i, taskId);
            tempFiles.push(audioPath);

            const outputDir = taskId ? path.join(DIRS.uploads, taskId) : path.dirname(videoPath);
            const mergedPath = path.join(
                outputDir,
                `segment_${i + 1}_merged_${Date.now()}${path.extname(videoPath) || '.mp4'}`
            );

            try {
                const mergedVideoPath = await mergeVideoWithAudio(videoPath, audioPath, mergedPath);

                if (!mergedVideoPath || !fs.existsSync(mergedVideoPath)) {
                    throw new Error(`片段 ${i + 1} 音频合并失败，生成文件不存在`);
                }

                finalVideoPath = mergedVideoPath;

                if (finalVideoPath !== videoPath) {
                    tempFiles.push(finalVideoPath);
                }

                logger.info(`[片段 ${i + 1}] 音频合并成功: ${finalVideoPath}`);
            } catch (mergeError) {
                logger.error(`[片段 ${i + 1}] 音频合并失败: ${mergeError.message}`);
                throw mergeError;
            }
        } else {
            logger.info(`[片段 ${i + 1}] 未检测到 audio，跳过音频合并`);
        }

        // 预处理视频以匹配画布尺寸，保证只有一个输出文件
        const clipFitMode = segment.fitMode || fitMode;
        try {
            const videoDir = path.dirname(finalVideoPath);
            const ext = path.extname(finalVideoPath) || '.mp4';
            const base = path.basename(finalVideoPath, ext);
            const preprocessedOutputPath = path.join(
                videoDir,
                `${base}_preprocessed_${clipFitMode}_${resolution.width}x${resolution.height}${ext}`
            );

            const processedPath = await preprocessVideoForPortrait(
                finalVideoPath,
                resolution.width,
                resolution.height,
                clipFitMode,
                preprocessedOutputPath
            );

            if (processedPath && fs.existsSync(processedPath)) {
                // 如果生成了新文件，则替换原文件，确保最终只保留一个文件
                if (processedPath !== finalVideoPath) {
                    try {
                        if (fs.existsSync(finalVideoPath)) {
                            fs.unlinkSync(finalVideoPath);
                        }
                        finalVideoPath = processedPath;
                        logger.info(`[片段 ${i + 1}] 预处理完成，使用新文件: ${finalVideoPath}`);
                    } catch (replaceError) {
                        logger.warn(`[片段 ${i + 1}] 预处理替换文件失败: ${replaceError.message}`);
                        // 替换失败时，使用预处理后的文件路径
                        finalVideoPath = processedPath;
                    }
                } else {
                    logger.info(`[片段 ${i + 1}] 预处理完成，使用原路径: ${finalVideoPath}`);
                }
            } else {
                logger.warn(`[片段 ${i + 1}] 预处理未生成新文件，继续使用: ${finalVideoPath}`);
            }
        } catch (preprocessError) {
            logger.warn(`[片段 ${i + 1}] 预处理异常，使用原视频: ${preprocessError.message}`);
        }

        if (!tempFiles.includes(finalVideoPath)) {
            tempFiles.push(finalVideoPath);
        }

        // 视频默认居中显示，有传参才按传参的算
        const videoTransform = segment.transform || {
            x: 50, // 默认居中
            y: 50, // 默认居中
            scale: 1
        };

        videoClips.push({
            id: `clip-video-${i}-${Date.now()}`,
            type: 'VIDEO',
            asset_src: finalVideoPath,
            name: `Video ${i + 1}`,
            start_time: startTime,
            duration: currentSegmentDuration,
            asset_offset: 0,
            filters: {
                opacity: segment.opacity ?? 1,
                volume: segment.volume ?? 1,
                transform: videoTransform
            },
            transitions: segment.transitions || {},
            fitMode: segment.fitMode || fitMode
        });

        // 处理文案（可选）
        if (segment.text) {
            const textContent = await processText(segment.text, i, taskId);
            if (textContent) {
                // 文案位置：如果传入了 textTransform，使用传入的值；否则使用默认位置
                let textTransform;
                if (segment.textTransform) {
                    textTransform = {
                        x: segment.textTransform.x,
                        y: segment.textTransform.y,
                        scale: segment.textTransform.scale ?? 1
                    };
                } else {
                    // 没有传参，使用默认位置
                    textTransform = {
                        scale: 1
                    };
                }

                // 文案样式：有传参才按传参的算，否则使用默认样式
                const subtitleStyle = segment.subtitleStyle || {
                    fontSize: 48,
                    fontColor: '#ffffff',
                    strokeColor: '#000000',
                    strokeWidth: 3,
                    fontWeight: 'normal'
                };

                // 文案动画效果（可选）
                // 支持 FFCreatorLite 的动画效果，如：fadeIn, fadeOut, moveInRight, moveInUpBack 等
                const textEffects = segment.textEffects || null;

                textClips.push({
                    id: `clip-text-${i}-${Date.now()}`,
                    type: 'TEXT',
                    asset_src: '',
                    name: textContent,
                    start_time: startTime,
                    duration: currentSegmentDuration,
                    asset_offset: 0,
                    filters: {
                        opacity: segment.textOpacity ?? 1,
                        volume: 1,
                        transform: textTransform
                    },
                    subtitle_style: subtitleStyle,
                    transitions: segment.textTransitions || {},
                    effects: textEffects // 添加动画效果配置
                });
            }
        }

        // 累加当前片段的时长，作为下一个片段的开始时间
        currentStartTime += currentSegmentDuration;
    }

    // 总时长是所有片段时长的累加
    const totalDuration = currentStartTime;

    const timeline = {
        duration: totalDuration,
        tracks: []
    };

    // 添加 TEXT track
    if (textClips.length > 0) {
        timeline.tracks.push({
            id: 't-overlay',
            type: 'TEXT',
            clips: textClips
        });
    }

    // 添加 VIDEO track
    if (videoClips.length > 0) {
        timeline.tracks.push({
            id: 't-video-1',
            type: 'VIDEO',
            clips: videoClips
        });
    }

    return { timeline, tempFiles };
}

