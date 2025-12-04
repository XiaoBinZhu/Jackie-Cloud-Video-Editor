# 视频合并 API 文档

## 接口地址

```
POST /api/merge
```

## 请求格式

**Content-Type**: `application/json`

## 请求参数

### 基础结构

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
      "video": "视频URL或路径",
      "audio": "音频URL或路径（可选）",
      "text": "文案内容（可选）",
      "duration": 5,
      "transform": {},
      "textTransform": {},
      "subtitleStyle": {},
      "opacity": 1,
      "textOpacity": 1,
      "volume": 1,
      "audioVolume": 1
    }
  ],
  "segmentDuration": 5
}
```

## 参数说明

### settings（视频设置）

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `resolution` | string | 否 | `"720p"` | 视频分辨率：`"720p"`、`"1080p"`、`"4k"` |
| `format` | string | 否 | `"mp4"` | 视频格式：`"mp4"`、`"webm"` |
| `fps` | number | 否 | `30` | 帧率：`30` 或 `60` |
| `quality` | string | 否 | `"high"` | 视频质量：`"low"`、`"medium"`、`"high"` |

**分辨率对应表**：
- `720p`: 1280x720
- `1080p`: 1920x1080
- `4k`: 3840x2160

**质量对应表**：
- `low`: CRF 28, preset fast
- `medium`: CRF 23, preset medium
- `high`: CRF 18, preset slow

### segments（片段数组）

每个片段对象包含以下字段：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `video` | string | **是** | - | 视频文件URL或本地路径 |
| `audio` | string | 否 | - | 音频文件URL或本地路径 |
| `text` | string | 否 | - | 文案内容（支持纯文本、URL、文件路径） |
| `duration` | number | 否 | `segmentDuration` | 当前片段时长（秒） |
| `transform` | object | 否 | `{x: 50, y: 50, scale: 1}` | 视频位置和缩放 |
| `textTransform` | object | 否 | `{x: 50, y: 99.07, scale: 1}` | 文案位置和缩放 |
| `subtitleStyle` | object | 否 | 见下方 | 文案样式 |
| `opacity` | number | 否 | `1` | 视频透明度（0-1） |
| `textOpacity` | number | 否 | `1` | 文案透明度（0-1） |
| `volume` | number | 否 | `1` | 视频音量（0-1） |
| `audioVolume` | number | 否 | `1` | 音频音量（0-1） |

### transform（视频位置）

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `x` | number | 否 | `50` | 水平位置（百分比，50=居中） |
| `y` | number | 否 | `50` | 垂直位置（百分比，50=居中） |
| `scale` | number | 否 | `1` | 缩放比例 |

**注意**：如果不传 `transform`，视频默认居中显示。

### textTransform（文案位置）

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `x` | number | 否 | `50` | 水平位置（百分比，50=居中） |
| `y` | number | 否 | `99.07` | 垂直位置（百分比，默认距离底部10px） |
| `scale` | number | 否 | `1` | 缩放比例 |

**注意**：如果不传 `textTransform`，文案默认居中，距离底部10px。

### subtitleStyle（文案样式）

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `fontSize` | number | 否 | `48` | 字体大小（像素） |
| `fontColor` | string | 否 | `"#ffffff"` | 字体颜色（十六进制） |
| `strokeColor` | string | 否 | `"#000000"` | 描边颜色（十六进制） |
| `strokeWidth` | number | 否 | `3` | 描边宽度（像素） |
| `fontWeight` | string | 否 | `"normal"` | 字体粗细：`"normal"` 或 `"bold"` |

### segmentDuration（默认片段时长）

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `segmentDuration` | number | 否 | `5` | 每个片段的默认时长（秒），如果片段没有传 `duration` 则使用此值 |

## 完整示例

### 示例1：基础视频合并（仅视频）

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
      "video": "https://oss.example.com/video1.mp4"
    },
    {
      "video": "https://oss.example.com/video2.mp4"
    },
    {
      "video": "https://oss.example.com/video3.mp4"
    }
  ],
  "segmentDuration": 5
}
```

