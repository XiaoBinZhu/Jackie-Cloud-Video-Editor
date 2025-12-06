/**
 * 视频相关工具函数
 * 包含视频尺寸检测、路径解析等功能
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import ffmpeg from 'fluent-ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import { logger } from '../utils/logger.js';

// 设置 ffprobe 路径
ffmpeg.setFfprobePath(ffprobeInstaller.path);

// 获取项目根目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

/**
 * 获取视频的原始尺寸（使用 fluent-ffmpeg）
 * @param {string} videoPath - 视频文件路径
 * @returns {Promise<{width: number, height: number}|null>} 视频尺寸
 */
export function getVideoDimensions(videoPath) {
  return new Promise((resolve) => {
    try {
      // 如果是网络 URL，无法直接获取尺寸
      if (videoPath.startsWith('http://') || videoPath.startsWith('https://')) {
        resolve(null);
        return;
      }

      // 检查文件是否存在
      if (!fs.existsSync(videoPath)) {
        logger.warn(`视频文件不存在: ${videoPath}`);
        resolve(null);
        return;
      }

      // 使用 fluent-ffmpeg 获取视频信息
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          logger.warn(`获取视频尺寸失败: ${videoPath}`, err.message);
          resolve(null);
          return;
        }

        // 查找视频流
        const videoStream = metadata.streams?.find(stream => stream.codec_type === 'video');

        if (videoStream && videoStream.width && videoStream.height) {
          const dimensions = {
            width: parseInt(videoStream.width),
            height: parseInt(videoStream.height)
          };
          logger.debug(`视频尺寸: ${videoPath}: ${dimensions.width}x${dimensions.height}`);
          resolve(dimensions);
        } else {
          logger.warn(`未找到视频流信息: ${videoPath}`);
          resolve(null);
        }
      });
    } catch (error) {
      logger.warn(`获取视频尺寸异常: ${videoPath}`, error.message);
      resolve(null);
    }
  });
}

/**
 * 从时间线中获取第一个视频的实际尺寸作为画布尺寸
 * @param {Object} timeline - 时间线对象
 * @returns {Promise<{width: number, height: number}|null>} 画布尺寸
 */
export async function getCanvasSizeFromTimeline(timeline) {
  if (!timeline.tracks || !Array.isArray(timeline.tracks)) {
    return null;
  }

  // 遍历所有轨道，找到第一个视频片段
  for (const track of timeline.tracks) {
    if (track.type === 'VIDEO' && track.clips && Array.isArray(track.clips)) {
      for (const clip of track.clips) {
        if (clip.asset_src) {
          const videoPath = clip.asset_src;
          // 确保是本地文件路径
          if (!videoPath.startsWith('http://') && !videoPath.startsWith('https://')) {
            const dimensions = await getVideoDimensions(videoPath);
            if (dimensions) {
              logger.info(`画布尺寸: 从视频获取: ${dimensions.width}x${dimensions.height}`);
              return dimensions;
            }
          }
        }
      }
    }
  }

  return null;
}

/**
 * 解析资源路径（确保是本地绝对路径）
 * @param {string} src - 资源路径
 * @returns {string|null} 绝对路径
 */
export function resolveAssetPath(src) {
  if (!src) return null;

  // 如果已经是绝对路径，直接返回
  if (path.isAbsolute(src)) {
    return src;
  }

  // 如果是网络 URL，应该已经在服务层下载到本地，不应该到这里
  if (src.startsWith('http://') || src.startsWith('https://')) {
    logger.warn(`检测到网络 URL，应该已在服务层下载: ${src}`);
    return src;
  }

  // 相对路径，转换为绝对路径
  if (src.startsWith('/assets/') || src.startsWith('/')) {
    const relativePath = src.startsWith('/') ? src.slice(1) : src;
    const absolutePath = path.join(PROJECT_ROOT, 'public', relativePath);
    if (fs.existsSync(absolutePath)) {
      return absolutePath;
    }
  }

  return src;
}

/**
 * 获取分辨率配置（兼容原有逻辑）
 * @param {string} resolution - 分辨率标识
 * @param {string} orientation - 视频方向：'landscape'（横屏，默认）或 'portrait'（竖屏）
 * @returns {{width: number, height: number}} 分辨率配置
 */
