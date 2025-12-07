# 打包和部署指南

本文档说明如何在 Windows 环境下打包项目，并部署到 Linux 服务器。

## 📦 打包步骤

### 1. 安装依赖

确保已安装所有依赖（包括开发依赖）：

```bash
cd server
npm install
```

### 2. 执行打包

运行打包脚本：

```bash
npm run build
```

或者直接运行：

```bash
node build.js
```

### 3. 打包输出

打包完成后，会在 `server/dist/` 目录下生成：

- **构建目录**：`dist/build/` - 包含所有源代码和依赖
- **压缩包**：`dist/video-render-server-YYYY-MM-DDTHH-mm-ss.zip` - 可直接部署的压缩包

## 🚀 部署到 Linux 服务器

### 前置要求

- Linux 服务器已安装 Node.js（建议 v18+）
- 已安装 PM2：`npm install -g pm2`
- 服务器已安装 FFmpeg（如果使用系统 FFmpeg）

### 部署步骤

#### 1. 上传压缩包

将打包生成的 ZIP 文件上传到 Linux 服务器：

```bash
# 使用 scp 上传（示例）
scp server/dist/video-render-server-*.zip user@your-server:/path/to/deploy/
```

#### 2. 解压文件

在服务器上解压压缩包：

```bash
# SSH 登录服务器
ssh user@your-server

# 进入部署目录
cd /path/to/deploy

# 解压文件
unzip video-render-server-*.zip
```

#### 3. 进入构建目录

```bash
cd build
```

#### 4. 验证文件

检查关键文件是否存在：

```bash
ls -la
# 应该看到：index.js, package.json, ecosystem.config.cjs, config/, routes/, services/ 等
```

#### 5. 安装 PM2（如果未安装）

```bash
npm install -g pm2
```

#### 6. 启动服务

使用 PM2 启动服务：

```bash
pm2 start ecosystem.config.cjs
```

#### 7. 查看服务状态

```bash
pm2 status
pm2 logs video-render-server
```

#### 8. 保存 PM2 配置

保存当前 PM2 进程列表，以便服务器重启后自动恢复：

```bash
pm2 save
```

#### 9. 设置开机自启（可选）

```bash
# 生成启动脚本
pm2 startup

# 按照输出的提示执行命令（通常需要 root 权限）
# 例如：sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u your-user --hp /home/your-user
```

## 📋 PM2 常用命令

```bash
# 查看所有进程
pm2 list

# 查看日志
pm2 logs video-render-server

# 重启服务
pm2 restart video-render-server

# 停止服务
pm2 stop video-render-server

# 删除服务
pm2 delete video-render-server

# 查看详细信息
pm2 describe video-render-server

# 监控
pm2 monit
```

## 🔧 配置说明

### PM2 配置文件

`ecosystem.config.cjs` 包含以下配置：

- **应用名称**：`video-render-server`
- **端口**：`8089`（可通过环境变量 `PORT` 修改）
- **实例数**：1（单实例运行）
- **自动重启**：启用
- **内存限制**：1GB
- **日志文件**：`./logs/pm2-error.log` 和 `./logs/pm2-out.log`

### 环境变量

可以通过环境变量修改配置：

```bash
# 修改端口
export PORT=9090
pm2 start ecosystem.config.cjs

# 或使用 PM2 的环境变量
pm2 start ecosystem.config.cjs --update-env --env production
```

### 修改配置

如果需要修改 PM2 配置，编辑 `ecosystem.config.cjs` 后：

```bash
pm2 delete video-render-server
pm2 start ecosystem.config.cjs
pm2 save
```

## 🐛 故障排查

### 1. 服务无法启动

检查日志：

```bash
pm2 logs video-render-server --err
```

常见问题：
- Node.js 版本不兼容
- 端口被占用
- 依赖缺失

### 2. FFmpeg 相关问题

项目使用 `@ffmpeg-installer/ffmpeg`，会自动安装 FFmpeg。如果遇到问题：

```bash
# 检查 FFmpeg 路径
node -e "console.log(require('@ffmpeg-installer/ffmpeg').path)"

# 验证 FFmpeg
ffmpeg -version
```

### 3. 端口冲突

修改端口：

```bash
# 方法1：修改 ecosystem.config.cjs 中的 PORT
# 方法2：使用环境变量
PORT=9090 pm2 start ecosystem.config.cjs
```

### 4. 内存不足

调整 PM2 配置中的 `max_memory_restart` 值，或增加服务器内存。

## 📝 打包脚本说明

`build.js` 脚本会：

1. **清理构建目录**：删除旧的 `dist/` 目录
2. **复制源代码**：复制所有需要的文件和目录
3. **安装依赖**：在构建目录中安装生产依赖（`npm ci --production`）
4. **创建压缩包**：生成 ZIP 压缩包，包含所有部署文件

### 包含的文件

- 所有源代码文件（`.js` 文件）
- 配置文件（`config/`）
- 中间件（`middleware/`）
- 路由（`routes/`）
- 服务（`services/`）
- 渲染模块（`render/`）
- 工具函数（`utils/`）
- `package.json` 和 `package-lock.json`
- `ecosystem.config.cjs`（PM2 配置）
- `README.md`

### 排除的文件

- `node_modules/`（会在部署时重新安装）
- `dist/`、`build/`
- `output/`、`cache/`、`uploads/`（运行时目录）
- 测试文件（`*.test.js`、`test-*.js`）
- 日志文件（`*.log`）
- 环境变量文件（`.env`）

## 🔄 更新部署

当需要更新服务时：

1. 在 Windows 上重新打包：`npm run build`
2. 上传新的压缩包到服务器
3. 停止旧服务：`pm2 stop video-render-server`
4. 备份旧版本（可选）
5. 解压新版本
6. 进入 `build` 目录
7. 启动服务：`pm2 start ecosystem.config.cjs`
8. 保存配置：`pm2 save`

或者使用 PM2 的优雅重启：

```bash
pm2 reload video-render-server
```

## 📞 技术支持

如有问题，请检查：

1. PM2 日志：`pm2 logs video-render-server`
2. 系统日志：`journalctl -u pm2-your-user`（如果使用 systemd）
3. 应用健康检查：访问 `http://your-server:8089/api/health`

---

**最后更新**：2024年
