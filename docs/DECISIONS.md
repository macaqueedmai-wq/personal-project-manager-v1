# 實作決定紀錄（DECISIONS）

本檔記錄 M1 期間由實作者自行決定、需要讓後續階段知道的工程選擇。規格本身仍是需求依據；若本檔與 `docs/spec-v1/01_SPEC.md` 衝突，以規格為準並修正程式。

## D-001 規格檔位置

- 交付包原本在專案根目錄 `spec-v1/`。提示詞約定使用 `docs/spec-v1/`，因此已複製一份到 `docs/spec-v1/` 作為工作副本；根目錄 `spec-v1/` 保留為使用者原始交付包，不刪除。
- 後續階段以 `docs/spec-v1/` 為準；若兩份內容不同，先向使用者確認，不自行猜測。

## D-002 執行環境與依賴版本

- 本機為 Windows、Node.js 24.14.1、npm 11.11.0；`.node-version` 與 `package.json` 的 `engines` 鎖定 Node 24。
- 採用 TypeScript **5.9.3**，不採用當時最新的 TypeScript 7：`typescript-eslint` 8.x 的 peer 範圍是 `<6.1.0`，且既有工具鏈對 TS 7 相容性未經驗證。
- 採用 Vite **7.3.7** 與 `@vitejs/plugin-react` **5.2.0**：Vite 8 使用不同的外掛／轉換管線（peer 需要 `oxc-transform-react` 等），在 M1 沒有必要承擔額外風險。Vitest 5 支援 Vite 7。
- React 19.3.1、React Router 7.18.5、TanStack Query 5.105.0、Express 5.3.0、Zod 4.6.7、pg 8.23.1、bcryptjs 3.0.3；全部使用精確版本並提交 `package-lock.json`。

## D-003 SQL migration 方式

- 使用自建的小型 migration runner（`server/db/migrate.ts`）讀取 `migrations/NNN_name.sql`，而不是引入 ORM 或另一套 migration 框架。
- 特性：PostgreSQL advisory lock 防止並行套用、`schema_migrations` 記錄 checksum、已套用檔案被修改時直接失敗、每個檔案在獨立交易內套用。
- 讀取 SQL 時會先把 CRLF 正規化為 LF，再計算 checksum；`.gitattributes` 亦固定文字檔為 LF，避免 Windows 與 Linux 檢出的 checksum 不同。
- migration 檔名可含小寫字母、數字、底線與連字號；檔案必須依名稱排序執行，已套用的檔案不可改寫，變更需新增下一個 migration。

## D-004 M1 資料表範圍

M1 只建立目前真的會用到的表，避免先建大量空殼：

- `areas`、`system_state`、`projects`、`tasks`、`sessions`。
- `projects` 先建基本欄位，供 M2 的項目 CRUD 使用；`tasks` 的 `contact_id`／`event_id` 尚未加入，會在 M4 以新 migration 加欄位與外鍵。
- `application`、`course_details`、`events`、`contacts`、`resources`、`habits`、`health_entries`、`daily_focus` 等表留待對應里程碑，不預先建立沒有行為的空表。
- 所有可編輯主表已有 `version`、`created_at`、`updated_at`、`archived_at`；`tasks` 的完成時間與狀態一致性由 CHECK 約束維持。
- 日期欄位以 PostgreSQL `DATE` 保存；`pg` 的 DATE parser 被明確覆寫為回傳字串，避免 JS `Date` 造成 UTC 午夜偏移。

## D-005 工作區 revision／epoch 與寫入鎖

- `system_state` 只有一列（id=1），保存 `revision BIGINT` 與 `data_epoch UUID`，在 M1 就建立，避免 M6 還原功能到時才補上跨表協定。
- 所有業務寫入從 M1 起使用同一協定：`BEGIN` → `SELECT ... FOR UPDATE` 鎖定 `system_state` → 比對呼叫端送來的 `X-Workspace-Epoch` → 執行寫入 → `revision + 1` → `COMMIT`。
- Session 也保存登入時的 `data_epoch`；每個受保護請求會重新讀取目前 epoch，不符即銷毀 Session 並回 401。
- M1 的 `POST /tasks` 已要求 `X-Workspace-Epoch`；M2 的 PATCH 會在這個基礎上加入實體 `version` 比對。

## D-006 登入與 Session