export function getResolution(resolution, orientation = 'landscape') {
  let width, height;

  switch (resolution) {
    case '4k':
      width = 3840;
      height = 2160;
      break;
    case '1080p':
      width = 1920;
      height = 1080;
      break;
    case '720p':
    default:
      width = 1280;
      height = 720;
      break;
  }

  // 如果是竖屏模式，交换宽高
  if (orientation === 'portrait') {
    return { width: height, height: width };
  }

  return { width, height };
}

/**
 * 计算保持宽高比的缩放尺寸（contain 模式）
 * @param {number} sourceWidth - 源宽度
 * @param {number} sourceHeight - 源高度
 * @param {number} targetWidth - 目标宽度
 * @param {number} targetHeight - 目标高度
 * @returns {{width: number, height: number}} 缩放后的尺寸
 */
export function calculateContainSize(sourceWidth, sourceHeight, targetWidth, targetHeight) {
  const sourceAspect = sourceWidth / sourceHeight;
  const targetAspect = targetWidth / targetHeight;

  let displayWidth, displayHeight;

  if (sourceAspect > targetAspect) {
    // 源视频更宽，以宽度为准
    displayWidth = targetWidth;
    displayHeight = targetWidth / sourceAspect;
  } else {
    // 源视频更高，以高度为准
    displayHeight = targetHeight;
    displayWidth = targetHeight * sourceAspect;
  }

  return {
    width: Math.round(displayWidth),
    height: Math.round(displayHeight)
  };
}

/**
 * 计算保持宽高比并填充满画布的尺寸（cover 模式）
 * cover 模式：视频填充满整个画布，可能会裁剪部分内容
 * @param {number} sourceWidth - 源视频宽度
 * @param {number} sourceHeight - 源视频高度
 * @param {number} targetWidth - 目标画布宽度
 * @param {number} targetHeight - 目标画布高度
 * @returns {{width: number, height: number}} 计算后的显示尺寸
 */
export function calculateCoverSize(sourceWidth, sourceHeight, targetWidth, targetHeight) {
  const sourceAspect = sourceWidth / sourceHeight;
  const targetAspect = targetWidth / targetHeight;

  let displayWidth, displayHeight;

  // cover 模式的核心逻辑：选择缩放比例，使得缩放后的视频至少填充满画布的两个维度
  // 需要计算两个缩放比例：
  // 1. 以宽度为准的缩放：确保宽度填充满
  // 2. 以高度为准的缩放：确保高度填充满
  // 选择较大的缩放比例，这样两个维度都能填充满（至少一个维度正好填充满，另一个可能超出）

  const scaleByWidth = targetWidth / sourceWidth;
  const scaleByHeight = targetHeight / sourceHeight;

  // 选择较大的缩放比例，确保至少一个维度填充满，另一个维度可能超出（会被裁剪）
  const scale = Math.max(scaleByWidth, scaleByHeight);

  displayWidth = sourceWidth * scale;
  displayHeight = sourceHeight * scale;

  // 验证：确保至少一个维度填充满（cover 模式的核心要求）
  const widthFills = displayWidth >= targetWidth;
  const heightFills = displayHeight >= targetHeight;

  if (!widthFills || !heightFills) {
    // 如果任何一个维度没有填充满，说明计算有误，强制填充满
    logger.warn(`[calculateCoverSize] 计算异常: 源${sourceWidth}x${sourceHeight}, 目标${targetWidth}x${targetHeight}, 结果${displayWidth}x${displayHeight}, scale=${scale}`);
    // 使用更大的缩放比例确保填充满
    const scaleX = targetWidth / displayWidth;
    const scaleY = targetHeight / displayHeight;
    const finalScale = Math.max(scaleX, scaleY);
    displayWidth = displayWidth * finalScale;
    displayHeight = displayHeight * finalScale;
    logger.warn(`[calculateCoverSize] 强制缩放: finalScale=${finalScale}, 新尺寸=${displayWidth}x${displayHeight}`);
  }

  const result = {
    width: Math.round(displayWidth),
    height: Math.round(displayHeight)
  };

  // 最终验证
  const finalWidthFills = result.width >= targetWidth;
  const finalHeightFills = result.height >= targetHeight;
  logger.debug(`[calculateCoverSize] 源${sourceWidth}x${sourceHeight} (宽高比:${sourceAspect.toFixed(3)}) -> 目标${targetWidth}x${targetHeight} (宽高比:${targetAspect.toFixed(3)}) -> 结果${result.width}x${result.height} (宽填充:${finalWidthFills}, 高填充:${finalHeightFills}, scale=${scale.toFixed(3)})`);

  return result;
}

