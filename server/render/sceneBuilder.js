/**
 * 场景构建逻辑
 * 根据时间线构建 FFCreatorLite 场景
 */
import { FFScene } from 'ffcreatorlite';
import { processVideoClip, processImageClip, processTextClip } from './clipProcessor.js';
import { getVideoDimensions, calculateContainSize, resolveAssetPath } from './videoUtils.js';
import { logger } from '../utils/logger.js';

/**
 * 从时间线收集所有片段
 * @param {Object} timeline - 时间线对象
 * @returns {{allClips: Array, audioClips: Array}} 片段列表
 */
export function collectClipsFromTimeline(timeline) {
  const allClips = [];
  const audioClips = [];

  if (timeline.tracks && Array.isArray(timeline.tracks)) {
    for (const track of timeline.tracks) {
      if (!track.clips || !Array.isArray(track.clips)) continue;

      for (const clip of track.clips) {
        const clipType = clip.type || track.type;
        const startTime = clip.start_time || 0;
        const duration = clip.duration || 5;
        const endTime = startTime + duration;

        if (clipType === 'AUDIO') {
          audioClips.push(clip);
        } else {
          allClips.push({
            ...clip,
            clipType,
            startTime,
            duration,
            endTime,
          });
        }
      }
    }
  }

  return { allClips, audioClips };
}

/**
 * 计算时间点
 * @param {Array} allClips - 所有片段列表
 * @returns {Array<number>} 排序后的时间点数组
 */
export function calculateTimePoints(allClips) {
  const timePoints = new Set([0]);
  allClips.forEach(clip => {
    timePoints.add(clip.startTime);
    timePoints.add(clip.endTime);
  });
  return [...timePoints].sort((a, b) => a - b);
}

/**
 * 为时间段创建场景
 * @param {number} segmentStart - 片段开始时间
 * @param {number} segmentEnd - 片段结束时间
 * @param {number} segmentIndex - 片段索引
 * @param {Array} allClips - 所有片段列表
 * @param {number} canvasWidth - 画布宽度
 * @param {number} canvasHeight - 画布高度
 * @param {boolean} useVideoSize - 是否使用视频尺寸作为画布
 * @returns {Promise<FFScene>} FFScene 实例
 */