- 單一擁有者密碼，`ADMIN_PASSWORD_HASH` 為 bcrypt 雜湊，由 `npm run auth:hash` 以隱藏輸入互動產生；不提供預設密碼、註冊或忘記密碼。
- Session 存在 PostgreSQL（`sessions` 表由 migration 建立，`connect-pg-simple` 不自動建表）；Cookie 名為 `ppm.sid`，`HttpOnly`、`SameSite=Lax`、`path=/`，正式環境 `Secure`。
- 七日閒置到期採 `rolling: true` 與 `maxAge`；登入時 `regenerate`，登出時銷毀 Session。
- Session 另存密碼雜湊指紋；`ADMIN_PASSWORD_HASH` 改變後，舊 Session 立即失效（已用整合測試驗證）。
- 已登入請求也會比對 Session 的 `data_epoch` 與資料庫目前值，為 M6 還原後強制重新登入鋪路。

## D-007 Origin 與 CSRF

- 所有非安全方法（POST/PUT/PATCH/DELETE）都要求 `Origin` 等於 `PUBLIC_ORIGIN`，登入端點也不例外；缺少或外站來源回 403。
- 登入後的改寫另外要求 `X-CSRF-Token`，token 由伺服器產生、存在 Session，並以 timing-safe 比較。登入本身尚無 Session token，因此只依賴 Origin，符合規格「已登入改寫另驗證 CSRF」的描述。
- 開發時 `PUBLIC_ORIGIN` 必須是 Vite 的 `http://127.0.0.1:5173`（Vite 代理 `/api` 到 3000）；正式環境必須是實際 HTTPS 網域。

## D-008 登入失敗限流

- 使用單一程序內的 Map，每 IP 15 分鐘最多 10 次失敗，超過後回 429 並附 `Retry-After`。
- 這是本版單人、單一應用容器部署的合理簡化；若未來水平擴展，需要改用共享儲存（例如 PostgreSQL 表）。此限制已記錄，不改用 Redis 以免增加未列入規格的基礎設施。
- `TRUST_PROXY_HOPS` 由環境設定，`app.set('trust proxy', n)` 不無條件信任所有轉發標頭。

## D-009 香港日期

- 不引入 Luxon；以 Node 與瀏覽器都支援的 `Intl.DateTimeFormat`（`Asia/Hong_Kong`）取得香港日期與顯示時間。
- 純日期（`planned_on`、`due_on`、`follow_up_on`）一律以 `YYYY-MM-DD` 字串處理，不經 UTC 午夜轉換；`due_at` 等時間點以 `TIMESTAMPTZ` 保存，輸出 ISO 8601（`Z`）。
- 日期格式化與 `isValidIsoDate` 放在 `shared/dates.ts`，前後端共用。

## D-010 七領域種子

- 七個領域由 `migrations/002_seed_areas.sql` 以 `INSERT ... ON CONFLICT DO NOTHING` 種入，並在 migration 檢查總數為 7；固定 ID 另有 CHECK。
- 不提供新增／刪除／改名領域的 API 或 UI；名稱不是關聯鍵。重跑 migration 不重複、不覆寫既有資料。

## D-011 M1 介面範圍

- 導覽只放真的可用的「總覽」與「收件箱」，避免可點擊的空殼。專案、日曆、聯絡人、文件、搜尋、設定等入口留待對應里程碑。
- 七領域在總覽側欄以唯讀清單呈現，資料來自 `GET /api/v1/areas`，用來證明種子確實存在；篩選功能在 M2 加入。
- 快速新增只送標題；表單失敗保留輸入、成功顯示 `aria-live` 訊息、送出中停用按鈕。
- 登入頁與工作台提供載入、錯誤、空結果狀態；沒有假資料或前端記憶體冒充持久化。

## D-012 測試資料庫策略

- 整合測試與 E2E 需要真實 PostgreSQL。若環境有 `TEST_DATABASE_URL` 就使用該獨立測試庫；否則使用 `embedded-postgres`（開發依賴，僅測試用）在暫存目錄啟動真實 PostgreSQL 18 叢集。
- `embedded-postgres` 是 beta 版（18.6.0-beta.19），只作本機測試工具，不是產品執行依賴；雲端已改用 `postgres:17.6-bookworm` 容器，CI 仍待 M6 補上。
- 測試從不讀取真實個人資料；所有標題與帳號皆為虛構。測試資料庫每次使用暫存目錄，結束後刪除。
- Playwright 使用本機安裝的 Google Chrome（`channel: 'chrome'`），跑在已建置的應用與獨立測試庫上。