/**
 * 使用 FFmpeg 预处理视频，确保视频填充满画布（支持竖屏和横屏）
 * @param {string} inputPath - 输入视频路径
 * @param {number} canvasWidth - 画布宽度
 * @param {number} canvasHeight - 画布高度
 * @param {string} fitMode - 'contain' 或 'cover'
 * @param {string} outputPath - 输出视频路径
 * @returns {Promise<string>} 预处理后的视频路径
 */
export function preprocessVideoForPortrait(inputPath, canvasWidth, canvasHeight, fitMode, outputPath) {
  return new Promise((resolve, reject) => {
    try {
      // 获取 FFmpeg 路径
      const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';

      // 设置 fluent-ffmpeg 的 FFmpeg 路径
      if (ffmpegPath && ffmpegPath !== 'ffmpeg') {
        try {
          ffmpeg.setFfmpegPath(ffmpegPath);
          logger.debug(`[预处理] 设置 FFmpeg 路径: ${ffmpegPath}`);
        } catch (e) {
          logger.warn(`[预处理] 设置 FFmpeg 路径失败: ${e.message}`);
        }
      }

      // 获取视频尺寸和音频流信息
      Promise.all([
        getVideoDimensions(inputPath),
        new Promise((resolveProbe) => {
          // 检查视频是否有音频流
          ffmpeg.ffprobe(inputPath, (err, metadata) => {
            if (err) {
              logger.warn(`[预处理] 无法获取视频元数据: ${err.message}`);
              resolveProbe(false); // 假设没有音频
              return;
            }
            const hasAudio = metadata.streams?.some(stream => stream.codec_type === 'audio');
            resolveProbe(hasAudio);
          });
        })
      ]).then(([videoDimensions, hasAudio]) => {
        if (!videoDimensions) {
          logger.warn(`[预处理] 无法获取视频尺寸，跳过预处理: ${inputPath}`);
          resolve(inputPath); // 返回原路径
          return;
        }

        const sourceWidth = videoDimensions.width;
        const sourceHeight = videoDimensions.height;
        const sourceAspect = sourceWidth / sourceHeight;
        const canvasAspect = canvasWidth / canvasHeight;

        logger.info(`[预处理] 视频音频流检测: ${hasAudio ? '有音频' : '无音频'}`);

        let filterString;

        if (fitMode === 'cover') {
          // cover 模式：根据画布方向采用不同策略
          const isLandscapeCanvas = canvasWidth > canvasHeight;
          const isPortraitSource = sourceHeight > sourceWidth;

          if (isLandscapeCanvas && isPortraitSource) {
            // 横屏画布 + 竖屏视频：高度以视频高度为准，拉伸宽度填充满（关键修复）
            // 先按高度缩放，然后拉伸宽度填充满画布
            const heightScale = canvasHeight / sourceHeight;
            const scaledHeight = Math.round(sourceHeight * heightScale);
            const scaledWidth = Math.round(sourceWidth * heightScale);

            // 如果缩放后的宽度小于画布宽度，需要拉伸宽度填充满
            // 使用 scale 滤镜，不保持宽高比，直接拉伸到画布尺寸
            logger.info(`[预处理] cover模式(横屏画布+竖屏视频): 源${sourceWidth}x${sourceHeight}`);
            logger.info(`[预处理] cover模式: 按高度缩放 - 缩放比例=${heightScale.toFixed(3)}, 缩放后=${scaledWidth}x${scaledHeight}`);
            logger.info(`[预处理] cover模式: 拉伸宽度填充满画布 - 从${scaledWidth}拉伸到${canvasWidth}`);

            // 使用 scale 滤镜，不保持宽高比（force_original_aspect_ratio=disable），直接拉伸到画布尺寸
            // 或者先按高度缩放，然后使用 pad 填充宽度（但这样会有黑边）
            // 用户要求拉伸宽度，所以直接拉伸
            filterString = `scale=${canvasWidth}:${canvasHeight}`;

            logger.info(`[预处理] cover模式: 最终输出尺寸=${canvasWidth}x${canvasHeight}，视频会被拉伸以填充满画布`);
          } else {
            // 其他情况：使用原有的 cover 逻辑（保持宽高比，裁剪超出部分）
            // 关键修复：确保缩放后的尺寸足够大，避免边缘被裁剪
            const scaleRatio = Math.max(canvasWidth / sourceWidth, canvasHeight / sourceHeight);

            // 使用 Math.ceil 确保缩放后的尺寸至少等于画布尺寸（避免舍入导致尺寸不足）
            // 增加足够的余量（1%）确保裁剪时不会因为舍入误差导致边缘被裁剪
            const scaledWidth = Math.ceil(sourceWidth * scaleRatio * 1.01);
            const scaledHeight = Math.ceil(sourceHeight * scaleRatio * 1.01);

            // 确保至少等于画布尺寸，并且有足够的余量用于居中裁剪
            // 关键修复：增加更多余量，确保左右都有足够的空间，避免边缘被裁剪
            const minExtraWidth = Math.max(10, Math.ceil(canvasWidth * 0.01)); // 至少 1% 的余量，最少 10 像素
            const minExtraHeight = Math.max(10, Math.ceil(canvasHeight * 0.01)); // 至少 1% 的余量，最少 10 像素
            const finalScaledWidth = Math.max(scaledWidth, canvasWidth + minExtraWidth * 2); // 左右各留余量
            const finalScaledHeight = Math.max(scaledHeight, canvasHeight + minExtraHeight * 2); // 上下各留余量

            // crop 滤镜格式：crop=width:height:x:y
            // x, y 是裁剪区域的左上角位置（相对于输入视频）
            // 关键修复：使用精确的居中计算，确保左右对称裁剪
            const cropX = Math.round((finalScaledWidth - canvasWidth) / 2);
            const cropY = Math.round((finalScaledHeight - canvasHeight) / 2);

            // 验证裁剪计算
            logger.info(`[预处理] cover模式计算: 源${sourceWidth}x${sourceHeight}, 缩放比例=${scaleRatio.toFixed(3)}, 缩放后=${finalScaledWidth}x${finalScaledHeight}`);
            logger.info(`[预处理] cover模式: 裁剪区域=(${cropX}, ${cropY}), 尺寸=${canvasWidth}x${canvasHeight}`);

            // 关键修复：验证裁剪计算是否正确，确保左右对称
            const expectedCropX = (finalScaledWidth - canvasWidth) / 2;
            const expectedCropY = (finalScaledHeight - canvasHeight) / 2;
            const leftCrop = cropX;
            const rightCrop = finalScaledWidth - cropX - canvasWidth;
            const topCrop = cropY;
            const bottomCrop = finalScaledHeight - cropY - canvasHeight;

            logger.info(`[预处理] cover模式: 验证裁剪计算 - cropX=${cropX} (期望=${expectedCropX.toFixed(1)}), cropY=${cropY} (期望=${expectedCropY.toFixed(1)})`);
            logger.info(`[预处理] cover模式: 裁剪对称性 - 左=${leftCrop}px, 右=${rightCrop}px, 上=${topCrop}px, 下=${bottomCrop}px`);
            logger.info(`[预处理] cover模式: 裁剪区域范围 - x: ${cropX} 到 ${cropX + canvasWidth}, y: ${cropY} 到 ${cropY + canvasHeight}`);
            logger.info(`[预处理] cover模式: 缩放后视频范围 - x: 0 到 ${finalScaledWidth}, y: 0 到 ${finalScaledHeight}`);

            // 验证裁剪区域是否在缩放后视频的范围内
            if (cropX < 0 || cropY < 0) {
              logger.warn(`[预处理] ⚠️ cover模式: 裁剪位置为负数，调整到 0: cropX=${cropX}, cropY=${cropY}`);
              const safeCropX = Math.max(0, cropX);
              const safeCropY = Math.max(0, cropY);
              filterString = `scale=${finalScaledWidth}:${finalScaledHeight},crop=${canvasWidth}:${canvasHeight}:${safeCropX}:${safeCropY}`;
            } else if (cropX + canvasWidth > finalScaledWidth || cropY + canvasHeight > finalScaledHeight) {
              logger.error(`[预处理] ❌ cover模式: 裁剪区域超出缩放后视频范围！`);
              logger.error(`[预处理]   裁剪区域: (${cropX}, ${cropY}) 到 (${cropX + canvasWidth}, ${cropY + canvasHeight})`);
              logger.error(`[预处理]   缩放后视频: (0, 0) 到 (${finalScaledWidth}, ${finalScaledHeight})`);
              // 如果超出，调整裁剪位置到安全范围
              const safeCropX = Math.max(0, Math.min(cropX, finalScaledWidth - canvasWidth));
              const safeCropY = Math.max(0, Math.min(cropY, finalScaledHeight - canvasHeight));
              logger.warn(`[预处理] ⚠️ cover模式: 调整裁剪位置到安全范围: (${safeCropX}, ${safeCropY})`);
              filterString = `scale=${finalScaledWidth}:${finalScaledHeight},crop=${canvasWidth}:${canvasHeight}:${safeCropX}:${safeCropY}`;
            } else {
              // 正常情况：裁剪区域在范围内，确保左右对称
              // 验证左右裁剪是否对称（允许 1 像素误差）
              if (Math.abs(leftCrop - rightCrop) > 1) {
                logger.warn(`[预处理] ⚠️ cover模式: 左右裁剪不对称 (左=${leftCrop}, 右=${rightCrop})，调整以保持对称`);
                // 重新计算，确保对称
                const symmetricCropX = Math.floor((finalScaledWidth - canvasWidth) / 2);
                filterString = `scale=${finalScaledWidth}:${finalScaledHeight},crop=${canvasWidth}:${canvasHeight}:${symmetricCropX}:${cropY}`;
              } else {
                filterString = `scale=${finalScaledWidth}:${finalScaledHeight},crop=${canvasWidth}:${canvasHeight}:${cropX}:${cropY}`;
              }
            }
          }
        } else {
          // contain 模式：缩放视频使其完整显示，然后使用 pad 填充到画布尺寸
          // 关键修复：对于竖屏画布，确保视频内容填充满高度
          const isPortraitCanvas = canvasHeight > canvasWidth;
          const isPortraitSource = sourceHeight > sourceWidth;

          let scaleRatio, scaledWidth, scaledHeight, padX, padY;

          if (isPortraitCanvas && isPortraitSource) {
            // 竖屏画布 + 竖屏视频：优先填充满高度（关键修复）
            // 按高度缩放，确保视频内容填充满画布高度
            scaleRatio = canvasHeight / sourceHeight;
            scaledWidth = Math.round(sourceWidth * scaleRatio);
            scaledHeight = Math.round(sourceHeight * scaleRatio);

            // 如果缩放后的宽度小于画布宽度，使用 pad 填充左右
            // 如果缩放后的宽度大于画布宽度，需要重新计算（按宽度缩放）
            if (scaledWidth > canvasWidth) {
              // 如果按高度缩放后宽度超出，改为按宽度缩放
              scaleRatio = canvasWidth / sourceWidth;
              scaledWidth = Math.round(sourceWidth * scaleRatio);
              scaledHeight = Math.round(sourceHeight * scaleRatio);
              padX = 0;
              padY = Math.round((canvasHeight - scaledHeight) / 2);
            } else {
              // 按高度缩放，宽度未超出，使用 pad 填充左右
              padX = Math.round((canvasWidth - scaledWidth) / 2);
              padY = 0;
            }

            logger.info(`[预处理] contain模式(竖屏画布+竖屏视频): 优先填充满高度`);
            logger.info(`[预处理] contain模式: 缩放比例=${scaleRatio.toFixed(3)}, 缩放后=${scaledWidth}x${scaledHeight}, pad偏移=(${padX}, ${padY})`);
          } else {
            // 其他情况：使用标准 contain 逻辑
            scaleRatio = Math.min(canvasWidth / sourceWidth, canvasHeight / sourceHeight);
            scaledWidth = Math.round(sourceWidth * scaleRatio);
            scaledHeight = Math.round(sourceHeight * scaleRatio);
            padX = Math.round((canvasWidth - scaledWidth) / 2);
            padY = Math.round((canvasHeight - scaledHeight) / 2);
          }

          // 关键修复：确保 pad 后的尺寸正好等于画布尺寸，避免舍入误差
          // 优先保证视频比例准确，只调整 pad 值，不修改 scaledWidth/scaledHeight
          let actualWidth = scaledWidth + 2 * padX;
          let actualHeight = scaledHeight + 2 * padY;

          // 如果宽度不匹配，调整 padX（保持宽高比，不修改 scaledWidth）
          if (actualWidth !== canvasWidth) {
            const diff = canvasWidth - actualWidth;
            // 重新计算 padX，确保精确匹配
            padX = Math.floor((canvasWidth - scaledWidth) / 2);
            actualWidth = scaledWidth + 2 * padX;
            // 如果还有 1 像素误差，FFmpeg 的 pad 会自动处理（通过不对称 pad）
            if (actualWidth !== canvasWidth) {
              logger.info(`[预处理] contain模式: 宽度有 ${canvasWidth - actualWidth} 像素误差，FFmpeg pad 会自动处理`);
            }
          }

          // 如果高度不匹配，调整 padY（保持宽高比，不修改 scaledHeight）
          if (actualHeight !== canvasHeight) {
            const diff = canvasHeight - actualHeight;
            // 重新计算 padY，确保精确匹配
            padY = Math.floor((canvasHeight - scaledHeight) / 2);
            actualHeight = scaledHeight + 2 * padY;
            // 如果还有 1 像素误差，FFmpeg 的 pad 会自动处理（通过不对称 pad）
            if (actualHeight !== canvasHeight) {
              logger.info(`[预处理] contain模式: 高度有 ${canvasHeight - actualHeight} 像素误差，FFmpeg pad 会自动处理`);
            }
          }

          // 最终验证
          const finalWidth = scaledWidth + 2 * padX;
          const finalHeight = scaledHeight + 2 * padY;
          const widthDiff = Math.abs(finalWidth - canvasWidth);
          const heightDiff = Math.abs(finalHeight - canvasHeight);

          // 始终使用 scale + pad 来保持宽高比，不使用强制拉伸
          // 优先保证视频比例准确，FFmpeg 的 pad 滤镜会自动处理小的舍入误差（通过不对称 pad）
          filterString = `scale=${scaledWidth}:${scaledHeight},pad=${canvasWidth}:${canvasHeight}:${padX}:${padY}:black`;

          if (widthDiff > 1 || heightDiff > 1) {
            logger.warn(`[预处理] ⚠️ contain模式: pad 计算可能有较大误差 - 期望 ${canvasWidth}x${canvasHeight}, 实际 ${finalWidth}x${finalHeight}`);
            logger.warn(`[预处理] ⚠️ contain模式: 但会保持视频宽高比，使用 scale + pad`);
          } else if (widthDiff === 1 || heightDiff === 1) {
            logger.info(`[预处理] contain模式: pad 计算有 1 像素误差（可接受），FFmpeg 会自动通过不对称 pad 处理`);
          }

          logger.info(`[预处理] contain模式计算: 源${sourceWidth}x${sourceHeight}, 缩放比例=${scaleRatio.toFixed(3)}, 缩放后=${scaledWidth}x${scaledHeight}, pad偏移=(${padX}, ${padY})`);
          logger.info(`[预处理] contain模式: 输出视频尺寸应该是 ${canvasWidth}x${canvasHeight}，视频内容居中`);
          logger.info(`[预处理] contain模式: 最终验证 - 宽度=${finalWidth} (期望=${canvasWidth}), 高度=${finalHeight} (期望=${canvasHeight})`);
        }

        logger.info(`[预处理] 开始预处理视频: ${inputPath}`);
        logger.info(`[预处理] 源尺寸: ${sourceWidth}x${sourceHeight}, 目标: ${canvasWidth}x${canvasHeight}, fitMode: ${fitMode}`);
        logger.info(`[预处理] FFmpeg 滤镜: ${filterString}`);

        // 构建输出选项
        const outputOptions = [
          '-map 0:v:0',  // 映射视频流
          '-c:v libx264',
          '-preset fast',
          '-crf 23',
          '-pix_fmt yuv420p',
          '-movflags +faststart'
        ];

        // 如果有音频流，映射并复制音频
        if (hasAudio) {
          outputOptions.push('-map 0:a:0');  // 映射音频流（使用标准语法，不使用 ?）
          outputOptions.push('-c:a copy');    // 复制音频，不重新编码
          logger.info(`[预处理] 检测到音频流，将保留音频`);
        } else {
          logger.warn(`[预处理] ⚠️ 未检测到音频流，输出视频将无音频`);
        }

        // 使用 fluent-ffmpeg 处理视频
        // 保留音轨：显式映射视频/音频流，并复制音频，避免预处理后丢失声音
        ffmpeg(inputPath)
          .videoFilters(filterString)
          .outputOptions(outputOptions)
          .output(outputPath)
          .on('start', (commandLine) => {
            logger.debug(`[预处理] FFmpeg 命令: ${commandLine}`);
          })
          .on('progress', (progress) => {
            if (progress.percent) {
              logger.debug(`[预处理] 进度: ${Math.round(progress.percent)}%`);
            }
          })
          .on('end', () => {
            logger.info(`[预处理] ✅ 视频预处理完成: ${outputPath}`);
            resolve(outputPath);
          })
          .on('error', (err) => {
            logger.error(`[预处理] ❌ 视频预处理失败: ${err.message}`);
            // 如果是因为音频映射失败，尝试不映射音频重新处理
            if (hasAudio && err.message.includes('Stream map')) {
              logger.warn(`[预处理] ⚠️ 音频映射失败，尝试不映射音频重新处理`);
              ffmpeg(inputPath)
                .videoFilters(filterString)
                .outputOptions([
                  '-map 0:v:0',
                  '-c:v libx264',
                  '-preset fast',
                  '-crf 23',
                  '-pix_fmt yuv420p',
                  '-movflags +faststart'
                ])
                .output(outputPath)
                .on('end', () => {
                  logger.warn(`[预处理] ⚠️ 视频预处理完成（无音频）: ${outputPath}`);
                  resolve(outputPath);
                })
                .on('error', (err2) => {
                  logger.error(`[预处理] ❌ 重新处理也失败: ${err2.message}`);
                  resolve(inputPath);
                })
                .run();
            } else {
              // 预处理失败，返回原路径
              resolve(inputPath);
            }
          })
          .run();
      }).catch(err => {
        logger.error(`[预处理] ❌ 获取视频信息失败: ${err.message}`);
        resolve(inputPath); // 返回原路径
      });
    } catch (error) {
      logger.error(`[预处理] ❌ 预处理异常: ${error.message}`);
      resolve(inputPath); // 返回原路径
    }
  });
}

