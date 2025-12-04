/**
 * 测试视频合并 API（异步任务模式）
 * 使用方法: node test-merge-api.js
 * 
 * 支持新旧两种接口：
 * - 新接口：/api/video (推荐)
 * - 旧接口：/api/merge (向后兼容)
 * 
 * 可通过环境变量切换接口：
 * USE_NEW_API=true node test-merge-api.js  # 使用新接口
 * USE_NEW_API=false node test-merge-api.js # 使用旧接口（默认）
 */

// 支持新旧两种接口
const USE_NEW_API = process.env.USE_NEW_API !== 'false'; // 默认使用新接口
const API_URL = USE_NEW_API
    ? 'http://localhost:3001/api/video'
    : 'http://localhost:3001/api/merge';

// 服务器配置
const SERVER_URL = 'http://localhost:3001';
const HEALTH_CHECK_URL = `${SERVER_URL}/api/health`;

// 测试数据（使用 OSS 视频链接）
const testRequest = {
    settings: {
        resolution: '1080p',
        format: 'mp4',
        fps: 30,
        quality: 'high',
        // 视频方向：'landscape'（横屏，默认）或 'portrait'（竖屏）
        // 竖屏模式：1080p -> 1080x1920, 720p -> 720x1280, 4k -> 2160x3840
        orientation: 'portrait',  // 改为 'landscape' 可生成横屏视频
        // 画面填充模式：'contain'（默认，完整展示）或 'cover'（铺满画面）
        fitMode: 'contain'
    },
    segments: [
        {
            video: 'https://dashscope-result-sh.oss-accelerate.aliyuncs.com/1d/0f/20251203/418b114a/700a3a8d-f958-40bb-acaa-9480343943d5.mp4?Expires=1764843211&OSSAccessKeyId=LTAI5tKPD3TMqf2Lna1fASuh&Signature=C%2Bo82RLWYhaMCVMg32xnP3QDalg%3D',
            text: '第一段视频',
            duration: 5,
            subtitleStyle: {
                fontSize: 60,
                fontColor: '#ffffff',
                strokeColor: '#000000',
                strokeWidth: 4,
                fontWeight: 'bold'
            },
            // 文本动画效果（可选）
            // 支持 FFCreatorLite 的动画效果：fadeIn, fadeOut, moveInRight, moveInLeft, moveInUp, moveInDown, 
            // moveInUpBack, moveInDownBack, zoomIn, zoomOut, bounceIn, bounceOut 等
            textEffects: [
                { type: 'fadeIn', duration: 0.5, delay: 0 },  // 淡入效果
                { type: 'fadeOut', duration: 0.5, delay: 4.5 } // 淡出效果（在结束前0.5秒）
            ]
        },
        {
            video: 'https://dashscope-result-sh.oss-accelerate.aliyuncs.com/1d/59/20251203/0cd678c2/f2bebbf5-ff04-421a-bcca-b0cbb7ddd782.mp4?Expires=1764843215&OSSAccessKeyId=LTAI5tKPD3TMqf2Lna1fASuh&Signature=uZwMfYgCI%2BYJ5KHmvUMqzzJ3DfY%3D',
            text: '第二段视频',
            duration: 5
        },
        {
            video: 'https://dashscope-result-sh.oss-accelerate.aliyuncs.com/1d/8f/20251203/ce4a835c/866b9504-cde8-485a-bb01-6eccb7f0766c.mp4?Expires=1764843216&OSSAccessKeyId=LTAI5tKPD3TMqf2Lna1fASuh&Signature=N5nlxKiPBcDb%2BDdTsZg5viGwAmE%3D',
            text: '第三段视频',
            duration: 5
        },
        {
            video: 'https://dashscope-result-sh.oss-accelerate.aliyuncs.com/1d/e9/20251203/ce4a835c/bdab98b9-269b-4b04-9f2b-3cde534340c0.mp4?Expires=1764843210&OSSAccessKeyId=LTAI5tKPD3TMqf2Lna1fASuh&Signature=uM7duG%2BRn%2B1GZAXP%2Fzpg1hGe740%3D',
            text: '第四段视频',
            duration: 5
        }
    ],
    segmentDuration: 5
};