## D-013 API 錯誤格式與驗證

- 成功：`{ data, meta? }`；失敗：`{ error: { code, message, fieldErrors? } }`，訊息為繁體中文，不回傳堆疊或資料庫連線資訊。
- Zod 4 的 `strictObject` 拒絕未知欄位；`unrecognized_keys` 會轉成對應欄位的錯誤，避免未知欄位被靜默忽略。
- `uuidSchema`、分頁參數、標題長度等共用 schema 放在 `shared/schemas.ts`，伺服器與前端共用契約。

## D-014 建置與執行方式

- 單一 npm 專案；前端 Vite root 是 `client/`，輸出 `dist/client`；伺服器以 `tsc` 輸出 `dist/server`，正式啟動為 `node dist/server/index.js`，由 Express 提供前端與 API。
- 伺服器使用 ESM（`"type": "module"`）與 NodeNext 模組解析，相對匯入帶 `.js` 副檔名；測試與 client 使用 Vite 的 Bundler 解析。
- `npm run dev` 以 concurrently 同時啟動 tsx watch 與 Vite；`npm start` 需要先 `npm run build`，且正式環境 `PUBLIC_ORIGIN` 必須是 HTTPS。
- Vite 的 `/api` 代理需要繞過前端原始碼檔（例如 `/api/client.ts`）；否則 `client/api/` 的模組會被當成 API 送到 Express，開發模式出現空白頁。`vite.config.ts` 的 `bypass` 只把帶 `.ts/.tsx/.css/.map` 等副檔名的請求交回 Vite，真正的 `/api/v1/...` 仍代理至 Express。
- 本機 `.env` 由 Node 內建 `process.loadEnvFile()` 讀取，不額外引入 dotenv；缺少 `.env` 不報錯，但必要變數缺失會明確啟動失敗。

## D-015 里程碑範圍（現況）

M1 刻意只建立真的可用的骨架；M2–M6 已相繼實作：

- M2：項目 CRUD、任務 PATCH／分類／日期／今日重點、總覽。
- M3：課程與學位／職位申請、階段歷史、結果規則、回執。
- M4：事件、日曆、聯絡人、互動、文件連結與跨領域關聯。
- M5：習慣、健康、搜尋、標籤、封存／恢復、完整空錯狀態。
- M6：JSON 匯出／還原、CI workflow、Docker、部署文件與完整驗收紀錄。

沒有 `db:seed:demo` 指令，因此正式資料庫不會被示範資料覆寫。

## D-018 M4–M6 工程決策

- **日曆**：以合併後的 `CalendarOccurrence` DTO 回傳；活動、任務安排／截止、項目／申請截止、報名截止與聯絡提醒共用同一時間軸。任務同一日同時安排及截止合併為一筆，`occurrenceTypes` 保留原因，不重複顯示。
- **文件連結**：`resources.target` 只保存文字；`web_link` 在 API 與 DB 約束雙重驗證 http/https，`local_path` 不提供任何伺服器讀檔端點。關聯表用 partial unique index 防止重複關聯。
- **習慣打卡**：`habit_entries` 以 `(habit_id, local_date)` 主鍵保證每日最多一筆；PUT 為冪等 upsert，重複相同狀態不重複計次。未來日期、開始前及結束後日期由服務拒絕；修改頻率不刪舊紀錄。
- **健康**：睡眠以醒來日 `local_date` 記錄，partial unique index 限制同一天一筆睡眠；運動可同日多筆。健康紀錄與習慣打卡沒有交叉自動寫入。
- **搜尋**：使用參數化 ILIKE 涵蓋主要業務表，回傳類型、領域及封存狀態；`limit` 上限 200；預設排除封存，明確切換才包含。
- **備份格式**：UTF-8 JSON、`format=personal-project-manager`、`schemaVersion=1`，`data` 以資料表名稱保存完整業務列（snake_case、UUID、version、日期與封存欄位）。不包含 `sessions`、`restore_tokens`、`system_state`、migration、密碼或密鑰。
- **匯出快照**：使用 PostgreSQL `REPEATABLE READ READ ONLY` 交易讀取所有表及 `system_state`，確保申請階段與歷史不會一新一舊。
- **預覽驗證**：先以嚴格 Zod 結構與欄位檢查，再在會 rollback 的交易內實際刪除／插入一次，讓 DB 的 FK、unique、CHECK、日期與申請階段規則全部參與驗證；預覽不改 revision、不產生可用 token。
- **還原 token**：隨機 32 bytes，只在 DB 保存 SHA-256；綁定 Session ID、檔案 SHA-256、目前 revision、`data_epoch` 及 10 分鐘期限。每次預覽會作廢同 Session 的舊未用 token；下載現況成功後記錄 `downloaded_revision`。
- **還原**：multipart 上傳原檔，鎖定 `system_state`，重驗 token／epoch／revision／期限／下載標記／密碼及原始位元組 hash；單一交易按外鍵順序刪除及插入，成功後更換 `data_epoch`、遞增 revision、刪除所有 Session 並使 token 失效。任何錯誤 rollback。
- **測試專用失敗注入**：`NODE_ENV=test` 且設定 `PPM_TEST_RESTORE_FAIL` 時，可在刪除後、插入中或提交前製造錯誤；production 分支不啟用，也不接受 API 參數。A29 已用此機制驗證 rollback。
- **CI**：`.github/workflows/ci.yml` 在 Ubuntu + Node 24 執行 lint、typecheck、單元、整合（embedded PostgreSQL）及 Playwright Chromium；目前未連接真實 GitHub remote，因此 workflow 尚未實際執行。