/**
 * 确保视频包含正确的元数据（特别是时长信息）
 * 使用 FFmpeg 重新处理视频，确保元数据完整，以便 Base64 转换后播放器能正确显示时长
 * @param {string} inputPath - 输入视频路径
 * @param {string} outputPath - 输出视频路径（可选，如果不提供则覆盖原文件）
 * @returns {Promise<string>} 处理后的视频路径
 */
export function ensureVideoMetadata(inputPath, outputPath = null) {
  return new Promise((resolve, reject) => {
    try {
      // 如果未提供输出路径，使用临时文件
      const finalOutputPath = outputPath || inputPath.replace(/(\.[^.]+)$/, '_metadata$1');
      const shouldDeleteTemp = !outputPath;

      // 获取 FFmpeg 路径
      const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';

      // 设置 fluent-ffmpeg 的 FFmpeg 路径
      if (ffmpegPath && ffmpegPath !== 'ffmpeg') {
        try {
          ffmpeg.setFfmpegPath(ffmpegPath);
          logger.debug(`[元数据修复] 设置 FFmpeg 路径: ${ffmpegPath}`);
        } catch (e) {
          logger.warn(`[元数据修复] 设置 FFmpeg 路径失败: ${e.message}`);
        }
      }

      logger.info(`[元数据修复] 开始处理视频元数据: ${inputPath}`);
      logger.info(`[元数据修复] 输出路径: ${finalOutputPath}`);

      // 使用 fluent-ffmpeg 处理视频
      // 使用 -c copy 复制流（不重新编码，速度快）
      // 使用 -movflags +faststart 将元数据移到文件开头（便于流式播放）
      // 使用 -fflags +genpts 生成时间戳（确保时长信息正确）
      ffmpeg(inputPath)
        .outputOptions([
          '-c copy',           // 复制视频和音频流，不重新编码
          '-movflags +faststart', // 将元数据移到文件开头，便于流式播放和 Base64 播放
          '-fflags +genpts',   // 生成时间戳，确保时长信息正确
          '-avoid_negative_ts make_zero' // 避免负时间戳
        ])
        .output(finalOutputPath)
        .on('start', (commandLine) => {
          logger.debug(`[元数据修复] FFmpeg 命令: ${commandLine}`);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            logger.debug(`[元数据修复] 进度: ${Math.round(progress.percent)}%`);
          }
        })
        .on('end', () => {
          logger.info(`[元数据修复] ✅ 视频元数据处理完成: ${finalOutputPath}`);

          // 如果使用了临时文件，替换原文件
          if (shouldDeleteTemp && finalOutputPath !== inputPath) {
            try {
              // 删除原文件
              if (fs.existsSync(inputPath)) {
                fs.unlinkSync(inputPath);
                logger.debug(`[元数据修复] 已删除原文件: ${inputPath}`);
              }
              // 将临时文件移动到原文件位置
              fs.renameSync(finalOutputPath, inputPath);
              logger.debug(`[元数据修复] 已将处理后的文件移动到: ${inputPath}`);
              resolve(inputPath);
            } catch (err) {
              logger.warn(`[元数据修复] ⚠️ 文件替换失败: ${err.message}，返回处理后的文件路径`);
              resolve(finalOutputPath);
            }
          } else {
            resolve(finalOutputPath);
          }
        })
        .on('error', (err) => {
          logger.error(`[元数据修复] ❌ 视频元数据处理失败: ${err.message}`);
          // 处理失败，返回原路径
          resolve(inputPath);
        })
        .run();
    } catch (error) {
      logger.error(`[元数据修复] ❌ 处理异常: ${error.message}`);
      // 异常情况，返回原路径
      resolve(inputPath);
    }
  });
}

