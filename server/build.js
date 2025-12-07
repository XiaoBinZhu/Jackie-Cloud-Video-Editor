/**
 * 打包脚本 - 用于 Windows 打包，部署到 Linux 服务器
 * 使用方法: node build.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import archiver from 'archiver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = __dirname;
const DIST_DIR = path.join(PROJECT_ROOT, 'dist');
const BUILD_DIR = path.join(DIST_DIR, 'build');

// 需要复制的文件和目录
const COPY_PATTERNS = [
  'index.js',
  'config/**/*',
  'middleware/**/*',
  'routes/**/*',
  'services/**/*',
  'render/**/*',
  'utils/**/*',
  'package.json',
  'package-lock.json',
  'ecosystem.config.cjs',
  'README.md',
];

// 需要排除的文件和目录
const EXCLUDE_PATTERNS = [
  'node_modules',
  'dist',
  'output',
  'cache',
  'uploads',
  '*.log',
  '.git',
  '.gitignore',
  'test-*.js',
  '*.test.js',
  '*.spec.js',
  '.env',
  '.env.local',
  '.DS_Store',
  'Thumbs.db',
];

/**
 * 递归复制目录
 */
function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * 复制文件或目录
 */
function copyItem(src, dest) {
  const srcPath = path.join(PROJECT_ROOT, src);
  const destPath = path.join(BUILD_DIR, src);

  if (!fs.existsSync(srcPath)) {
    console.warn(`⚠️  文件不存在，跳过: ${src}`);
    return;
  }

  const stat = fs.statSync(srcPath);

  if (stat.isDirectory()) {
    copyDir(srcPath, destPath);
  } else {
    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    fs.copyFileSync(srcPath, destPath);
  }
}

/**
 * 检查是否应该排除文件
 */
function shouldExclude(filePath) {
  const relativePath = path.relative(PROJECT_ROOT, filePath);

  for (const pattern of EXCLUDE_PATTERNS) {
    // 简单的通配符匹配
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      if (regex.test(relativePath) || regex.test(path.basename(relativePath))) {
        return true;
      }
    } else if (relativePath.includes(pattern) || path.basename(filePath) === pattern) {
      return true;
    }
  }
  return false;
}

/**
 * 清理构建目录
 */
function cleanBuildDir() {
  console.log('🧹 清理构建目录...');
  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(BUILD_DIR, { recursive: true });
}

/**
 * 复制文件到构建目录
 */
function copyFiles() {
  console.log('📦 复制文件到构建目录...');

  for (const pattern of COPY_PATTERNS) {
    if (pattern.includes('**')) {
      // 处理通配符模式，提取基础目录
      const baseDir = pattern.split('/')[0];
      const srcPath = path.join(PROJECT_ROOT, baseDir);

      if (fs.existsSync(srcPath)) {
        // 复制整个目录
        const destPath = path.join(BUILD_DIR, baseDir);
        if (fs.statSync(srcPath).isDirectory()) {
          copyDir(srcPath, destPath);
        } else {
          copyItem(baseDir, BUILD_DIR);
        }
      } else {
        console.warn(`⚠️  目录不存在，跳过: ${baseDir}`);
      }
    } else {
      copyItem(pattern, BUILD_DIR);
    }
  }

  console.log('✅ 文件复制完成');
}

/**
 * 安装生产依赖
 */
function installDependencies() {
  console.log('📥 安装生产依赖...');
  try {
    process.chdir(BUILD_DIR);
    execSync('npm ci --production --silent', { stdio: 'inherit' });
    console.log('✅ 依赖安装完成');
  } catch (error) {
    console.error('❌ 依赖安装失败:', error.message);
    throw error;
  } finally {
    process.chdir(PROJECT_ROOT);
  }
}

/**
 * 创建压缩包
 */
function createArchive() {
  return new Promise((resolve, reject) => {
    console.log('🗜️  创建压缩包...');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const archiveName = `video-render-server-${timestamp}.zip`;
    const archivePath = path.join(DIST_DIR, archiveName);

    const output = fs.createWriteStream(archivePath);
    const archive = archiver('zip', {
      zlib: { level: 9 } // 最高压缩级别
    });

    output.on('close', () => {
      const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(2);
      console.log(`✅ 压缩包创建完成: ${archiveName} (${sizeMB} MB)`);
      console.log(`📦 压缩包路径: ${archivePath}`);
      resolve(archivePath);
    });

    archive.on('error', (err) => {
      console.error('❌ 压缩失败:', err);
      reject(err);
    });

    archive.pipe(output);
    archive.directory(BUILD_DIR, false);
    archive.finalize();
  });
}

/**
 * 主函数
 */
async function main() {
  try {
    console.log('🚀 开始打包...\n');

    // 1. 清理构建目录
    cleanBuildDir();

    // 2. 复制文件
    copyFiles();

    // 3. 安装生产依赖
    installDependencies();

    // 4. 创建压缩包
    await createArchive();

    console.log('\n✨ 打包完成！');
    console.log('\n📋 部署步骤:');
    console.log('1. 将压缩包上传到 Linux 服务器');
    console.log('2. 解压: unzip video-render-server-*.zip -d /path/to/deploy');
    console.log('3. 进入目录: cd /path/to/deploy/build');
    console.log('4. 启动 PM2: pm2 start ecosystem.config.cjs');
    console.log('5. 保存 PM2 配置: pm2 save');
    console.log('6. 设置开机自启: pm2 startup');

  } catch (error) {
    console.error('\n❌ 打包失败:', error);
    process.exit(1);
  }
}

main();
