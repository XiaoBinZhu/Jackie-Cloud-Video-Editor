# OSS 视频合成 API 项目

基于 FFCreatorLite 的视频合成服务，支持从 OSS（对象存储服务）下载视频、音频和字幕，并合成为最终视频。

## 项目结构

```
server/
├── index.js                 # 主入口文件（Express 服务器）
├── config/
│   └── config.js           # 配置文件（端口、目录等）
├── services/
│   ├── ossService.js       # OSS 文件下载服务
│   ├── videoService.js     # 视频合成服务
│   └── timelineService.js  # 时间线构建服务
├── routes/
│   └── videoRoutes.js      # 视频相关路由
├── utils/
│   ├── fileUtils.js        # 文件工具函数
│   └── videoUtils.js       # 视频工具函数
├── render/
│   └── renderVideo.js      # FFCreatorLite 渲染模块
└── tests/
    ├── test-merge-api.js   # 合并 API 测试
    └── test-render-api.js  # 渲染 API 测试
```

## 功能特性

- ✅ 支持从 OSS URL 下载视频、音频文件
- ✅ 支持文本字幕（纯文本格式）
- ✅ 支持多段视频合并
- ✅ 支持视频、音频、字幕混合合成
- ✅ 支持自定义分辨率（720p, 1080p, 4k）
- ✅ 支持自定义视频质量（low, medium, high）
- ✅ 异步任务模式，支持进度查询
- ✅ 返回 Base64 格式的视频数据

## 安装依赖

```bash
npm install
```

## 启动服务

```bash
npm start
```

服务默认运行在 `http://localhost:3001`

## API 接口

### 1. 创建视频合成任务

**POST** `/api/video/create`

**请求体：**

```json
{
  "settings": {
    "resolution": "1080p",
    "format": "mp4",
    "fps": 30,
    "quality": "high"
  },
  "segments": [
    {
      "video": "https://oss.example.com/video1.mp4",
      "audio": "https://oss.example.com/audio1.mp3",
      "text": "第一段字幕文本",
      "duration": 5,
      "subtitleStyle": {
        "fontSize": 48,
        "fontColor": "#ffffff",
        "strokeColor": "#000000",
        "strokeWidth": 3,
        "fontWeight": "normal"
      },
      "textTransform": {
        "x": 50,
        "y": 90,
        "scale": 1
      }
    }
  ],
  "segmentDuration": 5
}
```

**响应：**

```json
{
  "success": true,
  "taskId": "video_1234567890_abc123",
  "message": "视频合成任务已创建"
}
```

### 2. 查询任务状态

**GET** `/api/video/:taskId/status`

**响应：**

```json
{
  "taskId": "video_1234567890_abc123",
  "status": "processing",
  "progress": 45,
  "message": "正在渲染: 45%",
  "error": null,
  "elapsed": "30秒",
  "lastUpdateAgo": "2秒前",
  "outputFile": "/output/video_1234567890_abc123.mp4",
  "recentLogs": [...]
}
```

**状态值：**
- `processing`: 处理中
- `completed`: 已完成
- `error`: 错误

### 3. 获取合成结果

**GET** `/api/video/:taskId/result`

**响应：**

```json
{
  "success": true,
  "taskId": "video_1234567890_abc123",
  "data": "data:video/mp4;base64,AAAAIGZ0eXBpc29t...",
  "outputFile": "/output/video_1234567890_abc123.mp4",
  "message": "视频合成完成"
}
```

### 4. 下载视频文件

**GET** `/api/video/:taskId/download`

直接下载视频文件。

### 5. 删除任务

**DELETE** `/api/video/:taskId`

删除任务及其相关文件。

### 6. 健康检查

**GET** `/api/health`

检查服务状态。

## 参数说明

### settings 参数

- `resolution`: 分辨率，可选值：`720p`, `1080p`, `4k`
- `format`: 视频格式，可选值：`mp4`, `webm`
- `fps`: 帧率，默认 `30`
- `quality`: 视频质量，可选值：`low`, `medium`, `high`

### segment 参数

- `video` (必需): 视频文件 URL 或本地路径
- `audio` (可选): 音频文件 URL 或本地路径
- `text` (可选): 字幕文本内容或文本文件 URL
- `duration` (可选): 片段时长（秒），默认使用 `segmentDuration`
- `subtitleStyle` (可选): 字幕样式
  - `fontSize`: 字体大小，默认 `48`
  - `fontColor`: 字体颜色，默认 `#ffffff`
  - `strokeColor`: 描边颜色，默认 `#000000`
  - `strokeWidth`: 描边宽度，默认 `3`
  - `fontWeight`: 字体粗细，可选值：`normal`, `bold`
- `textTransform` (可选): 字幕位置
  - `x`: 水平位置（百分比，50 为居中），默认居中
  - `y`: 垂直位置（百分比，50 为居中，90+ 为底部），默认底部往上 10px
  - `scale`: 缩放比例，默认 `1`

## 测试

### 运行合并 API 测试

```bash
node tests/test-merge-api.js
```

### 运行渲染 API 测试

```bash
node tests/test-render-api.js
```

## 使用示例

### JavaScript/Node.js

```javascript
// 1. 创建任务
const response = await fetch('http://localhost:3001/api/video/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    settings: {
      resolution: '1080p',
      format: 'mp4',
      fps: 30,
      quality: 'high'
    },
    segments: [
      {
        video: 'https://oss.example.com/video1.mp4',
        text: '第一段视频',
        duration: 5
      }
    ],
    segmentDuration: 5
  })
});

const { taskId } = await response.json();

// 2. 轮询状态
while (true) {
  const status = await fetch(`http://localhost:3001/api/video/${taskId}/status`);
  const data = await status.json();
  
  if (data.status === 'completed') {
    break;
  } else if (data.status === 'error') {
    throw new Error(data.error);
  }
  
  await new Promise(resolve => setTimeout(resolve, 2000));
}

// 3. 获取结果
const result = await fetch(`http://localhost:3001/api/video/${taskId}/result`);
const { data } = await result.json();
// data 是 Base64 格式的视频数据
```

### cURL

```bash
# 创建任务
curl -X POST http://localhost:3001/api/video/create \
  -H "Content-Type: application/json" \
  -d '{
    "settings": {
      "resolution": "1080p",
      "format": "mp4",
      "fps": 30,
      "quality": "high"
    },
    "segments": [
      {
        "video": "https://oss.example.com/video1.mp4",
        "text": "第一段视频",
        "duration": 5
      }
    ],
    "segmentDuration": 5
  }'

# 查询状态
curl http://localhost:3001/api/video/{taskId}/status

# 获取结果
curl http://localhost:3001/api/video/{taskId}/result
```

## 注意事项

1. **FFmpeg 依赖**: 项目依赖 FFmpeg，会自动安装 `@ffmpeg-installer/ffmpeg`
2. **文件下载**: OSS 文件会先下载到 `uploads/` 目录，任务完成后自动清理
3. **输出文件**: 合成的视频保存在 `output/` 目录
4. **任务超时**: 默认超时时间为 5 分钟
5. **并发限制**: 建议同时运行的任务数不超过 5 个

## 技术栈

- **Node.js**: 运行环境
- **Express**: Web 框架
- **FFCreatorLite**: 视频合成库
- **FFmpeg**: 视频处理工具

## 许可证

MIT