export async function buildSceneForSegment(
  segmentStart,
  segmentEnd,
  segmentIndex,
  allClips,
  canvasWidth,
  canvasHeight,
  useVideoSize = false
) {
  const segmentDuration = segmentEnd - segmentStart;

  if (segmentDuration <= 0) {
    return null;
  }

  logger.debug(`场景 ${segmentIndex + 1}: ${segmentStart}s - ${segmentEnd}s (${segmentDuration}s)`);

  const scene = new FFScene();
  scene.setBgColor('#000000');
  scene.setDuration(segmentDuration);

  // 确保场景尺寸正确设置（如果 FFCreatorLite 支持）
  if (typeof scene.setSize === 'function') {
    scene.setSize(canvasWidth, canvasHeight);
  }

  // 找出在这个时间段内应该显示的所有片段
  const activeClips = allClips.filter(clip =>
    clip.startTime < segmentEnd && clip.endTime > segmentStart
  );

  // 按类型分组：VIDEO -> IMAGE -> TEXT
  const videos = activeClips.filter(c => c.clipType === 'VIDEO');
  const images = activeClips.filter(c => c.clipType === 'IMAGE');
  const texts = activeClips.filter(c => c.clipType === 'TEXT');

  // 添加视频并收集视频信息
  const videoInfoList = [];
  for (const clip of videos) {
    const video = await processVideoClip(
      clip,
      canvasWidth,
      canvasHeight,
      segmentStart,
      segmentDuration,
      useVideoSize
    );
    if (video) {
      scene.addChild(video);
      // 保存视频信息，用于计算视频内容区域
      videoInfoList.push({
        video,
        clip,
        x: video.x || 0,
        y: video.y || 0,
        width: video.width || canvasWidth,
        height: video.height || canvasHeight
      });
    }
  }

  // 计算所有视频的合并区域（bounding box）
  // 在 contain 模式下，需要计算视频内容的实际位置和尺寸
  let videoContentArea = null;
  if (videoInfoList.length > 0) {
    // 检查是否有 contain 模式的视频
    const hasContainMode = videoInfoList.some(info => (info.clip.fitMode || 'contain') === 'contain');

    if (hasContainMode) {
      // 在 contain 模式下，需要计算视频内容的实际位置和尺寸
      // 视频内容可能没有填充满整个画布，需要根据视频的原始尺寸和画布尺寸计算
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

      for (const info of videoInfoList) {
        const clip = info.clip;
        const fitMode = clip.fitMode || 'contain';

        if (fitMode === 'contain') {
          // 对于 contain 模式，需要获取视频的原始尺寸来计算实际内容区域
          // 预处理后的视频尺寸等于画布尺寸，但视频内容在预处理后的视频中是居中的
          // 需要根据原始视频尺寸和画布尺寸计算视频内容的实际位置和尺寸

          try {
            const videoPath = resolveAssetPath(clip.asset_src);
            if (videoPath && !videoPath.startsWith('http://') && !videoPath.startsWith('https://')) {
              const videoDimensions = await getVideoDimensions(videoPath);

              if (videoDimensions) {
                // 计算 contain 模式下的视频内容尺寸和位置
                const containedSize = calculateContainSize(
                  videoDimensions.width,
                  videoDimensions.height,
                  canvasWidth,
                  canvasHeight
                );

                // 视频内容在画布中居中
                const contentX = Math.round((canvasWidth - containedSize.width) / 2);
                const contentY = Math.round((canvasHeight - containedSize.height) / 2);
                const contentWidth = containedSize.width;
                const contentHeight = containedSize.height;

                minX = Math.min(minX, contentX);
                minY = Math.min(minY, contentY);
                maxX = Math.max(maxX, contentX + contentWidth);
                maxY = Math.max(maxY, contentY + contentHeight);

                logger.debug(`[场景构建] contain模式视频内容区域: x=${contentX}, y=${contentY}, width=${contentWidth}, height=${contentHeight}`);
              } else {
                // 无法获取视频尺寸，使用视频对象的尺寸和位置
                const videoX = info.x;
                const videoY = info.y;
                const videoWidth = info.width;
                const videoHeight = info.height;

                minX = Math.min(minX, videoX);
                minY = Math.min(minY, videoY);
                maxX = Math.max(maxX, videoX + videoWidth);
                maxY = Math.max(maxY, videoY + videoHeight);
              }
            } else {
              // 网络视频或无法解析路径，使用视频对象的尺寸和位置
              const videoX = info.x;
              const videoY = info.y;
              const videoWidth = info.width;
              const videoHeight = info.height;

              minX = Math.min(minX, videoX);
              minY = Math.min(minY, videoY);
              maxX = Math.max(maxX, videoX + videoWidth);
              maxY = Math.max(maxY, videoY + videoHeight);
            }
          } catch (error) {
            logger.warn(`[场景构建] 计算视频内容区域失败: ${error.message}，使用视频对象的尺寸和位置`);
            // 出错时使用视频对象的尺寸和位置
            const videoX = info.x;
            const videoY = info.y;
            const videoWidth = info.width;
            const videoHeight = info.height;

            minX = Math.min(minX, videoX);
            minY = Math.min(minY, videoY);
            maxX = Math.max(maxX, videoX + videoWidth);
            maxY = Math.max(maxY, videoY + videoHeight);
          }
        } else {
          // cover 模式：视频填充满画布
          const videoX = info.x;
          const videoY = info.y;
          const videoWidth = info.width;
          const videoHeight = info.height;

          minX = Math.min(minX, videoX);
          minY = Math.min(minY, videoY);
          maxX = Math.max(maxX, videoX + videoWidth);
          maxY = Math.max(maxY, videoY + videoHeight);
        }
      }

      if (minX !== Infinity && minY !== Infinity) {
        videoContentArea = {
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY
        };
        logger.debug(`[场景构建] 计算视频内容区域: x=${videoContentArea.x}, y=${videoContentArea.y}, width=${videoContentArea.width}, height=${videoContentArea.height}`);
      }
    } else {
      // 没有 contain 模式的视频，视频应该填充满画布
      videoContentArea = {
        x: 0,
        y: 0,
        width: canvasWidth,
        height: canvasHeight
      };
    }
  }

  // 添加图片
  for (const clip of images) {
    const image = processImageClip(clip, canvasWidth, canvasHeight, segmentDuration);
    if (image) {
      scene.addChild(image);
    }
  }

  // 添加文字（在视频和图片之后添加，确保文本在最上层）
  // 传递视频内容区域信息，用于 contain 模式下的字幕定位
  for (const clip of texts) {
    const text = processTextClip(clip, canvasWidth, canvasHeight, segmentDuration, videoContentArea);
    if (text) {
      scene.addChild(text);
      // 添加到场景后，再次设置位置（确保位置固定相对于画布）
      try {
        text.setXY(text.x, text.y);
      } catch (e) {
        // 忽略设置位置错误
      }
    }
  }

  return scene;
}

/**
 * 构建所有场景
 * @param {Array<number>} sortedTimePoints - 排序后的时间点数组
 * @param {Array} allClips - 所有片段列表
 * @param {number} canvasWidth - 画布宽度
 * @param {number} canvasHeight - 画布高度
 * @param {boolean} useVideoSize - 是否使用视频尺寸作为画布
 * @returns {Promise<Array<FFScene>>} 场景数组
 */
export async function buildAllScenes(sortedTimePoints, allClips, canvasWidth, canvasHeight, useVideoSize = false) {
  const scenes = [];

  for (let i = 0; i < sortedTimePoints.length - 1; i++) {
    const segmentStart = sortedTimePoints[i];
    const segmentEnd = sortedTimePoints[i + 1];

    const scene = await buildSceneForSegment(
      segmentStart,
      segmentEnd,
      i,
      allClips,
      canvasWidth,
      canvasHeight,
      useVideoSize
    );

    if (scene) {
      scenes.push(scene);
    }
  }

  return scenes;
}