// 轮询配置
const POLL_INTERVAL = 2000; // 2秒
const POLL_TIMEOUT = 300000; // 5分钟超时
const MAX_CONSECUTIVE_ERRORS = 3; // 最大连续错误次数
const STATUS_CHECK_TIMEOUT = 10000; // 状态查询超时时间（10秒）

/**
 * 检查服务器健康状态
 */
async function checkServerHealth() {
    try {
        console.log('🔍 检查服务器状态...');
        const response = await fetch(HEALTH_CHECK_URL, {
            signal: AbortSignal.timeout(5000)
        });

        if (response.ok) {
            const health = await response.json();
            console.log('✅ 服务器运行正常');
            console.log(`   FFmpeg 路径: ${health.ffmpeg?.path || '未知'}`);
            console.log(`   FFmpeg 版本: ${health.ffmpeg?.version || '未知'}\n`);
            return true;
        } else {
            console.error(`❌ 服务器响应异常: HTTP ${response.status}`);
            return false;
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            console.error('❌ 服务器响应超时');
        } else if (error.code === 'ECONNREFUSED' || error.message.includes('fetch failed')) {
            console.error('❌ 无法连接到服务器');
        } else {
            console.error('❌ 检查服务器状态失败:', error.message);
        }
        console.error('   请确保服务器正在运行: pnpm run dev 或 npm start');
        return false;
    }
}

/**
 * 创建视频合成任务
 */
async function createVideoTask() {
    try {
        console.log('📤 正在创建视频合成任务...');
        console.log(`   片段数量: ${testRequest.segments.length}`);
        console.log(`   每段时长: ${testRequest.segmentDuration}秒`);
        console.log(`   总时长: ${testRequest.segments.length * testRequest.segmentDuration}秒`);

        const endpoint = USE_NEW_API ? `${API_URL}/create` : `${API_URL}`;
        console.log(`   接口地址: ${endpoint}`);
        console.log(`   使用接口: ${USE_NEW_API ? '新接口 (/api/video)' : '原有接口 (/api/merge)'}\n`);

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(testRequest),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const result = await response.json();

        if (result.success) {
            console.log('✅ 任务创建成功！');
            console.log(`   任务ID: ${result.taskId}\n`);
            return result.taskId;
        } else {
            throw new Error(result.error || '创建任务失败');
        }
    } catch (error) {
        console.error('❌ 创建任务失败:', error.message);
        if (error.code === 'ECONNREFUSED') {
            console.error('   请确保服务器已启动: npm start');
        }
        throw error;
    }
}

/**
 * 查询任务状态
 */
async function checkStatus(taskId) {
    try {
        const response = await fetch(`${API_URL}/${taskId}/status`, {
            signal: AbortSignal.timeout(STATUS_CHECK_TIMEOUT)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        return await response.json();
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error('查询状态超时: 服务器响应时间过长');
        } else if (error.code === 'ECONNREFUSED' || error.message.includes('fetch failed')) {
            throw new Error('查询状态失败: 无法连接到服务器');
        } else {
            throw error;
        }
    }
}

/**
 * 获取结果
 */
async function getResult(taskId) {
    try {
        const response = await fetch(`${API_URL}/${taskId}/result`);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        return await response.json();
    } catch (error) {
        console.error('❌ 获取结果失败:', error.message);
        throw error;
    }
}

/**
 * 轮询任务状态
 */
async function pollTask(taskId) {
    console.log('🔄 开始轮询任务状态...\n');

    const startTime = Date.now();
    let lastProgress = 0;
    let consecutiveErrors = 0;

    while (true) {
        // 检查超时
        const elapsed = Date.now() - startTime;
        if (elapsed > POLL_TIMEOUT) {
            console.error(`\n❌ 任务超时: 超过 ${POLL_TIMEOUT / 1000} 秒未完成`);
            return false;
        }

        try {
            const status = await checkStatus(taskId);
            consecutiveErrors = 0; // 重置错误计数

            // 显示进度变化
            if (status.progress !== lastProgress) {
                const elapsedSeconds = Math.round(elapsed / 1000);
                console.log(`[${elapsedSeconds}秒] 📊 ${status.progress}% - ${status.message}`);
                lastProgress = status.progress;
            }

            if (status.status === 'completed') {
                console.log('\n✅ 任务完成！');
                console.log(`   总耗时: ${status.elapsed || Math.round(elapsed / 1000) + '秒'}`);
                console.log(`   输出文件: ${status.outputFile}\n`);
                return true;
            } else if (status.status === 'error') {
                console.error('\n❌ 任务失败:', status.error);
                return false;
            }

            // 等待后继续查询
            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
        } catch (error) {
            consecutiveErrors++;
            const elapsedSeconds = Math.round(elapsed / 1000);
            console.error(`[${elapsedSeconds}秒] 轮询错误 (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`, error.message);

            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                console.error('\n❌ 连续失败次数过多，停止轮询');
                console.error('   请检查服务器是否正常运行');
                return false;
            }

            // 等待后重试
            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
        }
    }
}

