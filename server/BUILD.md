# 打包和部署指南

本文档说明如何在 Windows 环境下打包项目，并部署到 Linux 服务器。

## 📦 打包步骤

### 1. 安装依赖

确保已安装所有依赖（包括开发依赖）：

```bash
cd server

# 使用 npm
npm install

# 或使用 pnpm（推荐，更快更省空间）
pnpm install

# 或使用 yarn
yarn install
```

### 2. 执行打包

运行打包脚本：

```bash
# 使用 npm
npm run build

# 或使用 pnpm
pnpm run build

# 或使用 yarn
yarn build
```

或者直接运行：

```bash
node build.js
```

**注意**：打包脚本会自动检测你使用的包管理器（npm/pnpm/yarn），并使用相应的命令安装依赖。

### 3. 打包输出

打包完成后，会在 `server/dist/` 目录下生成：

- **构建目录**：`dist/build/` - 包含所有源代码和依赖
- **压缩包**：`dist/ai-node-YYYY-MM-DDTHH-mm-ss.zip` - 可直接部署的压缩包

**注意**：压缩包解压后会生成 `ai-node/` 目录，包含所有部署文件。

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

# 解压文件（会自动生成 ai-node 目录）
unzip ai-node-*.zip
```

#### 3. 进入项目目录

```bash
cd ai-node
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
- **文件监听**：启用（文件变动时自动重启）
- **监听延迟**：1 秒（避免频繁重启）
- **忽略监听**：`node_modules`、`logs`、`output`、`cache`、`uploads` 等
- **自动重启**：启用
- **内存限制**：1GB
- **日志文件**：`./logs/pm2-error.log` 和 `./logs/pm2-out.log`

#### 文件监听说明

PM2 已配置为监听文件变动并自动重启。当你修改代码文件时，PM2 会自动检测并重启服务。

**注意**：
- 生产环境如果不需要自动重启，可以将 `watch: true` 改为 `watch: false`
- 监听会忽略 `node_modules`、日志文件、输出目录等，避免不必要的重启

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

或者使用重载（无需删除）：

```bash
pm2 reload ecosystem.config.cjs
```

#### 禁用文件监听（生产环境推荐）

如果生产环境不需要文件监听，可以修改 `ecosystem.config.cjs`：

```javascript
watch: false, // 改为 false 禁用文件监听
```

然后重载配置：

```bash
pm2 reload ecosystem.config.cjs
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

1. **检测包管理器**：自动检测 npm/pnpm/yarn
2. **清理构建目录**：删除旧的 `dist/` 目录
3. **复制源代码**：复制所有需要的文件和目录
4. **创建精简 package.json**：只包含生产依赖
5. **复制锁文件**：复制对应的锁文件（`package-lock.json`/`pnpm-lock.yaml`/`yarn.lock`）
6. **安装依赖**：使用检测到的包管理器安装生产依赖
7. **优化 node_modules**：删除不必要的文件以减小体积
8. **创建压缩包**：生成 ZIP 压缩包，包含所有部署文件

### 包含的文件

- 所有源代码文件（`.js` 文件）
- 配置文件（`config/`）
- 中间件（`middleware/`）
- 路由（`routes/`）
- 服务（`services/`）
- 渲染模块（`render/`）
- 工具函数（`utils/`）
- 精简的 `package.json`（仅包含生产依赖）
- 锁文件（`package-lock.json`、`pnpm-lock.yaml` 或 `yarn.lock`，根据使用的包管理器）
- `ecosystem.config.cjs`（PM2 配置）

### 排除的文件

- `node_modules/`（会在部署时重新安装）
- `dist/`、`build/`
- `output/`、`cache/`、`uploads/`（运行时目录）
- 测试文件（`*.test.js`、`test-*.js`）
- 日志文件（`*.log`）
- 环境变量文件（`.env`）
- 文档文件（`*.md`、`README*`）
- 开发配置文件（`.eslintrc*`、`.prettierrc*`、`tsconfig.json` 等）

### 体积优化

打包脚本会自动优化体积：

1. **精简 package.json**：只包含生产依赖，移除开发依赖和脚本
2. **清理 node_modules**：删除不必要的文件，如：
   - 文档文件（`*.md`、`README*`、`CHANGELOG*`）
   - 测试文件（`test/`、`__tests__/`、`*.test.js`）
   - 示例代码（`examples/`、`example/`）
   - 源代码映射（`*.map`）
   - 开发配置文件（`.eslintrc*`、`jest.config.*` 等）
3. **使用生产依赖**：只安装 `dependencies`，不安装 `devDependencies`

## 🔄 更新部署

当需要更新服务时：

1. 在 Windows 上重新打包：`npm run build` 或 `pnpm run build`
2. 上传新的压缩包到服务器
3. 停止旧服务：`pm2 stop video-render-server`
4. 备份旧版本（可选）：`mv ai-node ai-node.backup`
5. 解压新版本：`unzip ai-node-*.zip`
6. 进入 `ai-node` 目录：`cd ai-node`
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
3. 应用健康检查：访问 `http://your-server:8089/api-node/health`

---

**最后更新**：2024年
