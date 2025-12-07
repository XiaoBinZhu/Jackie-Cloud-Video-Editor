module.exports = {
  apps: [
    {
      name: "video-render-server",
      script: "index.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      watch: true, // 启用文件监听，文件变动时自动重启
      watch_delay: 1000, // 延迟 1 秒后重启，避免频繁重启
      ignore_watch: [
        "node_modules",
        "logs",
        "output",
        "cache",
        "uploads",
        "*.log",
        ".git",
        "dist",
        "build"
      ], // 忽略这些文件/目录的变动
      autorestart: true,
      max_memory_restart: "1G",
      error_file: "./logs/pm2-error.log",
      out_file: "./logs/pm2-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      env: {
        NODE_ENV: "production",
        PORT: process.env.PORT || 8089
      },
      // PM2 持久化配置
      pmx: true,
      // 自动重启配置
      min_uptime: "10s",
      max_restarts: 10,
      // 日志配置
      log_type: "json"
    }
  ]
};