## D-016 不在本版加入的東西

- 沒有 AI／模型 API、聊天助手、外部日曆或招聘網站同步、背景推播、附件上傳、富文字編輯器、拖拉看板。
- 不引入 WebSocket、Redis、微服務或第二套 UI 框架。

## D-017 雲端部署架構（M1 預覽）

- 部署目標：Tencent Cloud Lighthouse `lhins-c6qbxc4h`（ap-hongkong，Ubuntu 24.04.4），專案目錄 `/opt/personal-project-manager`，Compose project `ppm`。
- 主機已有 `hear-you-are` 專案及其 Caddy 佔用 80/443。**不替換、不重啟既有應用**；只備份既有 Caddyfile，追加一個獨立 hostname 的 site block，並以 `caddy validate` → `caddy reload` 套用。既有站點部署前後都回原本的 401。
- 新應用使用獨立 Compose 專案、獨立 `ppm_pgdata` volume 與獨立 DB；不與既有專案共用資料。應用服務名為 `ppm-app`（避免與既有 `app` DNS 名稱衝突），只加入既有 `hear-you-are_default` 網路並使用唯一 alias `ppm-app` 供 Caddy 反向代理。
- 應用與 PostgreSQL 都不發布 host port；主機只開 22/80/443。Caddy 終止 TLS，應用收到 `TRUST_PROXY_HOPS=1`。
- 映像使用多階段建置，runtime 以 `uid=10001(app)` 非 root 執行、`read_only`、`cap_drop: ALL`、`no-new-privileges`；只複製 production 依賴、`dist/`、`migrations/`。`.dockerignore` 排除 `.env`、`.deploy` 等秘密與測試輸出。
- 還沒有自有網域，因此用 `sslip.io` 的 `ppm.43-161-239-58.sslip.io` 作臨時 HTTPS 主機；Let's Encrypt 憑證實際取得成功。這是預覽方案，IP 或 sslip.io 政策變更會失效；正式使用前必須換成自有網域，同步修改 `PUBLIC_ORIGIN`、Caddy block 與登入驗證。
- 秘密由 `scripts/generate-deploy-env.mjs` 在本機 `.deploy/` 產生：DB 密碼、Session secret、一次性擁有者密碼與 bcrypt 雜湊。`.deploy/` 已 gitignore；伺服器 `.env` 為 root 600；回報與日誌不顯示秘密值。擁有者密碼可由使用者登入後依 `docs/DEPLOYMENT.md` 更換。
- 目前提供 M6 應用層 JSON 匯出／還原，以及資料庫層 `pg_dump` 操作說明；沒有自動排程備份。
- 本輪仍未建立 Git remote／沒有 push；已加入 GitHub Actions workflow，但尚未在真實遠端執行，因此 A33 只算部分完成／未驗證。