**说明**：
- 3个视频片段，每个播放5秒
- 总时长：15秒
- 视频默认居中显示

### 示例2：视频 + 音频 + 文案

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
      "text": "第一段视频的文案",
      "duration": 5
    },
    {
      "video": "https://oss.example.com/video2.mp4",
      "audio": "https://oss.example.com/audio2.mp3",
      "text": "第二段视频的文案",
      "duration": 8
    }
  ],
  "segmentDuration": 5
}
```

**说明**：
- 第一段：5秒（使用指定的 duration）
- 第二段：8秒（使用指定的 duration）
- 总时长：13秒
- 每个片段都有对应的音频和文案

### 示例3：自定义文案样式

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
      "text": "大标题",
      "subtitleStyle": {
        "fontSize": 72,
        "fontColor": "#ff0000",
        "strokeColor": "#ffffff",
        "strokeWidth": 5,
        "fontWeight": "bold"
      }
    },
    {
      "video": "https://oss.example.com/video2.mp4",
      "text": "小标题",
      "subtitleStyle": {
        "fontSize": 36,
        "fontColor": "#ffff00",
        "strokeColor": "#000000",
        "strokeWidth": 2,
        "fontWeight": "normal"
      }
    }
  ],
  "segmentDuration": 5
}
```

**说明**：
- 第一段：红色大标题，白色描边
- 第二段：黄色小标题，黑色描边

### 示例4：自定义视频和文案位置

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
      "text": "左上角文案",
      "transform": {
        "x": 10,
        "y": 10,
        "scale": 1
      },
      "textTransform": {
        "x": 10,
        "y": 10,
        "scale": 1
      }
    },
    {
      "video": "https://oss.example.com/video2.mp4",
      "text": "右下角文案",
      "textTransform": {
        "x": 90,
        "y": 95,
        "scale": 1
      }
    }
  ],
  "segmentDuration": 5
}
```

**说明**：
- 第一段：视频和文案都在左上角（x: 10%, y: 10%）
- 第二段：视频居中，文案在右下角（x: 90%, y: 95%）

### 示例5：不同时长的片段

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
      "duration": 3,
      "text": "快速片段"
    },
    {
      "video": "https://oss.example.com/video2.mp4",
      "duration": 10,
      "text": "长片段"
    },
    {
      "video": "https://oss.example.com/video3.mp4",
      "text": "默认5秒"
    }
  ],
  "segmentDuration": 5
}
```

**说明**：
- 第一段：3秒
- 第二段：10秒
- 第三段：5秒（使用默认 segmentDuration）
- 总时长：18秒

