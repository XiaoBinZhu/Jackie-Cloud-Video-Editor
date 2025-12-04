/**
 * 片段处理逻辑
 * 处理视频、图片、文字等不同类型的片段
 */
import { FFVideo, FFImage, FFText } from 'ffcreatorlite';
import { resolveAssetPath, getVideoDimensions, calculateContainSize, calculateCoverSize, preprocessVideoForPortrait } from './videoUtils.js';
import { logger } from '../utils/logger.js';
import path from 'path';
import fs from 'fs';

/**
 * 处理视频片段
 * 根据 FFCreatorLite 文档重新实现，确保竖屏视频正确填充
 * @param {Object} clip - 视频片段对象
 * @param {number} canvasWidth - 画布宽度
 * @param {number} canvasHeight - 画布高度
 * @param {number} segmentStart - 片段开始时间
 * @param {number} segmentDuration - 片段持续时间
 * @param {boolean} useVideoSize - 是否使用视频尺寸作为画布
 * @returns {Promise<FFVideo|null>} FFVideo 实例
 */
export async function processVideoClip(clip, canvasWidth, canvasHeight, segmentStart, segmentDuration, useVideoSize = false) {
  let absolutePath = resolveAssetPath(clip.asset_src);
  if (!absolutePath) {
    logger.warn(`视频片段路径无效: ${clip.name}`);
    return null;
  }

  // 计算视频在素材中的偏移位置
  const assetOffset = Math.max(0, (clip.asset_offset || 0) + (segmentStart - clip.startTime));

  // 判断画布方向
  const isPortraitCanvas = canvasHeight > canvasWidth;
  const isLandscapeCanvas = canvasWidth > canvasHeight;
  const fitMode = clip.fitMode || 'contain';

  // 对于所有画布（竖屏和横屏），预处理视频以确保正确填充（关键修复）
  // 使用 FFmpeg 的 scale 和 pad/crop 滤镜预处理视频，确保视频尺寸正好等于画布尺寸
  if (!absolutePath.startsWith('http://') && !absolutePath.startsWith('https://')) {
    try {
      // 创建预处理后的视频路径
      const videoDir = path.dirname(absolutePath);
      const videoName = path.basename(absolutePath, path.extname(absolutePath));
      const canvasOrientation = isPortraitCanvas ? 'portrait' : isLandscapeCanvas ? 'landscape' : 'square';
      const preprocessedPath = path.join(videoDir, `${videoName}_preprocessed_${fitMode}_${canvasWidth}x${canvasHeight}_${canvasOrientation}${path.extname(absolutePath)}`);

      // 检查是否已经预处理过
      if (!fs.existsSync(preprocessedPath)) {
        logger.info(`[视频处理] 🔄 开始预处理视频以确保正确填充画布`);
        logger.info(`[视频处理]   输入: ${absolutePath}`);
        logger.info(`[视频处理]   输出: ${preprocessedPath}`);
        logger.info(`[视频处理]   画布: ${canvasWidth}x${canvasHeight} (${canvasOrientation}), fitMode: ${fitMode}`);
        absolutePath = await preprocessVideoForPortrait(absolutePath, canvasWidth, canvasHeight, fitMode, preprocessedPath);
        logger.info(`[视频处理] ✅ 预处理完成，使用视频: ${absolutePath}`);
      } else {
        logger.info(`[视频处理] ✅ 使用已预处理的视频: ${preprocessedPath}`);
        absolutePath = preprocessedPath;
      }
    } catch (error) {
      logger.warn(`[视频处理] ⚠️ 预处理失败，使用原视频: ${error.message}`);
    }
  }

  // 获取视频的变换参数
  const transformX = clip.filters?.transform?.x ?? 50;
  const transformY = clip.filters?.transform?.y ?? 50;
  const scale = clip.filters?.transform?.scale ?? 1;

  // 获取视频原始尺寸（使用预处理后的视频路径）
  const videoDimensions = await getVideoDimensions(absolutePath);

  // 初始化视频尺寸和位置
  let videoWidth = canvasWidth;
  let videoHeight = canvasHeight;
  let videoX = 0;
  let videoY = 0;

  if (videoDimensions) {
    const sourceAspect = videoDimensions.width / videoDimensions.height;
    const canvasAspect = canvasWidth / canvasHeight;
    const sourceIsPortrait = videoDimensions.height > videoDimensions.width;

    logger.info(`[视频处理] 原始视频: ${videoDimensions.width}x${videoDimensions.height} (宽高比: ${sourceAspect.toFixed(3)}, ${sourceIsPortrait ? '竖屏' : '横屏'})`);
    logger.info(`[视频处理] 画布尺寸: ${canvasWidth}x${canvasHeight} (宽高比: ${canvasAspect.toFixed(3)}, ${isPortraitCanvas ? '竖屏' : isLandscapeCanvas ? '横屏' : '方形'})`);
    logger.info(`[视频处理] fitMode: ${fitMode}`);

    // 如果视频尺寸和画布尺寸不一致，需要缩放以适应画布
    if (videoDimensions.width !== canvasWidth || videoDimensions.height !== canvasHeight) {
      // 计算保持宽高比的缩放
      const sizeCalculator = fitMode === 'cover' ? calculateCoverSize : calculateContainSize;
      const fittedSize = sizeCalculator(
        videoDimensions.width,
        videoDimensions.height,
        canvasWidth,
        canvasHeight
      );

      videoWidth = Math.round(fittedSize.width * scale);
      videoHeight = Math.round(fittedSize.height * scale);

      logger.info(`[视频处理] 缩放后尺寸(${fitMode}): ${videoWidth}x${videoHeight}`);

      // 计算位置 - 针对所有画布方向重写
      // 关键：如果视频已经预处理过，视频尺寸应该已经等于画布尺寸
      // 预处理会使用 FFmpeg 的 scale 和 pad/crop 滤镜确保视频正确填充画布

      // 检查视频是否已经预处理（预处理后的视频尺寸应该等于画布尺寸）
      const isPreprocessed = absolutePath.includes('_preprocessed_');

      if (isPreprocessed || (videoWidth === canvasWidth && videoHeight === canvasHeight)) {
        // 视频已经预处理或尺寸正好等于画布，直接使用
        // 预处理后的视频已经正确填充画布，直接使用画布尺寸
        videoWidth = canvasWidth;
        videoHeight = canvasHeight;
        videoX = 0;
        videoY = 0;
        logger.info(`[视频处理] 视频已预处理或尺寸匹配，使用画布尺寸: ${videoWidth}x${videoHeight}`);
      } else {
        // 视频未预处理，需要调整尺寸
        // 对于未预处理的视频，直接设置为画布尺寸，让 FFCreatorLite 处理
        // 但这样可能无法正确填充，所以应该尽量使用预处理
        if (fitMode === 'cover') {
          // cover 模式：视频尺寸必须正好等于画布尺寸
          videoWidth = canvasWidth;
          videoHeight = canvasHeight;
          videoX = 0;
          videoY = 0;
          logger.info(`[视频处理] cover模式: 设置尺寸为画布尺寸 ${canvasWidth}x${canvasHeight}`);
        } else {
          // contain 模式：视频尺寸等于画布尺寸（预处理会处理填充）
          videoWidth = canvasWidth;
          videoHeight = canvasHeight;
          videoX = 0;
          videoY = 0;
          logger.info(`[视频处理] contain模式: 设置尺寸为画布尺寸 ${canvasWidth}x${canvasHeight}`);
        }
      }

      // 计算填充率
      const widthFillRate = ((videoWidth / canvasWidth) * 100).toFixed(1);
      const heightFillRate = ((videoHeight / canvasHeight) * 100).toFixed(1);
      logger.info(`[视频处理] 最终尺寸: ${videoWidth}x${videoHeight}, 位置: (${videoX}, ${videoY}), 填充率: 宽度${widthFillRate}%, 高度${heightFillRate}%`);
    } else {
      // 视频尺寸和画布尺寸一致
      logger.info(`[视频处理] 视频尺寸与画布一致: ${videoDimensions.width}x${videoDimensions.height}`);
      if (useVideoSize && scale === 1) {
        // 如果使用视频尺寸作为画布，且缩放为1，直接铺满
        videoWidth = canvasWidth;
        videoHeight = canvasHeight;
        videoX = 0;
        videoY = 0;
      } else {
        // 需要缩放或移动
        videoWidth = Math.round(canvasWidth * scale);
        videoHeight = Math.round(canvasHeight * scale);

        // 计算位置
        if (transformX === 50 && transformY === 50) {
          videoX = Math.round((canvasWidth - videoWidth) / 2);
          videoY = Math.round((canvasHeight - videoHeight) / 2);
        } else {
          const targetCenterX = (transformX / 100) * canvasWidth;
          const targetCenterY = (transformY / 100) * canvasHeight;
          videoX = Math.round(targetCenterX - videoWidth / 2);
          videoY = Math.round(targetCenterY - videoHeight / 2);
        }

        videoX = Math.max(0, videoX);
        videoY = Math.max(0, videoY);
      }
    }
  } else {
    // 无法获取视频尺寸，使用画布尺寸
    videoWidth = canvasWidth;
    videoHeight = canvasHeight;
    logger.warn(`[视频处理] ⚠️ 无法获取视频尺寸，使用画布尺寸: ${clip.name}`);
  }

  // 最终验证和详细日志
  const finalWidthFill = videoWidth >= canvasWidth;
  const finalHeightFill = videoHeight >= canvasHeight;
  const widthFillPercent = ((Math.min(videoWidth, canvasWidth) / canvasWidth) * 100).toFixed(1);
  const heightFillPercent = ((Math.min(videoHeight, canvasHeight) / canvasHeight) * 100).toFixed(1);
  const widthOverflow = videoWidth > canvasWidth ? (videoWidth - canvasWidth) : 0;
  const heightOverflow = videoHeight > canvasHeight ? (videoHeight - canvasHeight) : 0;

  logger.info(`[视频处理] ========== 最终结果 ==========`);
  logger.info(`[视频处理] 片段名称: ${clip.name}`);
  logger.info(`[视频处理] 原始视频尺寸: ${videoDimensions ? `${videoDimensions.width}x${videoDimensions.height}` : '未知'}`);
  logger.info(`[视频处理] 画布尺寸: ${canvasWidth}x${canvasHeight}`);
  logger.info(`[视频处理] 计算后视频尺寸: ${videoWidth}x${videoHeight}`);
  logger.info(`[视频处理] 视频位置: (${videoX}, ${videoY})`);
  logger.info(`[视频处理] fitMode: ${fitMode}`);
  logger.info(`[视频处理] 填充状态:`);
  logger.info(`  - 宽度: ${finalWidthFill ? '✓ 已填充' : '✗ 未填充'} (${widthFillPercent}%)${widthOverflow > 0 ? ` [超出 ${widthOverflow}px]` : ''}`);
  logger.info(`  - 高度: ${finalHeightFill ? '✓ 已填充' : '✗ 未填充'} (${heightFillPercent}%)${heightOverflow > 0 ? ` [超出 ${heightOverflow}px]` : ''}`);

  if (fitMode === 'cover') {
    if (finalWidthFill && finalHeightFill) {
      logger.info(`[视频处理] ✅ cover 模式: 视频已完全填充画布，超出部分将被裁剪`);
    } else {
      logger.error(`[视频处理] ❌ cover 模式错误: 视频未能完全填充画布！`);
      logger.error(`[视频处理]   宽度填充: ${finalWidthFill ? '是' : '否'} (${widthFillPercent}%)`);
      logger.error(`[视频处理]   高度填充: ${finalHeightFill ? '是' : '否'} (${heightFillPercent}%)`);
    }
  } else {
    logger.info(`[视频处理] contain 模式: 视频完整显示，可能有黑边`);
  }
  logger.info(`[视频处理] ============================`);

  // 创建 FFVideo 实例（根据 FFCreatorLite 文档重新实现）
  // 关键修复：根据 FFCreatorLite 文档，FFVideo 的 width 和 height 用于设置视频的显示尺寸
  // 对于竖屏视频，我们必须确保视频尺寸正好等于画布尺寸，这样视频才能填充满画布

  // 重要：视频尺寸必须正好等于画布尺寸
  // 这样 FFCreatorLite 才能正确显示，不会出现未填充的问题
  const finalVideoWidth = canvasWidth;
  const finalVideoHeight = canvasHeight;
  const finalVideoX = 0;
  const finalVideoY = 0;

  logger.info(`[视频处理] 最终设置: 视频尺寸=${finalVideoWidth}x${finalVideoHeight} (等于画布), 位置=(${finalVideoX}, ${finalVideoY})`);

  // 创建 FFVideo 实例，不设置 width 和 height，只设置位置
  // 然后使用 setWH 来设置尺寸
  const video = new FFVideo({
    path: absolutePath,
    x: finalVideoX,
    y: finalVideoY,
    ss: assetOffset,
  });

  // 使用 setWH 方法设置尺寸（这是 FFCreatorLite 推荐的方式）
  // 关键：视频尺寸必须正好等于画布尺寸
  try {
    video.setWH(finalVideoWidth, finalVideoHeight);
    logger.info(`[视频处理] ✅ 使用 setWH 设置尺寸: ${finalVideoWidth}x${finalVideoHeight}`);
  } catch (e) {
    logger.error(`[视频处理] ❌ setWH 失败: ${e.message}`);
    // 如果 setWH 失败，尝试在构造函数中设置
    try {
      const videoWithSize = new FFVideo({
        path: absolutePath,
        x: finalVideoX,
        y: finalVideoY,
        width: finalVideoWidth,
        height: finalVideoHeight,
        ss: assetOffset,
      });
      videoWithSize.setDuration(segmentDuration);
      logger.warn(`[视频处理] ⚠️ 使用构造函数参数设置尺寸: ${finalVideoWidth}x${finalVideoHeight}`);
      return videoWithSize;
    } catch (e2) {
      logger.error(`[视频处理] ❌ 构造函数参数也失败: ${e2.message}`);
    }
  }

  video.setDuration(segmentDuration);

  logger.info(`[视频处理] ✅ FFVideo 创建完成: 尺寸=${finalVideoWidth}x${finalVideoHeight}, 位置=(${finalVideoX}, ${finalVideoY}), fitMode=${fitMode}`);

  return video;
}

