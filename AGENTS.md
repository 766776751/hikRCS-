# AGENTS.md

## Project

AGV Alarm Push Center (`agv-alarm-push-center` v2.0.0) — Node.js + Express + PostgreSQL backend that monitors AGV alarms and pushes notifications to 企业微信, 钉钉, 飞书, and 微信公众号. Frontend is a **Vite + Vue 3 SPA** in `frontend/` (built to `dist/`), one responsive app serving both desktop (hero + function cards + modals) and mobile (<768px: bottom tabs + cards). Legacy inline-JS pages kept in `public/` as fallback only.

## Quick Start

```bash
npm install
cd frontend && npm install && npm run build   # build Vue app to dist/
cd ..
node server.js        # HTTP on 6007, HTTPS on 6008
# frontend dev (Vite dev server on 6107, proxies /api to 6007):
npm run dev:web       # = cd frontend && npm run dev
# rebuild frontend:
npm run build:web     # = cd frontend && npm run build
# or
npm run dev            # uses nodemon (must be installed globally)
```

Windows: double-click `start.bat` (starts hidden via `start_hidden.vbs`). Stop: `stop.bat`. Linux: `bash deploy.sh`.

## Dual Protocol (HTTP + HTTPS)

Server runs **both protocols simultaneously**:
- **HTTP** on port 6007 (main, browser default)
- **HTTPS** on port 6008 (`PORT + 1`)

Self-signed SSL certificates auto-generated on every startup via `node-forge`. Place real certificates in `ssl/cert.pem` and `ssl/key.pem` for production. If cert generation fails, only HTTP starts.

Certificate files go in `ssl/` directory:
- `ssl/cert.pem` — SSL certificate
- `ssl/key.pem` — SSL private key

## Architecture

