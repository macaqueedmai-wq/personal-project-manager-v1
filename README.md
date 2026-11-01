# 個人工作台（Personal Project Manager）

單一使用者的繁體中文個人項目管理平台。第一版目標是把學業、申博申碩、香港求職實習、深圳實習、健康運動、社交與外展活動集中在同一個工作台，資料保存在 PostgreSQL，可部署上雲。

目前進度：**M1–M6 功能已實作**，包括項目／申請、任務與每日重點、活動／人物／文件、日曆、習慣／健康、搜尋、封存與應用層 JSON 匯出／還原、Docker、CI 與驗收紀錄。已部署到 Tencent Lighthouse：<https://ppm.43-161-239-58.sslip.io>（臨時 sslip.io 網域，不是自有網域）。

> 驗收狀態以 `docs/BUILD_LOG.md` 為準：本機單元／整合／E2E 已通過；需要真實遠端 CI、自有網域、主機重開機及部分極端時序的驗收項目仍標示「未驗證」，不能因功能存在就宣稱全部完成。

## 技術

- React 19 + TypeScript + Vite 7，React Router、TanStack Query
- Node.js 24 + Express 5
- PostgreSQL（必填；所有業務資料都由伺服器寫入資料庫）
- express-session + connect-pg-simple、bcryptjs
- Vitest、Supertest、Playwright

## 需求

- Node.js **24.14.1**（見 `.node-version`）
- PostgreSQL 17 或以上（本機或 Docker Compose）
- 可選：Docker Desktop，用於容器交付

### 建立本機資料庫

以下命令在 PostgreSQL 管理員連線中執行一次（請自行更換密碼）：

```sql
CREATE ROLE ppm LOGIN PASSWORD 'CHANGE_ME';
CREATE DATABASE personal_project_manager OWNER ppm;
```

## 本機啟動

```powershell
npm ci
Copy-Item .env.example .env
npm run auth:hash          # 互動輸入密碼，取得 ADMIN_PASSWORD_HASH
# 編輯 .env，填入 DATABASE_URL、ADMIN_PASSWORD_HASH、SESSION_SECRET
npm run db:migrate
npm run dev                # API 127.0.0.1:3000 + Vite 127.0.0.1:5173
```

開啟 <http://127.0.0.1:5173>，以設定的擁有者密碼登入。

> `.env` 不可提交。`npm run auth:hash` 不會回顯密碼，只輸出 bcrypt 雜湊。
> 開發時 `PUBLIC_ORIGIN` 必須是 `http://127.0.0.1:5173`，因為登入與改寫請求會驗證 Origin。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 開發模式（API + Vite） |
| `npm run build` | 型別檢查、建置前端及伺服器到 `dist/` |
| `npm start` | 以建置產物啟動（需先 `npm run build`） |
| `npm run typecheck` | 前端與伺服器 TypeScript 檢查 |
| `npm run lint` | ESLint |
| `npm test` | 單元測試（日期、驗證、設定、限流） |
| `npm run test:integration` | 建置後以真實 PostgreSQL 跑整合測試 |
| `npm run test:e2e` | 建置後以 Playwright（Chrome）跑瀏覽器流程 |
| `npm run db:migrate` | 套用 `migrations/` 內未執行的 SQL |
| `npm run auth:hash` | 互動產生 `ADMIN_PASSWORD_HASH` |

`npm start` 只提供已建置產物，並要求 `NODE_ENV=production` 與 HTTPS 的 `PUBLIC_ORIGIN`；目前已由 Docker + Caddy 在雲端以 production 模式運行。應用層 JSON 匯出／還原在 `/settings`；完整備份不含 Session、密碼、密鑰、migration、system_state、預覽 token 或連結指向的實體附件。

## 雲端預覽

- 網址：<https://ppm.43-161-239-58.sslip.io>
- 一次性擁有者密碼：本機 `.deploy/owner-password.txt`（gitignored；不要把值貼到聊天；如已外洩請更換）
- 資料庫只在 Docker 私人網路，應用與 DB 沒有公開 port；Caddy 只開放 80/443
- 可在 `/settings` 下載 JSON 備份及經預覽確認的整體還原；雲端另有 `pg_dump` 操作說明
- 詳細設定、更新、備份與更換密碼方式見 `docs/DEPLOYMENT.md`
- 臨時 `sslip.io` 網域在正式使用前應換成自有網域，並同步更新 `PUBLIC_ORIGIN` 與 Caddy

整合測試若未設定 `TEST_DATABASE_URL`，會自動在暫存資料夾啟動 `embedded-postgres`；若已設定，必須指向**獨立的測試資料庫**，不要指向正式資料。

## 已實作（M1–M6）

- 工作區骨架、鎖定依賴、SQL migration（advisory lock + checksum）、七個固定領域
- 單人密碼登入、PostgreSQL Session、Origin／CSRF、登入失敗限流、`data_epoch` 失效機制
- 項目：一般／課程／學位申請／職位申請；階段歷史、結果規則、回執、下一步、相關領域與人物
- 任務：快速新增、編輯、項目／領域、安排／截止／跟進、每日最多三項重點、版本衝突、封存
- 活動、人物、互動時間線、文件連結、本機路徑文字、跨項目／任務／活動／人物關聯
- 日曆：活動、任務安排／截止、項目／申請截止、報名截止、聯絡提醒；香港時區
- 習慣：每日／每週頻率、冪等打卡、補記與清除、範圍驗證；健康：運動／睡眠／備註
- 全文搜尋、篩選、封存資料頁、固定 zh-HK／Asia/Hong_Kong 設定
- 應用層 JSON 匯出（一致性快照）、完整預覽驗證、短效 token、現況備份下載、確認密碼與原子還原
- Dockerfile、Compose、非 root runtime、Caddy HTTPS、`.github/workflows/ci.yml`
- 單元、真實 PostgreSQL 整合、Playwright E2E 測試

尚有限制：`sslip.io` 為臨時網域；未有自有網域、遠端 Git remote、實際 GitHub Actions 執行或主機重開機證據；A27／A29／A30／A33／A35 等需要額外時序、遠端或乾淨檢出的項目仍以 `docs/BUILD_LOG.md` 標示為未驗證。

## 文件

- `docs/spec-v1/`：規格、驗收、參考與提示詞（工作副本）
- `docs/DECISIONS.md`：實作決定與理由（含雲端架構及 M4–M6 備份決策）
- `docs/BUILD_LOG.md`：實際完成內容、本機與雲端測試證據、未驗證項目
- `docs/DEPLOYMENT.md`：Tencent Lighthouse 部署、Caddy additive 設定、更新、備份與更換密碼