/**
 * 将视频与音频合并为单一视频文件
 * @param {string} videoPath - 原始视频路径
 * @param {string} audioPath - 音频路径
 * @param {string|null} outputPath - 输出路径（可选，不传则在同目录生成 *_merged 文件）
 * @returns {Promise<string>} 合并后的视频路径；合并失败时返回原视频路径
 */
export function mergeVideoWithAudio(videoPath, audioPath, outputPath = null) {
  return new Promise((resolve, reject) => {
    try {
      if (!videoPath || !audioPath) {
        return reject(new Error('[合并音频] 缺少视频或音频路径'));
      }

      if (!fs.existsSync(videoPath)) {
        return reject(new Error(`[合并音频] 视频文件不存在: ${videoPath}`));
      }

      if (!fs.existsSync(audioPath)) {
        return reject(new Error(`[合并音频] 音频文件不存在: ${audioPath}`));
      }

      // 生成默认输出路径
      if (!outputPath) {
        const dir = path.dirname(videoPath);
        const ext = path.extname(videoPath) || '.mp4';
        const base = path.basename(videoPath, ext);
        outputPath = path.join(dir, `${base}_merged${ext}`);
      }

      // 确保目录存在
      const outDir = path.dirname(outputPath);
      if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
      }

      // 设置 FFmpeg 路径
      const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
      if (ffmpegPath && ffmpegPath !== 'ffmpeg') {
        try {
          ffmpeg.setFfmpegPath(ffmpegPath);
          logger.debug(`[合并音频] 设置 FFmpeg 路径: ${ffmpegPath}`);
        } catch (e) {
          logger.warn(`[合并音频] 设置 FFmpeg 路径失败: ${e.message}`);
        }
      }

      logger.info(`[合并音频] 开始合并: 视频=${videoPath}, 音频=${audioPath}, 输出=${outputPath}`);

      // 构建 FFmpeg 命令
      const ffmpegCommand = ffmpeg(videoPath)
        .input(audioPath)
        .outputOptions([
          '-map 0:v:0',        // 映射视频流
          '-map 1:a:0',        // 映射音频流
          '-c:v copy',         // 不重新编码视频
          '-c:a aac',          // 统一音频编码为 AAC
          '-b:a 192k',         // 设置音频比特率，确保音质
          '-shortest',         // 时长取较短，避免黑屏或静音尾巴
          '-af apad'           // 关键：apad 填充音频，确保音频长度匹配视频，避免音频不足截短视频
        ]);

      ffmpegCommand
        .on('start', (commandLine) => {
          logger.debug(`[合并音频] FFmpeg 命令: ${commandLine}`);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            logger.debug(`[合并音频] 进度: ${Math.round(progress.percent)}%`);
          }
        })
        .on('end', () => {
          logger.info(`[合并音频] ✅ 合并完成: ${outputPath}`);
          resolve(outputPath);
        })
        .on('error', (err) => {
          logger.error(`[合并音频] ❌ 合并失败: ${err.message}`);
          reject(new Error(`[合并音频] 合并失败: ${err.message}`));
        })
        .save(outputPath);
    } catch (error) {
      logger.error(`[合并音频] ❌ 合并异常: ${error.message}`);
      reject(error);
    }
  });
}

