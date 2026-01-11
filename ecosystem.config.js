// PM2 Ecosystem Configuration for ezhalha
// Documentation: https://pm2.keymetrics.io/docs/usage/application-declaration/

module.exports = {
  apps: [
    {
      name: "ezhalha",
      script: "dist/server/index.js",
      instances: "max", // Use all available CPU cores
      exec_mode: "cluster",
      
      // Environment variables
      env: {
        NODE_ENV: "development",
        PORT: 5000,
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 5000,
      },
      
      // Process management
      watch: false,
      max_memory_restart: "500M",
      
      // Logging
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: "./logs/pm2-error.log",
      out_file: "./logs/pm2-out.log",
      merge_logs: true,
      
      // Restart behavior
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 4000,
      
      // Health monitoring
      exp_backoff_restart_delay: 100,
      
      // Graceful shutdown
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
    },
  ],
  
  // Deployment configuration for aaPanel
  deploy: {
    production: {
      user: "www",
      host: "your-server-ip",
      ref: "origin/main",
      repo: "git@github.com:your-org/ezhalha.git",
      path: "/www/wwwroot/ezhalha",
      "pre-deploy-local": "",
      "post-deploy": "npm install && npm run build && pm2 reload ecosystem.config.js --env production",
      "pre-setup": "",
    },
  },
};