### 示例6：文案来源（URL、文件、纯文本）

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
      "text": "这是纯文本文案"
    },
    {
      "video": "https://oss.example.com/video2.mp4",
      "text": "https://oss.example.com/subtitle1.txt"
    },
    {
      "video": "https://oss.example.com/video3.mp4",
      "text": "/assets/subtitle2.txt"
    }
  ],
  "segmentDuration": 5
}
```

**说明**：
- 第一段：直接使用纯文本
- 第二段：从 OSS URL 下载文案文件
- 第三段：从本地文件路径读取文案

### 示例7：完整配置示例

```json
{
  "settings": {
    "resolution": "4k",
    "format": "mp4",
    "fps": 60,
    "quality": "high"
  },
  "segments": [
    {
      "video": "https://oss.example.com/video1.mp4",
      "audio": "https://oss.example.com/audio1.mp3",
      "text": "第一段：4K 60fps 高质量",
      "duration": 5,
      "transform": {
        "x": 50,
        "y": 50,
        "scale": 1
      },
      "textTransform": {
        "x": 50,
        "y": 99.07,
        "scale": 1
      },
      "subtitleStyle": {
        "fontSize": 60,
        "fontColor": "#ffffff",
        "strokeColor": "#000000",
        "strokeWidth": 4,
        "fontWeight": "bold"
      },
      "opacity": 1,
      "textOpacity": 1,
      "volume": 1,
      "audioVolume": 0.8
    },
    {
      "video": "https://oss.example.com/video2.mp4",
      "text": "第二段：使用默认配置"
    }
  ],
  "segmentDuration": 5
}
```

## 响应格式

### 创建任务响应（立即返回）

```json
{
  "success": true,
  "taskId": "merge_1733212345678_abc123",
  "message": "合并任务已创建"
}
```

**字段说明**：
- `success`: 是否成功
- `taskId`: 任务ID，用于后续查询状态和获取结果
- `message`: 提示信息

### 查询任务状态

**接口**: `GET /api/merge/:taskId/status`

**响应**:
```json
{
  "taskId": "merge_1733212345678_abc123",
  "status": "processing" | "completed" | "error",
  "progress": 50,
  "message": "正在渲染视频...",
  "error": null,
  "elapsed": "45秒",
  "lastUpdateAgo": "2秒前",
  "outputFile": "/output/video_merge_1733212345678_abc123.mp4",
  "recentLogs": [...]
}
```

**字段说明**：
- `status`: 任务状态
  - `processing`: 处理中
  - `completed`: 已完成
  - `error`: 失败
- `progress`: 进度百分比（0-100）
- `message`: 当前状态消息
- `error`: 错误信息（如果失败）
- `elapsed`: 已用时间
- `lastUpdateAgo`: 上次更新时间
- `outputFile`: 输出文件路径（可用于直接访问视频文件）
- `recentLogs`: 最近日志

### 获取结果（Base64 视频数据）

**接口**: `GET /api/merge/:taskId/result`

**响应（成功）**:
```json
{
  "success": true,
  "taskId": "merge_1733212345678_abc123",
  "data": "data:video/mp4;base64,AAAAIGZ0eXBpc29t...",
  "message": "视频合并完成",
  "outputFile": "/output/video_merge_1733212345678_abc123.mp4"
}
```

**响应（未完成）**:
```json
{
  "error": "任务尚未完成",
  "status": "processing",
  "progress": 50,
  "message": "正在渲染视频..."
}
```

**响应（错误）**:
```json
{
  "success": false,
  "error": "错误信息"
}
```

## 使用流程

### 步骤1：创建合并任务

```javascript
const response = await fetch('http://localhost:3001/api/merge', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    settings: { resolution: '1080p', format: 'mp4', fps: 30, quality: 'high' },
    segments: [
      { video: 'https://oss.example.com/video1.mp4' },
      { video: 'https://oss.example.com/video2.mp4' }
    ],
    segmentDuration: 5
  })
});

const { taskId } = await response.json();
console.log('任务ID:', taskId);
```

### 步骤2：轮询查询状态

```javascript
async function pollStatus(taskId) {
  const response = await fetch(`http://localhost:3001/api/merge/${taskId}/status`);
  const status = await response.json();
  
  console.log(`进度: ${status.progress}% - ${status.message}`);
  
  if (status.status === 'completed') {
    return true; // 完成
  } else if (status.status === 'error') {
    throw new Error(status.error);
  } else {
    return false; // 继续等待
  }
}

