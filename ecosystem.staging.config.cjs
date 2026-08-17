// PM2 Ecosystem Configuration for the ezhalha STAGING environment.
//
// Staging exists so the mobile app can be developed against a real API without booking
// real carrier consignments or charging real cards. It is deliberately separate from
// production in four ways: its own app name, its own port, its own database, and its own
// .env holding carrier/payment SANDBOX credentials.
//
// Deploy:  pm2 start ecosystem.staging.config.cjs --env staging
// Reload:  pm2 reload ecosystem.staging.config.cjs --env staging
//
// NOTE: unlike the production config, no DATABASE_URL is inlined here. Staging reads
// everything from its own .env via server/load-env.ts, so no credential lives in git.
// (The production config still inlines one — see docs/staging-environment.md.)

module.exports = {
  apps: [
    {
      name: "ezhalha-staging",
      script: "dist/index.cjs",
      // Two instances is enough to exercise cluster-mode behaviour (session store,
      // scheduler double-firing) without competing with production for cores.
      instances: 2,
      exec_mode: "cluster",

      env: {
        NODE_ENV: "development",
        PORT: 5001,
      },
      env_staging: {
        NODE_ENV: "production", // build/runtime behaviour must match prod
        PORT: 5001,

        // Schedulers that email real people or poll carriers are off by default here.
        // Turn one on deliberately when testing it, then turn it back off.
        DISABLE_CREDIT_REMINDER_SCHEDULER: "true",
        DISABLE_ABANDONED_RECOVERY_SCHEDULER: "true",
        DISABLE_EXPRESS_TRACKING_REFRESH_SCHEDULER: "true",

        // Allow the Expo dev client and Metro web preview to call this API.
        CORS_ALLOWED_ORIGINS:
          "http://localhost:8081,http://localhost:19006,http://127.0.0.1:8081",
      },

      watch: false,
      max_memory_restart: "400M",

      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: "./logs/pm2-staging-error.log",
      out_file: "./logs/pm2-staging-out.log",
      merge_logs: true,

      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 4000,
      exp_backoff_restart_delay: 100,

      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
    },
  ],
};
