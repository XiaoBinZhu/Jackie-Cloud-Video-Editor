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

// 需要复制的文件和目录（不包含 lock 文件，会根据包管理器自动处理）
const COPY_PATTERNS = [
  'index.js',
  'config/**/*',
  'middleware/**/*',
  'routes/**/*',
  'services/**/*',
  'render/**/*',
  'utils/**/*',
  'ecosystem.config.cjs',
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
 * 检测包管理器
 */
function detectPackageManager() {
  const pnpmLock = fs.existsSync(path.join(PROJECT_ROOT, 'pnpm-lock.yaml'));
  const npmLock = fs.existsSync(path.join(PROJECT_ROOT, 'package-lock.json'));
  const yarnLock = fs.existsSync(path.join(PROJECT_ROOT, 'yarn.lock'));

  // 检查命令是否可用
  try {
    execSync('pnpm --version', { stdio: 'ignore' });
    if (pnpmLock) return 'pnpm';
  } catch { }

  try {
    execSync('yarn --version', { stdio: 'ignore' });
    if (yarnLock) return 'yarn';
  } catch { }

  return 'npm';
}

/**
 * 创建精简的 package.json（只包含生产依赖）
 */
function createMinimalPackageJson() {
  const originalPkg = JSON.parse(
    fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf-8')
  );

  const minimalPkg = {
    name: originalPkg.name,
    version: originalPkg.version,
    type: originalPkg.type,
    scripts: {
      start: originalPkg.scripts?.start || 'node index.js',
    },
    dependencies: originalPkg.dependencies || {},
  };

  fs.writeFileSync(
    path.join(BUILD_DIR, 'package.json'),
    JSON.stringify(minimalPkg, null, 2)
  );

  console.log('✅ 创建精简 package.json（仅生产依赖）');
}

/**
 * 复制锁文件（如果存在）
 */
function copyLockFile(packageManager) {
  const lockFiles = {
    pnpm: 'pnpm-lock.yaml',
    yarn: 'yarn.lock',
    npm: 'package-lock.json',
  };

  const lockFile = lockFiles[packageManager];
  const srcLockPath = path.join(PROJECT_ROOT, lockFile);

  if (fs.existsSync(srcLockPath)) {
    fs.copyFileSync(srcLockPath, path.join(BUILD_DIR, lockFile));
    console.log(`✅ 复制锁文件: ${lockFile}`);
  }
}

/**
 * 安装生产依赖
 */
function installDependencies(packageManager) {
  console.log(`📥 使用 ${packageManager} 安装生产依赖...`);
  try {
    process.chdir(BUILD_DIR);

    let command;
    switch (packageManager) {
      case 'pnpm':
        command = 'pnpm install --prod --frozen-lockfile --silent';
        break;
      case 'yarn':
        command = 'yarn install --production --frozen-lockfile --silent';
        break;
      default:
        command = 'npm ci --production --silent';
    }

    execSync(command, { stdio: 'inherit' });
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
    const archiveName = `ai-node-${timestamp}.zip`;
    const archivePath = path.join(DIST_DIR, archiveName);

    const output = fs.createWriteStream(archivePath);
    const archive = archiver('zip', {
      zlib: { level: 9 } // 最高压缩级别
    });

    output.on('close', () => {
      const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(2);
      console.log(`✅ 压缩包创建完成: ${archiveName} (${sizeMB} MB)`);
      console.log(`📦 压缩包路径: ${archivePath}`);
      console.log(`📁 解压后将生成: ai-node/ 目录`);
      resolve(archivePath);
    });

    archive.on('error', (err) => {
      console.error('❌ 压缩失败:', err);
      reject(err);
    });

    archive.pipe(output);
    // 将 BUILD_DIR 的内容压缩到 ai-node 目录中
    archive.directory(BUILD_DIR, 'ai-node');
    archive.finalize();
  });
}

/**
 * 清理 node_modules 中不必要的文件
 */
function optimizeNodeModules() {
  console.log('🔧 优化 node_modules...');
  const nodeModulesPath = path.join(BUILD_DIR, 'node_modules');

  if (!fs.existsSync(nodeModulesPath)) {
    return;
  }

  // 要删除的文件和目录模式
  const patternsToRemove = [
    '**/*.md',
    '**/*.txt',
    '**/*.map',
    '**/.git',
    '**/.github',
    '**/test',
    '**/tests',
    '**/__tests__',
    '**/*.test.js',
    '**/*.spec.js',
    '**/examples',
    '**/example',
    '**/docs',
    '**/doc',
    '**/CHANGELOG*',
    '**/LICENSE*',
    '**/README*',
    '**/HISTORY*',
    '**/NOTES*',
    '**/TODO*',
    '**/.npmignore',
    '**/.eslintrc*',
    '**/.prettierrc*',
    '**/tsconfig.json',
    '**/jest.config.*',
    '**/.travis.yml',
    '**/.circleci',
    '**/.nyc_output',
    '**/coverage',
  ];

  function removePattern(dir, patterns) {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      const relativePath = path.relative(nodeModulesPath, entryPath);

      // 检查是否匹配删除模式
      let shouldRemove = false;
      for (const pattern of patterns) {
        const regex = new RegExp(
          pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*')
        );
        if (regex.test(relativePath) || regex.test(entry.name)) {
          shouldRemove = true;
          break;
        }
      }

      if (shouldRemove) {
        try {
          if (entry.isDirectory()) {
            fs.rmSync(entryPath, { recursive: true, force: true });
          } else {
            fs.unlinkSync(entryPath);
          }
        } catch (err) {
          // 忽略删除错误
        }
      } else if (entry.isDirectory()) {
        removePattern(entryPath, patterns);
      }
    }
  }

  removePattern(nodeModulesPath, patternsToRemove);
  console.log('✅ node_modules 优化完成');
}

/**
 * 主函数
 */
async function main() {
  try {
    console.log('🚀 开始打包...\n');

    // 检测包管理器
    const packageManager = detectPackageManager();
    console.log(`📦 检测到包管理器: ${packageManager}\n`);

    // 1. 清理构建目录
    cleanBuildDir();

    // 2. 复制文件
    copyFiles();

    // 3. 创建精简的 package.json
    createMinimalPackageJson();

    // 4. 复制锁文件
    copyLockFile(packageManager);

    // 5. 安装生产依赖
    installDependencies(packageManager);

    // 6. 优化 node_modules（删除不必要的文件）
    optimizeNodeModules();

    // 7. 创建压缩包
    await createArchive();

    console.log('\n✨ 打包完成！');
    console.log('\n📋 部署步骤:');
    console.log('1. 将压缩包上传到 Linux 服务器');
    console.log('2. 解压: unzip ai-node-*.zip -d /path/to/deploy');
    console.log('3. 进入目录: cd /path/to/deploy/ai-node');
    console.log('4. 启动 PM2: pm2 start ecosystem.config.cjs');
    console.log('5. 保存 PM2 配置: pm2 save');
    console.log('6. 设置开机自启: pm2 startup');
    console.log('\n💡 提示: 打包已优化，移除了不必要的文件以减小体积');
    console.log('💡 提示: 解压后会生成 ai-node 目录，包含所有部署文件');

  } catch (error) {
    console.error('\n❌ 打包失败:', error);
    process.exit(1);
  }
}

main();