// 每 2 秒轮询一次
const interval = setInterval(async () => {
  const isComplete = await pollStatus(taskId);
  if (isComplete) {
    clearInterval(interval);
    // 获取结果
    getResult(taskId);
  }
}, 2000);
```

### 步骤3：获取 Base64 结果

```javascript
async function getResult(taskId) {
  const response = await fetch(`http://localhost:3001/api/merge/${taskId}/result`);
  const result = await response.json();
  
  if (result.success) {
    console.log('视频合并成功！');
    // result.data 包含 Base64 视频数据
    // result.outputFile 包含视频文件路径（可直接访问）
    
    // 使用 Base64 数据
    const videoElement = document.createElement('video');
    videoElement.src = result.data;
    videoElement.controls = true;
    document.body.appendChild(videoElement);
    
    // 或者直接访问文件
    // window.open(`http://localhost:3001${result.outputFile}`);
  }
}
```

### 完整示例

```javascript
async function mergeVideos() {
  try {
    // 1. 创建任务
    const createResponse = await fetch('http://localhost:3001/api/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settings: { resolution: '1080p', format: 'mp4', fps: 30, quality: 'high' },
        segments: [
          { video: 'https://oss.example.com/video1.mp4', text: '第一段' },
          { video: 'https://oss.example.com/video2.mp4', text: '第二段' }
        ],
        segmentDuration: 5
      })
    });
    
    const { taskId } = await createResponse.json();
    console.log('任务已创建:', taskId);
    
    // 2. 轮询状态
    while (true) {
      const statusResponse = await fetch(`http://localhost:3001/api/merge/${taskId}/status`);
      const status = await statusResponse.json();
      
      console.log(`进度: ${status.progress}% - ${status.message}`);
      
      if (status.status === 'completed') {
        // 3. 获取结果
        const resultResponse = await fetch(`http://localhost:3001/api/merge/${taskId}/result`);
        const result = await resultResponse.json();
        
        console.log('✅ 视频合并成功！');
        console.log('Base64 数据长度:', result.data.length);
        console.log('视频文件:', result.outputFile);
        
        return result;
      } else if (status.status === 'error') {
        throw new Error(status.error);
      }
      
      // 等待 2 秒后继续查询
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  } catch (error) {
    console.error('合并失败:', error);
  }
}
```

## 使用 Base64 视频数据

### 方法1：在 HTML 中直接使用

```html
<video controls>
  <source src="data:video/mp4;base64,AAAAIGZ0eXBpc29t..." type="video/mp4">
</video>
```

### 方法2：直接访问视频文件

任务完成后，可以通过 `outputFile` 路径直接访问视频文件：

```javascript
// 在浏览器中直接打开
window.open(`http://localhost:3001${result.outputFile}`);

// 或者使用 video 标签
<video src="http://localhost:3001/output/video_merge_xxx.mp4" controls></video>
```

### 方法3：下载为文件（JavaScript）

```javascript
// 假设 result.data 是 Base64 数据
const base64Data = result.data; // "data:video/mp4;base64,..."
const base64String = base64Data.split(',')[1];
const byteCharacters = atob(base64String);
const byteNumbers = new Array(byteCharacters.length);
for (let i = 0; i < byteCharacters.length; i++) {
  byteNumbers[i] = byteCharacters.charCodeAt(i);
}
const byteArray = new Uint8Array(byteNumbers);
const blob = new Blob([byteArray], { type: 'video/mp4' });

// 创建下载链接
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'merged-video.mp4';
a.click();
URL.revokeObjectURL(url);
```

## 注意事项

1. **视频位置**：
   - 默认居中显示（`transform.x = 50, transform.y = 50`）
   - 有传参才按传参的算

2. **文案位置**：
   - 默认居中，距离底部10px（`textTransform.x = 50, textTransform.y = 99.07`）
   - 有传参才按传参的算

3. **片段时长**：
   - 每个片段可以设置独立的 `duration`
   - 如果没有设置，使用 `segmentDuration`（默认5秒）

4. **文件路径**：
   - 支持 OSS URL（`https://...`）
   - 支持本地绝对路径
   - 支持相对路径（相对于项目根目录）

5. **文案来源**：
   - 纯文本字符串：直接使用
   - URL：自动下载后读取
   - 文件路径：读取文件内容

6. **处理时间**：
   - 视频合并需要时间，请耐心等待
   - 大视频或高分辨率可能需要几分钟

7. **Base64 大小**：
   - Base64 编码会增加约 33% 的大小
   - 大视频建议直接访问 `outputFile` 路径

8. **文件保留**：
   - 渲染完成的视频文件会保留在 `server/output/` 目录
   - 可以通过 `outputFile` 路径直接访问视频文件进行测试
   - 文件不会自动删除，需要手动清理

## 完整请求示例（cURL）

### 1. 创建任务

