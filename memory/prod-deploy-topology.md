---
name: prod-deploy-topology
description: How the Ezhalha production server is deployed (host, pm2, env, restart)
metadata:
  type: project
---

Production app at `/www/wwwroot/app.ezhalha.co` on host `147.93.122.137` (aaPanel, root login). Runs the built bundle `dist/index.cjs` under **pm2 cluster, 4 instances**, app name `ezhalha`, via `ecosystem.config.cjs`.

- `NODE_ENV=production` + `PORT=5000` + `DATABASE_URL` come from the pm2 `env_production` block. The app ALSO self-loads `.env` at cwd via `server/load-env.ts` (custom parser, does NOT override keys already in process.env).
- Secrets like `INTEGRATION_CONFIG_SECRET` live ONLY in `.env` (not in ecosystem). Edit `.env`, then `pm2 restart ezhalha` to propagate (plain restart preserves NODE_ENV=production).
- DO NOT run `pm2 reload ecosystem.config.cjs` WITHOUT `--env production` — the default `env` block sets NODE_ENV=development and would flip prod to dev.
- Full code deploy: `npm run build` then `pm2 reload ecosystem.config.cjs --env production`.
- Logs: `logs/pm2-error.log`, `logs/pm2-out.log` (merge_logs on).
- `INTEGRATION_CONFIG_SECRET` was set 2026-06-22 (was previously unset → every Apps-page integration save 500'd). Must stay stable forever or dashboard-saved credentials become undecryptable. See [[integration-config-secret-encryption]].