/**
 * 处理图片片段
 * @param {Object} clip - 图片片段对象
 * @param {number} canvasWidth - 画布宽度
 * @param {number} canvasHeight - 画布高度
 * @param {number} segmentDuration - 片段持续时间
 * @returns {FFImage|null} FFImage 实例
 */
export function processImageClip(clip, canvasWidth, canvasHeight, segmentDuration) {
  const absolutePath = resolveAssetPath(clip.asset_src);
  if (!absolutePath) {
    logger.warn(`图片片段路径无效: ${clip.name}`);
    return null;
  }

  const scale = clip.filters?.transform?.scale || 1;
  const transformX = clip.filters?.transform?.x ?? 50;
  const transformY = clip.filters?.transform?.y ?? 50;

  let x, y, imgWidth, imgHeight;

  if (scale === 1) {
    // 铺满画布
    x = 0;
    y = 0;
    imgWidth = canvasWidth;
    imgHeight = canvasHeight;
  } else {
    imgWidth = Math.round(canvasWidth * scale);
    imgHeight = Math.round(canvasHeight * scale);

    if (transformX === 50 && transformY === 50) {
      x = Math.round((canvasWidth - imgWidth) / 2);
      y = Math.round((canvasHeight - imgHeight) / 2);
    } else {
      const targetCenterX = (transformX / 100) * canvasWidth;
      const targetCenterY = (transformY / 100) * canvasHeight;
      x = Math.round(targetCenterX - imgWidth / 2);
      y = Math.round(targetCenterY - imgHeight / 2);
    }
  }

  logger.debug(`图片片段: ${clip.name}: pos(${x}, ${y}), size(${imgWidth}x${imgHeight})`);

  const image = new FFImage({
    path: absolutePath,
    x,
    y,
  });

  if (scale === 1) {
    image.setWH(canvasWidth, canvasHeight);
  } else {
    image.setWH(imgWidth, imgHeight);
  }

  image.setDuration(segmentDuration);
  return image;
}