- **`server.js`** — Main Express app. All API routes, push logic, alarm auto-push scheduler. Static serving: `dist/` first, `public/` fallback (so the server still works if `dist/` wasn't built). ~1100 lines.
- **`db.js`** — PostgreSQL connection pool (`pg` library). Config in `db_config.json`. Exports both `getPool`/`initPool` and legacy aliases (`initDB`, `testDBConnection`, `loadConfig`, `saveConfig`). Auto-detects config changes and rebuilds pool.
- **`routes/agv.js`** — AGV-specific routes: RCS task queries, site status, alarm history/export, daily task report, cache reload. All routes require `requireLogin` middleware (just checks DB connectivity, NOT authentication). ~1080 lines.
- **`alarm_types.js`** — Alarm type mapping extracted from RCS system. `getAlarmTypeText(mainType, minorType)` converts codes to Chinese names (19 main types).
- **`frontend/`** — Vite + Vue 3 source (`npm run build:web` → `../dist`). Key paths:
  - `src/router/index.js` — hash routes: `/`(home), `/site`, `/task`, `/cancel`, `/alarm`, `/report`, `/dashboard`, `/config`, `/pushlog`, `/db`. Desktop renders non-home routes inside a modal shell; mobile renders them as pages (5 tabs + 更多 menu).
  - `src/layouts/` — `DesktopLayout.vue` (header + hero home + route-modal), `MobileLayout.vue` (gradient header + bottom nav + more-sheet).
  - `src/views/` — 10 shared views (Home, SiteMonitor, TaskQuery, TaskCancel, AlarmQuery, DailyReport, Dashboard, PushConfig, PushLog, DbLogin) used by both layouts.
  - `src/components/` — UI kit: `AppIcon`(inline-SVG icon map in `icons.js`, NO emoji), `AppModal`, `ConfirmHost`+`useConfirm`, `ToastHost`+`toast`, `PickerSelect` (native select on desktop / top-sheet on mobile), `DateRangeField`, `InputClear`, `RadioPills`, `SiteTypeLegend`, `FilterPanel` (collapsible on mobile only), `KpiCard`, badges, `charts/useChart.js` (Chart.js wrapper + noData plugin + auto-destroy).
  - `src/stores/app.js` — reactive global store: DB-configured flag, site-codes/alarm-areas caches (fetched once, shared).
  - `src/api/` — `client.js` (fetch wrapper; throws ApiError on `success:false`), `agv.js`, `admin.js`.
  - `src/styles/` — `tokens.css` (v2 深蓝科技风 design tokens `--brand-*/--ink-*/--line*/--canvas`) + `base.css` (shared component classes).
  - `frontend/public/` — copied verbatim to `dist/`: `favicon.ico`, `mobile-tutorial.html`, `mobile.html` (2-line redirect stub to `/`).
- **`dist/`** — Build output served by Express. Do not edit by hand; rebuild instead.
- **`public/`** — LEGACY inline-JS SPA (index.html/mobile.html/site-status.js). Kept as fallback; superseded by `frontend/`.
- **`service_config.json`** — Runtime config: project name, push webhooks (arrays), intervals, levels, WeChat OA credentials.
- **`push_history.log`** — JSON-lines push history (append-only, used for push dedup). Created on first push; may not exist in a fresh checkout.

## Key Commands

- Start: `node server.js`
- Frontend build: `npm run build:web` (Vite → `dist/`, required after frontend changes)
- Frontend dev: `npm run dev:web` (Vite dev server on 6107, proxies `/api` + `/health` to 6007)
- Dev: `npm run dev` (requires `npm i -g nodemon`)
- Deploy Linux: `bash deploy.sh` (opens firewall port, installs Node if needed, starts with nohup)
- Start Windows: `start.bat` → launches `start_hidden.vbs` for background mode
- Stop Windows: `stop.bat`
- No test suite, no lint, no typecheck configured.

## Multi-Webhook Push

Each platform supports **multiple webhook URLs** stored as arrays in config:
- `webhookUrls[]` — 企业微信
- `dingtalkWebhookUrls[]` — 钉钉
- `feishuWebhookUrls[]` — 飞书
- 微信公众号 uses OpenID list instead

`normalizeWebhookUrls()` handles backward compatibility with old single-URL config format. Push functions accept `(alarm, url)` signature. `doPush()` iterates over all URLs per platform.

## API Routes

| Route | Method | Description |
|---|---|---|
| `/api/agv/alarm-history` | GET | Query alarms with filters (returns `main_type_text`, `minor_type_text`, `elc_map_code_text`, `status_text`, `level_text`, `duration`) |
| `/api/agv/alarm-history/export` | GET | Export alarms as XLS |
| `/api/agv/rcs-tasks` | GET | Query RCS task chains (his/chain/both) with pagination |
| `/api/agv/site-status` | GET | Query site status (carrier, node, site_code) |
| `/api/agv/site-status-by-site-code` | GET | Query single site status by site_code |
| `/api/agv/site-codes` | GET | List all site codes with names |
| `/api/agv/cancel-task` | POST | Cancel a task by task_chain_code |
| `/api/agv/debug-task-status` | GET | Debug endpoint showing task status distribution |
| `/api/agv/alarm-areas` | GET | List alarm areas from cms_elc_map |
| `/api/agv/reload-cache` | POST | Clear and re-warm in-memory caches |
| `/api/agv/daily-task-report` | GET | Daily task report (status distribution, map counts, hourly trend, **carrierStats**: amr_code + task_count) |
| `/api/db-config` | GET/POST | Read/save PostgreSQL connection config |
| `/api/db-config/test` | POST | Test database connection |
| `/api/service-config` | GET/POST | Read/save push settings |
| `/api/config` | GET/POST | Config endpoint (returns webhook arrays) |
| `/api/test-push` | POST | Test push to all enabled platforms (iterates all URLs) |
| `/api/test-wechat-oa` | GET | Test WeChat OA push |
| `/api/test-insert-alarm` | POST | Insert test alarm with random type from mapping |
| `/api/push-history` | GET/DELETE | Query or clear push history |
| `/health` | GET | Health check |

## Database

PostgreSQL. Tables: `cms_alarm_log`, `tas_task_chain_his`, `tas_task_chain`, `tas_site_status`, `cms_site`, `cms_elc_map`, `act_re_procdef`.

Config stored in `db_config.json` (credentials in plaintext — do not commit to version control).

## Frontend Conventions (Vue app, `frontend/`)

- **Vue 3 Composition API, plain JS** (no TS), vue-router with hash history, Chart.js 4 bundled via npm (not CDN).
- **One responsive app, two shells** — `App.vue` picks `DesktopLayout` / `MobileLayout` via `(max-width: 767px)` media query. Views are shared; shells provide chrome. Never re-create desktop/mobile duplicates.
- **Icons: inline SVG only** — all icons come from `src/components/icons.js` via `<AppIcon name="...">`; 禁止使用 emoji（🔍⏳✅❌等）和外部图标库（FontAwesome等）。Site-type tile icons in `SITE_TYPE_ICONS` (储位/工作点/电梯停靠点/巷道头/巷道尾/缓冲区).
- **Design tokens** — `src/styles/tokens.css` defines `--brand-* / --ink-* / --line* / --canvas / --ok / --warn / --err` (v2 深蓝科技风). New styles must use these tokens; shared component classes live in `base.css` (`.btn`, `.ipt`, `.badge`, `.panel`, `.tbl`, `.kpi`, `.rank-*`, `.dash-*`); view-specific styles are `<style scoped>` in each SFC.
- **Dialogs/toasts are singletons** — use `confirmDialog()`/`alertDialog()` from `composables/confirm.js` and `toast()` from `composables/toast.js`. Do not create ad-hoc overlay systems.
- **Pickers** — use `PickerSelect` (auto: native select on desktop, top-sheet on mobile) and `DateRangeField` (quick presets 今天/一周内/最近一月/最近半年). Do not hand-roll native `<select>` styling.
- **Shared data via store** — site codes / alarm areas are cached in `stores/app.js` (`loadSiteCodes()`, `loadAlarmAreas()`, `mapOptions`); fetch once per session, don't re-fetch per view. Map dropdowns always use `map_code` as value.
- **Polling** — use `usePolling()` (auto-clears on unmount); site monitor polls every 30s.
- **API calls** — always via `src/api/*` wrappers (they normalize the `{success,...}` envelope and the three different pagination shapes). Paginated endpoints: alarm-history (`pagination.total_pages`), rcs-tasks (`total`/`totalPages`), push-history (`total_pages`).
- **`amr_code` = 车号(设备号)** — In task tables, `amr_code` is the vehicle/device number. `carrier_code` is the carrier/pallet number (载具编号). Use `amr_code` for vehicle-related displays.
- **Login = DB config** — `/db` route (`DbLoginView`) posts to `/api/db-config`; password is never prefilled (server keeps old password when omitted). On boot, if `/api/db-config` returns no `host`, the app redirects to `/db`.

## Gotchas

- **Frontend must be rebuilt** — server serves `dist/` first and falls back to legacy `public/`. After editing `frontend/`, run `npm run build:web` or the old bundle keeps being served. `frontend/node_modules` and `frontend/dist` are build artifacts.
- **Alarm status derived from `end_date`** — The `alarm_status` field is always NULL in the database. Status is computed: `end_date` present → "告警已恢复", only `begin_date` → "告警开始".
- **Alarm API response fields** — `/api/agv/alarm-history` returns enriched fields: `main_type_text`, `minor_type_text` (alarm type names), `elc_map_code_text` (area name), `status_text`, `level_text`, `duration`. Do NOT use `alarm_detail` or `content` — they don't exist in the response.
- **Push dedup reads file every cycle** — `loadPushedKeys()` reads `push_history.log` on each check to survive process restarts. Don't use in-memory Set alone. Dedup key format: `source_code|begin_date_formatted|push_type`.
- **Push logic**: Only pushes "告警开始" for new active alarms, "告警已恢复" only for alarms we previously pushed "开始" for. Existing ended alarms are ignored. Only checks alarms from last 24 hours.
- **`requireLogin` is not auth** — only checks DB connectivity via `getPool()`.
- **Credentials in config files** — `db_config.json` (DB password), `service_config.json` (WeChat OA appSecret, webhook URLs, DingTalk access_token). Never commit these.
- **No .gitignore** — This repo has no `.gitignore`. If using git, create one covering `node_modules/`, `*.txt`, `db_config.json`, `service_config.json` before first commit.
- **Test insert SQL has 11 params** — `cms_alarm_log` INSERT uses columns (source_code, log_level, main_type_code, minor_type_code, alarm_detail, begin_date, create_time, content, alarm_x, alarm_y, elc_map_code). Both `begin_date` and `create_time` need the same `now` value.
- **Caches need manual reload** — `routes/agv.js` caches site lists, map names, and procdef maps in memory. Use `/api/agv/reload-cache` to refresh after DB changes.
- **Port 6007 default** — Configurable via `service_config.json` `port` field or `PORT` env var. `deploy.sh` uses firewall-cmd/ufw to open this port. HTTPS port is always `PORT + 1` (default 6008).
- **WeChat OA access_token caching** — `getWechatOaAccessToken()` caches token with 5-minute提前 expiry. Token refresh happens automatically on expiry.
- **Feishu webhook format** — Uses `{ msg_type: 'text', content: { text } }` format, success check: `response.data.code === 0`.
- **Push level selection** — Configurable via `pushLevels` array in service_config.json (1=低, 2=中, 3=严重). UI uses styled chip buttons.
- **RCS task API** — `/api/agv/rcs-tasks` queries both `tas_task_chain_his` and `tas_task_chain` tables by default (`table=both`). Returns enriched fields: `start_route_name`, `end_route_name`, `start_map_name`, `end_map_name`, `task_chain_type_name`.
- **One-off fix scripts** — `fix_push_levels.js`, `fix_render.js` are utility scripts that were used to patch HTML files. Not part of normal workflow.
- **`ssh2` dependency is unused** — Declared in package.json but not required by any source file. `xlsx` is used in `server.js` for the alarm export.