/**
 * 保存测试结果到文件
 */
async function saveResult(result) {
    try {
        const fs = await import('fs');
        const path = await import('path');
        const { fileURLToPath } = await import('url');

        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);

        const resultFile = path.join(__dirname, 'test-result.json');
        const resultData = {
            taskId: result.taskId,
            outputFile: result.outputFile,
            videoUrl: `${SERVER_URL}${result.outputFile}`,
            base64Length: result.data?.length || 0,
            timestamp: new Date().toISOString(),
            // 不保存完整的 Base64 数据（太大），只保存前100个字符作为示例
            base64Preview: result.data ? result.data.substring(0, 100) + '...' : null
        };

        fs.writeFileSync(resultFile, JSON.stringify(resultData, null, 2), 'utf-8');
        return resultFile;
    } catch (error) {
        console.error('⚠️  保存结果文件失败:', error.message);
        return null;
    }
}

/**
 * 主函数
 */
async function main() {
    try {
        console.log('='.repeat(60));
        console.log('🎬 视频合并 API 测试工具');
        console.log('='.repeat(60));
        console.log('');

        // 0. 检查服务器健康状态
        const isHealthy = await checkServerHealth();
        if (!isHealthy) {
            process.exit(1);
        }

        // 1. 创建任务
        const taskId = await createVideoTask();

        // 2. 轮询状态
        const isComplete = await pollTask(taskId);

        if (!isComplete) {
            console.error('\n❌ 任务未完成，测试终止');
            process.exit(1);
        }

        // 3. 获取结果
        console.log('📥 正在获取 Base64 视频数据...');
        const result = await getResult(taskId);

        if (result.success) {
            console.log('✅ 获取结果成功！');
            console.log(`   Base64 数据长度: ${result.data?.length || 0} 字符`);
            console.log(`   视频文件路径: ${result.outputFile}`);
            console.log(`   完整URL: ${SERVER_URL}${result.outputFile}\n`);

            // 保存结果到文件
            const resultFile = await saveResult(result);
            if (resultFile) {
                console.log(`💾 结果已保存到: ${resultFile}`);
            }

            console.log('\n💡 提示:');
            console.log(`   1. 查看视频文件: ${SERVER_URL}${result.outputFile}`);
            if (result.outputFile) {
                const path = await import('path');
                console.log(`   2. 文件位置: server/output/${path.basename(result.outputFile)}`);
            }
            console.log(`   3. Base64 数据在 result.data 字段中（已保存预览到 test-result.json）`);
            console.log('');
            console.log('='.repeat(60));
            console.log('✅ 测试完成！');
            console.log('='.repeat(60));
        } else {
            console.error('❌ 获取结果失败:', result.error);
            process.exit(1);
        }
    } catch (error) {
        console.error('\n❌ 测试失败:', error.message);
        if (error.stack) {
            console.error('\n错误堆栈:');
            console.error(error.stack);
        }
        process.exit(1);
    }
}

// 运行测试
main();