```bash
curl -X POST http://localhost:3001/api/merge \
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
        "subtitleStyle": {
          "fontSize": 60,
          "fontColor": "#ffffff",
          "strokeColor": "#000000",
          "strokeWidth": 4,
          "fontWeight": "bold"
        }
      },
      {
        "video": "https://oss.example.com/video2.mp4",
        "text": "第二段视频"
      }
    ],
    "segmentDuration": 5
  }'
```

**响应**:
```json
{
  "success": true,
  "taskId": "merge_1733212345678_abc123",
  "message": "合并任务已创建"
}
```

### 2. 查询状态

```bash
curl http://localhost:3001/api/merge/merge_1733212345678_abc123/status
```

### 3. 获取结果

```bash
curl http://localhost:3001/api/merge/merge_1733212345678_abc123/result
```

## 完整请求示例（JavaScript/Fetch）

```javascript
async function mergeVideos() {
  try {
    // 1. 创建任务
    const createResponse = await fetch('http://localhost:3001/api/merge', {
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
            subtitleStyle: {
              fontSize: 60,
              fontColor: '#ffffff',
              strokeColor: '#000000',
              strokeWidth: 4,
              fontWeight: 'bold'
            }
          },
          {
            video: 'https://oss.example.com/video2.mp4',
            text: '第二段视频'
          }
        ],
        segmentDuration: 5
      })
    });
    
    const { taskId } = await createResponse.json();
    console.log('任务ID:', taskId);
    
    // 2. 轮询状态
    while (true) {
      const statusResponse = await fetch(`http://localhost:3001/api/merge/${taskId}/status`);
      const status = await statusResponse.json();
      
      console.log(`进度: ${status.progress}% - ${status.message}`);
      
      if (status.status === 'completed') {
        // 3. 获取结果
        const resultResponse = await fetch(`http://localhost:3001/api/merge/${taskId}/result`);
        const result = await resultResponse.json();
        
        console.log('✅ 视频合并成功！');
        
        // 使用 Base64 数据
        const videoElement = document.createElement('video');
        videoElement.src = result.data;
        videoElement.controls = true;
        document.body.appendChild(videoElement);
        
        // 或者直接访问文件
        console.log('视频文件:', `http://localhost:3001${result.outputFile}`);
        
        return result;
      } else if (status.status === 'error') {
        throw new Error(status.error);
      }
      
      // 等待 2 秒后继续查询
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  } catch (error) {
    console.error('合并失败:', error);
  }
}

// 调用
mergeVideos();
```

## 参数速查表

### settings 参数

```javascript
{
  resolution: "720p" | "1080p" | "4k",    // 分辨率
  format: "mp4" | "webm",                 // 格式
  fps: 30 | 60,                           // 帧率
  quality: "low" | "medium" | "high"      // 质量
}
```

### segment 参数

```javascript
{
  video: string,                          // 必需：视频URL或路径
  audio?: string,                         // 可选：音频URL或路径
  text?: string,                          // 可选：文案（文本/URL/文件）
  duration?: number,                      // 可选：片段时长（秒）
  transform?: {                           // 可选：视频位置
    x?: number,                           // 水平位置（%）
    y?: number,                           // 垂直位置（%）
    scale?: number                        // 缩放比例
  },
  textTransform?: {                       // 可选：文案位置
    x?: number,                           // 水平位置（%）
    y?: number,                           // 垂直位置（%）
    scale?: number                        // 缩放比例
  },
  subtitleStyle?: {                       // 可选：文案样式
    fontSize?: number,                    // 字体大小
    fontColor?: string,                   // 字体颜色
    strokeColor?: string,                // 描边颜色
    strokeWidth?: number,                // 描边宽度
    fontWeight?: "normal" | "bold"      // 字体粗细
  },
  opacity?: number,                       // 可选：视频透明度（0-1）
  textOpacity?: number,                   // 可选：文案透明度（0-1）
  volume?: number,                        // 可选：视频音量（0-1）
  audioVolume?: number                    // 可选：音频音量（0-1）
}
```

