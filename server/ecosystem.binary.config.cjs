module.exports = {
  apps: [
    {
      name: "cloud-video-binary",
      script: "./dist/server-linux",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      interpreter: "none", // 二进制可执行文件无需 Node 解释器
      watch: false,
      autorestart: true,
      max_memory_restart: "1G",
      error_file: "./logs/pm2-error.log",
      out_file: "./logs/pm2-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      env: {
        NODE_ENV: "production",
        PORT: process.env.PORT || 8089
      }
    }
  ]
};
