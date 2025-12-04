/**
 * 视频工具函数
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';

/**
 * 获取分辨率配置
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
 * 获取质量配置
 */
export function getQualityConfig(quality) {
  switch (quality) {
    case 'high':
      return { crf: 18, preset: 'slow' };
    case 'medium':
      return { crf: 23, preset: 'medium' };
    case 'low':
    default:
      return { crf: 28, preset: 'fast' };
  }
}

/**
 * 获取视频的原始尺寸
 */
export function getVideoDimensions(videoPath) {
  try {
    // 如果是网络 URL，无法直接获取尺寸，返回 null
    if (videoPath.startsWith('http://') || videoPath.startsWith('https://')) {
      return null;
    }

    // 检查文件是否存在
    if (!fs.existsSync(videoPath)) {
      logger.warn(`视频文件不存在: ${videoPath}`);
      return null;
    }

    // 获取 ffmpeg/ffprobe 路径
    let ffmpegPath = process.env.FFMPEG_PATH;
    if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
      ffmpegPath = 'ffmpeg';
    }

    let ffprobePath = process.env.FFPROBE_PATH;
    let useFfprobe = false;

    if (ffprobePath && fs.existsSync(ffprobePath)) {
      useFfprobe = true;
    } else if (ffmpegPath) {
      // 尝试从 ffmpeg 路径推导 ffprobe 路径
      const ffmpegDir = path.dirname(ffmpegPath);
      const possibleFfprobePath = path.join(ffmpegDir, 'ffprobe.exe');
      if (fs.existsSync(possibleFfprobePath)) {
        ffprobePath = possibleFfprobePath;
        useFfprobe = true;
      }
    }

    let finalCommand;
    if (useFfprobe) {
      finalCommand = `"${ffprobePath}" -v error -select_streams v:0 -show_entries stream=width,height -of json "${videoPath}"`;
    } else {
      finalCommand = `"${ffmpegPath}" -i "${videoPath}" 2>&1`;
    }

    const output = execSync(finalCommand, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });

    if (useFfprobe) {
      // 使用 ffprobe，输出是 JSON
      const data = JSON.parse(output);
      if (data.streams && data.streams.length > 0) {
        const stream = data.streams[0];
        return {
          width: parseInt(stream.width),
          height: parseInt(stream.height)
        };
      }
    } else {
      // 使用 ffmpeg，解析输出文本
      const match = output.match(/(\d{2,5})x(\d{2,5})/);
      if (match) {
        return {
          width: parseInt(match[1]),
          height: parseInt(match[2])
        };
      }
    }

    return null;
  } catch (error) {
    logger.warn(`获取视频尺寸失败: ${videoPath}`, error.message);
    return null;
  }
}

/**
 * 计算保持宽高比的缩放尺寸（contain 模式）
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
 * 将动画效果映射到 FFCreator 动画
 */
export function mapTransition(transition) {
  const transitionMap = {
    'fade': 'fadeIn',
    'dissolve': 'fadeIn',
    'none': null
  };
  return transitionMap[transition] || null;
}

