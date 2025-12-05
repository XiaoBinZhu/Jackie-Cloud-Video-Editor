/**
 * FFCreatorLite 视频渲染模块
 * 基于 https://github.com/tnfe/FFCreatorLite
 * 
 * 核心原则：画布尺寸以传入的第一个视频的实际尺寸为准
 */
import path from 'path';
import { FFCreator } from 'ffcreatorlite';
import { getResolution, getCanvasSizeFromTimeline, resolveAssetPath } from './videoUtils.js';
import { collectClipsFromTimeline, calculateTimePoints, buildAllScenes } from './sceneBuilder.js';
import { logger } from '../utils/logger.js';

/**
 * 渲染视频主函数
 * @param {Object} options - 渲染选项
 * @param {string} options.taskId - 任务ID
 * @param {Object} options.settings - 视频设置
 * @param {Object} options.timeline - 时间线对象
 * @param {string} options.outputDir - 输出目录
 * @param {string} options.cacheDir - 缓存目录
 * @param {Function} options.onProgress - 进度回调
 * @param {Function} options.onComplete - 完成回调
 * @param {Function} options.onError - 错误回调
 */
export async function renderVideo({
  taskId,
  settings,
  timeline,
  outputDir,
  cacheDir,
  onProgress,
  onComplete,
  onError
}) {
  const taskLogger = logger.withTaskId(taskId);

  try {
    const { format, fps, resolution } = settings;

    onProgress(5, '正在检测视频尺寸...');

    // 兼容原有逻辑：如果设置了 resolution，优先使用固定画布尺寸
    // 如果 resolution 为 'auto' 或未设置，则使用视频实际尺寸
    let canvasWidth, canvasHeight;
    let useVideoSize = false;

    if (resolution && resolution !== 'auto') {
      // 使用设置的分辨率作为画布尺寸（原有逻辑）
      const orientation = settings.orientation || 'landscape';
      const resolutionConfig = getResolution(resolution, orientation);
      canvasWidth = resolutionConfig.width;
      canvasHeight = resolutionConfig.height;
      taskLogger.info(`画布尺寸: ${canvasWidth}x${canvasHeight} (来自设置的分辨率: ${resolution}, 方向: ${orientation})`);
    } else {
      // 使用视频实际尺寸作为画布尺寸（新逻辑）
      const videoDimensions = await getCanvasSizeFromTimeline(timeline);
      if (!videoDimensions) {
        // 如果无法获取视频尺寸，回退到默认分辨率
        const orientation = settings.orientation || 'landscape';
        const defaultResolution = getResolution('720p', orientation);
        canvasWidth = defaultResolution.width;
        canvasHeight = defaultResolution.height;
        taskLogger.warn(`无法获取视频尺寸，使用默认分辨率: ${canvasWidth}x${canvasHeight} (方向: ${orientation})`);
      } else {
        canvasWidth = videoDimensions.width;
        canvasHeight = videoDimensions.height;
        useVideoSize = true;
        taskLogger.info(`画布尺寸: ${canvasWidth}x${canvasHeight} (来自视频实际尺寸)`);
      }
    }

    const outputFileName = `video_${taskId}.${format}`;
    const outputPath = path.join(outputDir, outputFileName);

    onProgress(10, '正在创建 FFCreator 实例...');

    // 创建 FFCreatorLite 实例
    const creator = new FFCreator({
      cacheDir,
      outputDir,
      output: outputPath,
      width: canvasWidth,
      height: canvasHeight,
      fps,
      debug: false,
      audio: true,
    });

    onProgress(15, '正在解析时间线...');

    // 收集所有片段
    const { allClips, audioClips } = collectClipsFromTimeline(timeline);

    // 计算所有时间点并去重排序
    const sortedTimePoints = calculateTimePoints(allClips);

    taskLogger.info(`时间点: ${sortedTimePoints.join(', ')}`);
    taskLogger.info(`片段数量: 视频/图片/文字 ${allClips.length} 个, 音频 ${audioClips.length} 个`);

    onProgress(20, '正在创建场景...');

    // 构建所有场景
    const scenes = await buildAllScenes(
      sortedTimePoints,
      allClips,
      canvasWidth,
      canvasHeight,
      useVideoSize
    );

    // 添加场景到 creator
    scenes.forEach(scene => {
      creator.addChild(scene);
    });

    // 音频已在片段阶段与视频合并，这里无需额外处理
    onProgress(30, '音频已与视频合并，跳过独立音轨处理');

    onProgress(35, '正在启动渲染引擎...');

    // 渲染开始时间
    const renderStartTime = Date.now();
    let lastProgressTime = renderStartTime;
    let lastPercent = 0;

    // 监听事件
    creator.on('start', () => {
      taskLogger.info('FFCreator 开始渲染');
      onProgress(40, '渲染引擎已启动，正在处理视频帧...');
    });

    creator.on('progress', (e) => {
      const now = Date.now();
      const elapsed = ((now - renderStartTime) / 1000).toFixed(1);
      const percent = Math.floor(e.percent * 100);

      // 计算渲染速度
      const percentDiff = percent - lastPercent;
      const timeDiff = (now - lastProgressTime) / 1000;
      const speed = timeDiff > 0 ? (percentDiff / timeDiff).toFixed(1) : 0;

      lastPercent = percent;
      lastProgressTime = now;

      // 进度从 40% 到 95%
      const renderProgress = 40 + Math.floor(e.percent * 55);
      const message = `正在渲染: ${percent}% (已用 ${elapsed}秒, 速度 ${speed}%/s)`;

      onProgress(renderProgress, message);

      // 每 10% 输出一次日志
      if (percent % 10 === 0) {
        taskLogger.info(`渲染进度: ${percent}% (${elapsed}秒)`);
      }
    });

    creator.on('complete', (e) => {
      const totalTime = ((Date.now() - renderStartTime) / 1000).toFixed(1);
      taskLogger.info(`FFCreator 渲染完成! 总耗时: ${totalTime}秒`);
      taskLogger.info(`输出文件: ${e.output}`);
      onProgress(100, `渲染完成! 耗时 ${totalTime}秒`);
      onComplete(e.output);
    });

    creator.on('error', (e) => {
      const errorMsg = e.error || e.message || JSON.stringify(e) || '未知渲染错误';
      taskLogger.error(`FFCreator 渲染错误: ${errorMsg}`, e);
      onError(new Error(`渲染失败: ${errorMsg}`));
    });

    // 开始渲染
    taskLogger.debug('调用 creator.start()...');
    creator.start();
    taskLogger.debug('creator.start() 已调用，等待渲染完成...');

  } catch (error) {
    taskLogger.error('渲染失败', error);
    onError(error);
  }
}