/**
 * 处理文字片段
 * @param {Object} clip - 文字片段对象
 * @param {number} canvasWidth - 画布宽度
 * @param {number} canvasHeight - 画布高度
 * @param {number} segmentDuration - 片段持续时间
 * @returns {FFText} FFText 实例
 */
export function processTextClip(clip, canvasWidth, canvasHeight, segmentDuration) {
  const textContent = clip.name || clip.asset_src || 'Text';

  // 获取字幕样式
  const subtitleStyle = clip.subtitle_style || {};
  const fontColor = subtitleStyle.fontColor || '#ffffff';
  const strokeColor = subtitleStyle.strokeColor || '#000000';
  const strokeWidth = subtitleStyle.strokeWidth || 3;
  const fontSize = subtitleStyle.fontSize || 48;
  const fontWeight = subtitleStyle.fontWeight || 'normal';

  // 获取字幕位置参数
  const transformX = clip.filters?.transform?.x ?? null;
  const transformY = clip.filters?.transform?.y ?? null;

  // 估算文本尺寸
  const estimatedTextHeight = fontSize + strokeWidth * 2 + 10;
  const estimatedTextWidth = textContent.length * fontSize * 0.6;

  // 计算字幕位置
  // 所有位置计算都基于画布尺寸（canvasWidth/canvasHeight），确保文本位置固定相对于画布
  // 关键：无论视频是否填充满画布，文本都应该基于画布坐标定位
  let x, y;

  // 水平位置
  if (transformX === null || transformX === undefined || transformX === 50) {
    // 默认：画布宽度居中
    x = Math.round((canvasWidth - estimatedTextWidth) / 2);
  } else {
    // 使用传入的位置值（基于画布宽度）
    x = Math.round((transformX / 100) * canvasWidth);
  }

  // 垂直位置
  if (transformY === null || transformY === undefined) {
    // 默认：画布底部中间（底部往上一定距离，确保文本在画布底部中间区域）
    // 使用画布高度的底部位置，而不是视频内容的底部
    const bottomMargin = 50; // 底部边距（像素）
    y = Math.round(canvasHeight - bottomMargin - estimatedTextHeight);
    // 确保 y 值不会为负数
    y = Math.max(0, y);
  } else if (transformY === 50) {
    // 画布垂直居中
    y = Math.round((canvasHeight - estimatedTextHeight) / 2);
  } else if (transformY >= 90) {
    // 底部对齐（基于画布高度）
    const targetBottomY = (transformY / 100) * canvasHeight;
    y = Math.round(targetBottomY - estimatedTextHeight);
    y = Math.max(0, y);
  } else {
    // 使用传入的位置值（基于画布高度）
    y = Math.round((transformY / 100) * canvasHeight);
  }

  // 关键修复：确保文本坐标绝对相对于画布，而不是视频内容
  // 在 contain 模式下，视频内容可能只占画布的一部分（有黑边）
  // 文本必须使用绝对画布坐标，而不是相对于视频内容的坐标
  const text = new FFText({
    text: textContent,
    fontSize,
    color: fontColor,
  });

  // 设置位置，确保位置是基于画布的绝对坐标
  try {
    text.setXY(x, y);
    if (typeof text.setAnchor === 'function') {
      text.setAnchor(0, 0);
    }
    if (typeof text.setPivot === 'function') {
      text.setPivot(0, 0);
    }
  } catch (e) {
    logger.warn(`设置文字位置失败: ${e.message}`);
  }

  try {
    text.setStyle({
      fill: fontColor,
      fontSize,
      fontFamily: 'Arial, Helvetica, sans-serif',
      fontWeight: fontWeight === 'bold' ? 'bold' : 'normal',
      stroke: strokeColor,
      strokeThickness: strokeWidth,
    });
  } catch (e) {
    logger.warn(`设置文字样式失败: ${e.message}`);
  }

  // 添加文本动画效果（如果配置了）
  if (clip.effects) {
    try {
      const effects = Array.isArray(clip.effects) ? clip.effects : [clip.effects];

      effects.forEach(effect => {
        if (typeof effect === 'string') {
          text.addEffect(effect, 0.5, 0);
        } else if (effect && effect.type) {
          const effectType = effect.type;
          const effectDuration = effect.duration || 0.5;
          const effectDelay = effect.delay || 0;
          text.addEffect(effectType, effectDuration, effectDelay);
          logger.debug(`添加文字动画: ${effectType}, 时长: ${effectDuration}s, 延迟: ${effectDelay}s`);
        }
      });
    } catch (e) {
      logger.warn(`添加文字动画失败: ${e.message}`);
    }
  } else {
    // 默认添加淡入效果
    try {
      text.addEffect('fadeIn', 0.3, 0);
    } catch (e) {
      // 忽略默认动画错误
    }
  }

  text.setDuration(segmentDuration);
  return text;
}

