/**
 * 片段处理逻辑
 * 处理视频、图片、文字等不同类型的片段
 */
import { FFVideo, FFImage, FFText } from 'ffcreatorlite';
import { resolveAssetPath, getVideoDimensions, calculateContainSize, calculateCoverSize, preprocessVideoForPortrait } from './videoUtils.js';
import { logger } from '../utils/logger.js';
import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';

// ==================== 字体注册核心逻辑（优先使用项目内置 TTF） ====================
// 注册的字体家族名（唯一，避免冲突）
const REGISTERED_FONT_FAMILY = 'RegisteredN';

// 内置字体路径（优先使用 server/assets/NotoSansSC-Regular.ttf）
const BUNDLED_FONT_CANDIDATES = [
  path.resolve(process.cwd(), 'server', 'assets', 'NotoSansSC-Regular.ttf'),
  path.resolve(process.cwd(), 'assets', 'NotoSansSC-Regular.ttf'),
];

// 系统常见中文字体路径（兜底）
const SYSTEM_FONT_CANDIDATES = [
  // CentOS / RHEL 常见路径
  '/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/noto-cjk/NotoSansSC-Regular.otf',
  '/usr/share/fonts/wqy-zenhei/wqy-zenhei.ttc',
  // Debian/Ubuntu 常见路径
  '/usr/share/fonts/google-noto-cjk/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/google-noto-cjk/NotoSansCJK-Medium.ttc',
  '/usr/share/fonts/google-noto-cjk/NotoSansCJK-Light.ttc',
  '/usr/share/fonts/google-noto-cjk/NotoSansCJK-Bold.ttc',
  '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/opentype/noto/NotoSansSC-Regular.otf',
];

// 最终使用的字体回退链（优先 RegisteredN -> Noto Sans SC）
const FONT_FAMILY_FALLBACK = [
  REGISTERED_FONT_FAMILY,
  'Noto Sans SC',
  'Noto Sans CJK SC',
  'Source Han Sans SC',
  'WenQuanYi Micro Hei',
  'Microsoft YaHei',
  'Arial Unicode MS',
  'Arial',
  'sans-serif',
].join(', ');

let registeredFontFamily = null;

// 动态加载 canvas（ESM 兼容）
const loadCanvasRegisterFont = () => {
  const localRequire = typeof require === 'function' ? require : createRequire(import.meta.url);
  try {
    const canvas = localRequire('canvas');
    return typeof canvas.registerFont === 'function' ? canvas.registerFont : null;
  } catch (e) {
    logger.warn(`[字体] 加载 canvas 失败: ${e.message}`);
    return null;
  }
};

// 主字体注册函数（优先内置 TTF -> 环境变量 -> 系统 -> 回退）
const registerChineseFont = () => {
  const registerFont = loadCanvasRegisterFont();
  if (!registerFont) {
    logger.warn('[字体] canvas 未安装或无 registerFont 方法，使用系统回退');
    registeredFontFamily = REGISTERED_FONT_FAMILY;
    return false;
  }

  // 1. 优先注册项目内置 Noto Sans SC TTF 字体
  const bundled = BUNDLED_FONT_CANDIDATES.find((file) => fs.existsSync(file));
  if (bundled) {
    try {
      registerFont(bundled, { family: REGISTERED_FONT_FAMILY });
      registeredFontFamily = REGISTERED_FONT_FAMILY;
      logger.info(`[字体] ✅ 成功注册内置 Noto Sans SC 字体: ${bundled}`);
      return true;
    } catch (e) {
      logger.warn(`[字体] 注册内置字体失败: ${e.message}`);
    }
  } else {
    logger.warn(`[字体] ⚠️ 未找到内置字体: ${BUNDLED_FONT_CANDIDATES.join(' | ')}`);
  }

  // 2. 环境变量指定的字体文件（可覆盖）
  const envFontFile = process.env.FONT_FILE;
  if (envFontFile && fs.existsSync(envFontFile)) {
    try {
      registerFont(envFontFile, { family: REGISTERED_FONT_FAMILY });
      registeredFontFamily = REGISTERED_FONT_FAMILY;
      logger.info(`[字体] ✅ 成功注册环境变量指定字体: ${envFontFile}`);
      return true;
    } catch (e) {
      logger.warn(`[字体] 注册环境变量字体失败: ${e.message}`);
    }
  }

  // 3. 尝试注册系统字体
  const found = SYSTEM_FONT_CANDIDATES.find((file) => fs.existsSync(file));
  if (found) {
    try {
      registerFont(found, { family: REGISTERED_FONT_FAMILY });
      registeredFontFamily = REGISTERED_FONT_FAMILY;
      logger.info(`[字体] ✅ 成功注册系统中文字体: ${found}`);
      return true;
    } catch (e) {
      logger.warn(`[字体] 注册系统中文字体失败: ${e.message}`);
    }
  } else {
    logger.info('[字体] 未找到任何系统中文字体文件');
  }

  // 4. 最终回退
  logger.info(`[字体] 使用字体回退链: ${FONT_FAMILY_FALLBACK}`);
  registeredFontFamily = REGISTERED_FONT_FAMILY;
  return false;
};

