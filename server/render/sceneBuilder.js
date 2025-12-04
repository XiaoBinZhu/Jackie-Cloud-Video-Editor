/**
 * 场景构建逻辑
 * 根据时间线构建 FFCreatorLite 场景
 */
import { FFScene } from 'ffcreatorlite';
import { processVideoClip, processImageClip, processTextClip } from './clipProcessor.js';
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

  // 添加视频
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
  for (const clip of texts) {
    const text = processTextClip(clip, canvasWidth, canvasHeight, segmentDuration);
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

