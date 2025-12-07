/**
 * 服务端打包脚本（Windows 打包，CentOS/PM2 部署）
 * 使用方式：node build.js
 * 产物：dist/ai-node-<timestamp>.zip 与 .tar.gz，解压后为 ai-node 目录
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import archiver from 'archiver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = __dirname;
const DIST_DIR = path.join(ROOT, 'dist');
const STAGE_DIR = path.join(DIST_DIR, 'ai-node');
// 是否在打包阶段就安装 node_modules（默认 false，便于服务器自行 npm i）
const INSTALL_NODE_MODULES = false;

// 需要打包的文件/目录
const COPY_TARGETS = [
  'index.js',
  'config',
  'middleware',
  'routes',
  'services',
  'render',
  'utils',
  'ecosystem.config.cjs',
  '.env.example'
];

// 需要过滤掉的通配符（匹配相对路径）
const EXCLUDES = [
  'node_modules',
  'dist',
  'output',
  'cache',
  'uploads',
  '**/*.log',
  '**/*.tmp',
  '**/*.swp',
  '.git',
  '.gitignore',
  '.DS_Store',
  'Thumbs.db',
  'test-*.js',
  '**/*.test.js',
  '**/*.spec.js'
];

const NODEMODULES_CLEAN_PATTERNS = [
  '**/*.md',
  '**/*.txt',
  '**/*.map',
  '**/.git',
  '**/.github',
  '**/test',
  '**/tests',
  '**/__tests__',
  '**/*.test.*',
  '**/*.spec.*',
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
  '**/coverage'
];

const LOCK_FILE_MAP = {
  pnpm: 'pnpm-lock.yaml',
  yarn: 'yarn.lock',
  npm: 'package-lock.json'
};

function logStep(message) {
  console.log(`\n▶ ${message}`);
}

function toPosix(relPath) {
  return relPath.split(path.sep).join('/');
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function cleanDist() {
  logStep('清理 dist 目录');
  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true, force: true });
  }
  ensureDir(STAGE_DIR);
}

function shouldExclude(absPath) {
  const rel = toPosix(path.relative(ROOT, absPath));
  return EXCLUDES.some((pattern) => {
    const regex = new RegExp(
      pattern
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*')
    );
    return regex.test(rel) || regex.test(path.basename(absPath));
  });
}

function copyTarget(target) {
  const src = path.join(ROOT, target);
  const dest = path.join(STAGE_DIR, target);
  if (!fs.existsSync(src)) {
    console.warn(`⚠️  未找到 ${target}，跳过`);
    return;
  }

  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.cpSync(src, dest, {
      recursive: true,
      filter: (srcPath) => !shouldExclude(srcPath)
    });
  } else {
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
  }
}

function copyAll() {
  logStep('复制源码与配置');
  COPY_TARGETS.forEach(copyTarget);
  console.log('✅ 文件复制完成');
}