// 启动时注册一次
registerChineseFont();

// 导出字体家族字符串（供 FFText 使用）
export const getFontFamily = () => FONT_FAMILY_FALLBACK;

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
  const alreadyPreprocessed = absolutePath.includes('_preprocessed_');
  if (!absolutePath.startsWith('http://') && !absolutePath.startsWith('https://') && !alreadyPreprocessed) {
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
  } else if (alreadyPreprocessed) {
    logger.info(`[视频处理] 已是预处理视频，直接使用: ${absolutePath}`);
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
    audio: true, // 显式启用音轨，确保渲染阶段保留片段音频
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
        audio: true, // 备用构造同样启用音轨
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
 * @param {Object|null} videoContentArea - 视频内容区域 {x, y, width, height}，用于 contain 模式下的字幕定位
 * @returns {FFText} FFText 实例
 */
export function processTextClip(clip, canvasWidth, canvasHeight, segmentDuration, videoContentArea = null) {
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

  // 计算行高（用于多行文本高度计算）
  const lineHeight = fontSize * 1.2;

  // 关键修复：在 contain 模式下，如果有 videoContentArea，使用视频内容区域的宽度
  // 否则使用画布宽度
  const contentWidth = videoContentArea ? videoContentArea.width : canvasWidth;
  const contentHeight = videoContentArea ? videoContentArea.height : canvasHeight;
  const contentX = videoContentArea ? videoContentArea.x : 0;
  const contentY = videoContentArea ? videoContentArea.y : 0;

  // 设置文字换行宽度（左右各留20px边距）
  const wordWrapWidth = Math.max(20, contentWidth - 40);
  const wordWrapMargin = 20;

  // 估算字符宽度（ASCII 取 0.55 倍字号，中文/全角取 1 倍字号）
  const estimateCharWidth = (char) => (/[\u0000-\u00ff]/.test(char) ? fontSize * 0.55 : fontSize);

  // 将文本按宽度预先换行，保证中文无空格也能换行
  const wrapTextToWidth = (inputText, maxWidth) => {
    if (!inputText) {
      return { text: '', lines: [''], maxLineWidth: 0 };
    }

    // 预留描边厚度，避免宽度被描边撑满后不换行
    const safeWidth = Math.max(10, maxWidth - strokeWidth * 2);
    const lines = [];
    let current = '';
    let currentWidth = 0;

    const pushLine = () => {
      if (current.length === 0) return;
      lines.push(current);
      current = '';
      currentWidth = 0;
    };

    for (const ch of inputText) {
      const chWidth = estimateCharWidth(ch);
      if (currentWidth + chWidth > safeWidth && current.length > 0) {
        pushLine();
      }
      current += ch;
      currentWidth += chWidth;
    }
    pushLine();

    // 计算各行的最大宽度（包含描边）
    const maxLineWidth = lines.length
      ? Math.min(
        maxWidth,
        Math.max(
          ...lines.map((line) => {
            let width = 0;
            for (const ch of line) {
              width += estimateCharWidth(ch);
            }
            return width + strokeWidth * 2;
          }),
        ),
      )
      : 0;

    return { text: lines.join('\n'), lines, maxLineWidth };
  };

  const { text: wrappedText, lines: wrappedLines, maxLineWidth } = wrapTextToWidth(textContent, wordWrapWidth);

  // 关键修复：先创建 FFText 对象并设置样式，然后获取实际尺寸
  const text = new FFText({
    text: wrappedText,
    fontSize,
    color: fontColor,
  });

  // 设置样式（必须在获取尺寸之前设置）
  // 提供可覆盖的中文字体回退，避免在缺字场景渲染成方块
  // 优先使用注册的中文字体，支持环境变量覆盖
  const fontFamily = registeredFontFamily || getFontFamily();

  try {
    text.setStyle({
      fill: fontColor,
      fontSize,
      fontFamily,
      fontWeight: fontWeight === 'bold' ? 'bold' : 'normal',
      stroke: strokeColor,
      strokeThickness: strokeWidth,
      wordWrap: true,
      wordWrapWidth: wordWrapWidth,
      align: 'center',
      breakWords: true,  // 添加：强制允许在字符内部换行，确保中文文本能够换行
      lineHeight: lineHeight,
    });

    // 尝试使用单独的方法设置换行宽度（如果方法存在）
    if (typeof text.setWordWrapWidth === 'function') {
      try {
        text.setWordWrapWidth(wordWrapWidth);
        logger.debug(`[文字处理] 使用 setWordWrapWidth 方法设置换行宽度: ${wordWrapWidth}`);
      } catch (e) {
        logger.debug(`[文字处理] setWordWrapWidth 方法不存在或失败: ${e.message}`);
      }
    }

    logger.debug(`[文字处理] 设置换行: wordWrap=true, wordWrapWidth=${wordWrapWidth}, breakWords=true, 内容宽度=${contentWidth}`);
  } catch (e) {
    logger.warn(`设置文字样式失败: ${e.message}`);
    // 如果设置失败，尝试不设置 wordWrap 相关属性
    try {
      text.setStyle({
        fill: fontColor,
        fontSize,
        fontFamily,
        fontWeight: fontWeight === 'bold' ? 'bold' : 'normal',
        stroke: strokeColor,
        strokeThickness: strokeWidth,
      });
      logger.warn(`[文字处理] 已设置基础文字样式，但换行设置失败`);
    } catch (e2) {
      logger.warn(`设置基础文字样式也失败: ${e2.message}`);
    }
  }

  // 获取文本实际尺寸（考虑换行后的多行高度）
  let singleLineWidth = maxLineWidth || wordWrapWidth;
  let actualDisplayWidth = Math.min(singleLineWidth, wordWrapWidth);
  let actualTextHeight = (wrappedLines.length || 1) * lineHeight + strokeWidth * 2;
  try {
    // 关键修复：优先使用引擎的宽高测量，结合预包行结果
    if (typeof text.getTextWidth === 'function') {
      singleLineWidth = text.getTextWidth() + 2 * strokeWidth;
      actualDisplayWidth = Math.min(singleLineWidth, wordWrapWidth);
    }

    if (typeof text.getTextHeight === 'function') {
      // 取引擎测量值与预估值的较大者，避免被行高截断
      actualTextHeight = Math.max(actualTextHeight, text.getTextHeight());
    }

    logger.debug(`[文字处理] 单行宽度(含描边): ${singleLineWidth}, 换行宽度: ${wordWrapWidth}, 实际显示宽度: ${actualDisplayWidth}, 行数: ${wrappedLines.length}`);
  } catch (e) {
    logger.warn(`获取文本尺寸失败: ${e.message}，使用估算值`);
    // 如果获取失败，使用估算值，也要加上描边宽度
    singleLineWidth = maxLineWidth || textContent.length * fontSize * 0.6 + 2 * strokeWidth;
    actualDisplayWidth = Math.min(singleLineWidth, wordWrapWidth);
    const estimatedLines = wrappedLines.length || Math.ceil(singleLineWidth / wordWrapWidth);
    const maxLines = Math.max(estimatedLines, 2);
    actualTextHeight = Math.max(actualTextHeight, maxLines * lineHeight + strokeWidth * 2);
  }

  // 预留2行文字的高度（用于底部位置计算）
  const reservedHeight = lineHeight * 2;
  const finalTextHeight = Math.max(actualTextHeight, reservedHeight);

  // 计算字幕位置
  // 关键修复：如果有 videoContentArea（contain 模式），基于视频内容区域定位
  // 否则基于画布尺寸定位
  let x, y;

  // 水平位置
  if (transformX === null || transformX === undefined || transformX === 50) {
    // 默认：内容区域宽度居中（基于实际显示宽度）
    // 如果有 videoContentArea，基于视频内容区域居中；否则基于画布居中
    x = Math.round((contentWidth - actualDisplayWidth) / 2);
    // 加上内容区域的 x 偏移（如果是视频内容区域）
    x = x + contentX;

    // 边界限制：如果有 videoContentArea，基于视频内容区域；否则基于画布
    if (videoContentArea) {
      // 基于视频内容区域的边界
      const minX = contentX + wordWrapMargin;
      const maxX = contentX + contentWidth - actualDisplayWidth - wordWrapMargin;
      x = Math.max(minX, Math.min(x, maxX));
    } else {
      // 基于画布边界
      x = Math.max(wordWrapMargin, Math.min(x, canvasWidth - actualDisplayWidth - wordWrapMargin));
    }
    logger.debug(`[文字处理] 居中计算: 内容宽度=${contentWidth}, 实际显示宽度=${actualDisplayWidth}, 内容X=${contentX}, x=${x}`);
  } else {
    // 使用传入的位置值
    if (videoContentArea) {
      // 如果有视频内容区域，位置相对于视频内容区域
      x = Math.round((transformX / 100) * contentWidth) + contentX;
      // 基于视频内容区域的边界限制
      const minX = contentX + wordWrapMargin;
      const maxX = contentX + contentWidth - actualDisplayWidth - wordWrapMargin;
      x = Math.max(minX, Math.min(x, maxX));
    } else {
      // 否则相对于画布
      x = Math.round((transformX / 100) * canvasWidth);
      // 基于画布边界限制
      x = Math.max(wordWrapMargin, Math.min(x, canvasWidth - actualDisplayWidth - wordWrapMargin));
    }
  }
  console.log(transformY, 'transformY');

  // 垂直位置
  if (transformY === null || transformY === undefined) {
    // 默认：内容区域底部中间（底部往上一定距离，确保文本在内容区域底部中间区域）
    // 关键修复：如果有 videoContentArea，使用视频内容区域的底部；否则使用画布底部
    // 使用内容高度的 8% 作为底部安全区，至少 50px，避免字幕落在画面外或黑边
    const bottomMargin = Math.max(50, Math.round(contentHeight * 0.15));
    const contentBottom = contentY + contentHeight;
    y = Math.round(contentBottom - bottomMargin - finalTextHeight);
    // 确保 y 值不会为负数
    y = Math.max(contentY, y);
    console.log(`[文字处理] 底部定位: 内容Y=${contentY}, 内容高度=${contentHeight}, 内容底部=${contentBottom}, y=${y}`);
  } else if (transformY === 50) {
    // 内容区域垂直居中（基于实际文本高度）
    const contentCenterY = contentY + contentHeight / 2;
    y = Math.round(contentCenterY - finalTextHeight / 2);
  } else if (transformY >= 90) {
    // 底部对齐
    if (videoContentArea) {
      // 如果有视频内容区域，基于视频内容区域的底部
      const contentBottom = contentY + contentHeight;
      const targetBottomY = contentBottom - ((100 - transformY) / 100) * contentHeight;
      y = Math.round(targetBottomY - finalTextHeight);
    } else {
      // 否则基于画布底部
      const targetBottomY = (transformY / 100) * canvasHeight;
      y = Math.round(targetBottomY - finalTextHeight);
    }
    y = Math.max(0, y);
  } else {
    // 使用传入的位置值
    if (videoContentArea) {
      // 如果有视频内容区域，位置相对于视频内容区域
      y = Math.round((transformY / 100) * contentHeight) + contentY;
    } else {
      // 否则相对于画布
      y = Math.round((transformY / 100) * canvasHeight);
    }
  }

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

  logger.debug(`[文字处理] 文本: "${textContent.substring(0, 20)}...", 单行宽度: ${singleLineWidth}, 实际显示宽度: ${actualDisplayWidth}, 高度: ${actualTextHeight}, 位置: (${x}, ${y}), 换行宽度: ${wordWrapWidth}`);

  return text;
}