function detectPackageManager() {
  const has = (cmd) => {
    try {
      execSync(`${cmd} --version`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  };

  if (has('pnpm') && fs.existsSync(path.join(ROOT, 'pnpm-lock.yaml'))) return 'pnpm';
  if (has('yarn') && fs.existsSync(path.join(ROOT, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

function writeMinimalPackageJson() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
  const minimal = {
    name: pkg.name,
    version: pkg.version,
    type: pkg.type,
    scripts: {
      start: pkg.scripts?.start || 'node index.js'
    },
    // 保留 devDependencies 以满足 pnpm-lock 的 spec 匹配，
    // 安装时依然使用 --prod，不会安装 dev 依赖。
    dependencies: pkg.dependencies || {},
    devDependencies: pkg.devDependencies || {}
  };

  fs.writeFileSync(path.join(STAGE_DIR, 'package.json'), JSON.stringify(minimal, null, 2));
  console.log('✅ 已生成精简 package.json');
}

function copyLockFile(pm) {
  const lock = LOCK_FILE_MAP[pm];
  if (!lock) return;
  const src = path.join(ROOT, lock);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(STAGE_DIR, lock));
    console.log(`✅ 已复制锁文件: ${lock}`);
  }
}

function installDeps(pm) {
  logStep(`安装生产依赖（${pm}）`);
  const cwd = process.cwd();
  process.chdir(STAGE_DIR);

  const commands = {
    pnpm: ['pnpm install --prod --frozen-lockfile', 'pnpm install --prod'],
    yarn: ['yarn install --production --frozen-lockfile'],
    npm: ['npm ci --omit=dev', 'npm install --omit=dev']
  }[pm] || ['npm ci --omit=dev'];

  let success = false;
  for (const cmd of commands) {
    try {
      execSync(cmd, { stdio: 'inherit' });
      success = true;
      break;
    } catch (e) {
      console.warn(`⚠️  命令失败，尝试下一条：${cmd}`);
    }
  }

  process.chdir(cwd);
  if (!success) throw new Error('生产依赖安装失败');
  console.log('✅ 生产依赖安装完成');

  // 确认关键依赖已就绪（避免打出的包缺少 express 等）
  const mustHave = ['express'];
  for (const dep of mustHave) {
    const depPath = path.join(STAGE_DIR, 'node_modules', dep);
    if (!fs.existsSync(depPath)) {
      throw new Error(`依赖缺失：${dep} 未安装成功，请检查安装日志`);
    }
  }
}

function cleanNodeModules() {
  logStep('瘦身 node_modules');
  const base = path.join(STAGE_DIR, 'node_modules');
  if (!fs.existsSync(base)) return;

  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      const rel = toPosix(path.relative(base, abs));
      const match = NODEMODULES_CLEAN_PATTERNS.some((pattern) => {
        const regex = new RegExp(
          pattern
            .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
            .replace(/\*\*/g, '.*')
            .replace(/\*/g, '[^/]*')
        );
        return regex.test(rel) || regex.test(entry.name);
      });

      if (match) {
        try {
          if (entry.isDirectory()) {
            fs.rmSync(abs, { recursive: true, force: true });
          } else {
            fs.unlinkSync(abs);
          }
        } catch {
          // ignore cleanup errors
        }
      } else if (entry.isDirectory()) {
        walk(abs);
      }
    }
  };

  walk(base);
  console.log('✅ node_modules 瘦身完成');
}

async function createArchives() {
  logStep('生成压缩包（zip）');
  const stamp = new Date().toISOString().replace(/[:.]/g, '').replace('T', '-').slice(0, 15);
  const baseName = `ai-node-${stamp}`;

  const createOne = (format, options, ext) =>
    new Promise((resolve, reject) => {
      const outputPath = path.join(DIST_DIR, `${baseName}.${ext}`);
      const output = fs.createWriteStream(outputPath);
      const archive = archiver(format, options);

      output.on('close', () => {
        const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(2);
        console.log(`✅ ${ext} -> ${outputPath} (${sizeMB} MB)`);
        resolve(outputPath);
      });
      archive.on('error', reject);

      archive.pipe(output);
      // 打包时保留 ai-node 根目录，解压后直接得到 ai-node/
      archive.directory(STAGE_DIR, 'ai-node');
      archive.finalize();
    });

  await createOne('zip', { zlib: { level: 9 } }, 'zip');
  // await createOne('tar', { gzip: true, gzipOptions: { level: 9 } }, 'tar.gz');
}

async function main() {
  try {
    console.log('🚀 开始构建 Linux 部署包');

    cleanDist();
    copyAll();
    writeMinimalPackageJson();

    const pm = detectPackageManager();
    console.log(`📦 使用的包管理器: ${pm}`);
    copyLockFile(pm);
    if (INSTALL_NODE_MODULES) {
      installDeps(pm);
      cleanNodeModules();
    } else {
      console.log('⏭️ 跳过本地安装依赖，部署时执行 npm/yarn/pnpm 安装');
    }
    await createArchives();

    console.log('\n✨ 打包完成，部署步骤：');
    console.log('1) 上传 dist/ai-node-*.zip 至 CentOS');
    console.log('2) 解压：unzip ai-node-*.zip -d /opt');
    console.log('3) 进入目录：cd /opt/ai-node');
    console.log('4) 安装依赖：npm install --omit=dev （或 pnpm install --prod / yarn install --production）');
    console.log('5) 使用 PM2：pm2 start ecosystem.config.cjs && pm2 save && pm2 startup');
  } catch (err) {
    console.error('❌ 构建失败：', err?.message || err);
    process.exit(1);
  }
}

main();
