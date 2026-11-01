# 雲端部署（第一版）

本文件記錄目前實際部署方式。M1–M6 功能已實作，雲端使用同一套 Docker Compose + Caddy 部署；上線更新時必須先跑 migration，再重建應用容器。應用層 JSON 匯出／還原已可在 `/settings` 使用，但 `sslip.io` 仍是臨時網域，正式個人資料上線前應換成自有網域、完成主機重開機與 A33/A35 等未驗證項目。

## 實際部署狀態（2026-11-01）

- 已部署：<https://ppm.43-161-239-58.sslip.io>（Let's Encrypt HTTPS）
- 目前雲端版本：M1–M6 功能；部署後需以 `npm run build`／Docker build 重建並套用 migration 003–007
- Compose project：`ppm`；目錄 `/opt/personal-project-manager`
- `ppm-ppm-app-1` healthy，非 root `uid=10001(app)`；`ppm-db-1` healthy，volume `ppm_pgdata`
- 應用與資料庫都沒有公開 host port；主機只開 22／80／443
- 既有 `hear-you-are-caddy-1` 只被追加一個 site block；原 Caddyfile 備份在 `/root/hear-you-are/deploy/Caddyfile.bak-20261101-191609`
- 既有 `hear-you-are` 站點部署前後都回 401（原有 basic auth），未被替換
- 一次性擁有者密碼只存在本機 `.deploy/owner-password.txt`（gitignored）；不要把值貼到聊天或提交
- 本輪建立了一次性 SSH 部署金鑰 `.deploy/ppm_deploy`，公鑰已加入伺服器 `ubuntu` 的 `~/.ssh/authorized_keys`。若不再需要更新，請從伺服器移除該公鑰並刪除本機私鑰；不要把私鑰提交或上傳到其他位置
- 登入、Cookie `Secure`／`HttpOnly`／`SameSite=Lax`、任務建立／讀回、缺少與外站 Origin 403、重建應用容器、重建資料庫容器、Session 跨應用重啟、Caddy 憑證都有實測證據（見 `docs/BUILD_LOG.md`）；M2–M6 的本機驗證見同一紀錄
- 已重建應用映像並 force recreate 應用容器、重建 DB 容器（保留 `ppm_pgdata`），任務仍存在；應用容器重啟後同一個 PostgreSQL Session 仍有效
- 尚未測試主機重開機；容器使用 `restart: unless-stopped`，但重開機行為仍屬未驗證
- `sslip.io` 只是臨時 DNS，不是自有網域；正式使用前要換掉

> 追加 Caddy block 前務必先執行 `grep -c 'ppm\.43-161-239-58\.sslip\.io' /root/hear-you-are/deploy/Caddyfile`；目前應為 `1`，重複 append 會產生重複 site block。任何 Caddyfile 修改都要先備份、`caddy validate` 成功後才 reload。

## 目前環境

- Tencent Cloud Lighthouse：`lhins-c6qbxc4h`，ap-hongkong，Ubuntu 24.04.4
- 公開 IP：`43.161.239.58`
- 主機已有 Docker 29.9／Compose v5.6，以及既有 `hear-you-are` Compose 專案與 Caddy（佔用 80/443）
- 本專案使用獨立 Compose 專案：`ppm`
- 資料庫：PostgreSQL 17（`postgres:17.6-bookworm`），只在 Docker 內部網路，沒有公開連接埠
- 應用：Node 24.14.1（非 root `app` 使用者），只在 Docker 內部網路，沒有公開連接埠
- 反向代理：**沿用既有 Caddy**，以新增 site block 的方式代理到 `ppm-app:3000`
- 臨時 HTTPS 網址：`https://ppm.43-161-239-58.sslip.io`
  - 這是 `sslip.io` 的臨時 DNS，不是使用者擁有的網域；IP 變更或 sslip.io 政策改變時會失效。
  - 正式使用前應換成自有網域，並同步修改 `PUBLIC_ORIGIN` 與 Caddy site block。

## 檔案

- `Dockerfile`：多階段建置，runtime 只包含 production 依賴、`dist/`、`migrations/`，以非 root 執行
- `compose.yaml`：`db` 與 `ppm-app`，使用 named volume `ppm_pgdata`；`ppm-app` 加入既有 `hear-you-are_default` 網路別名 `ppm-app`
- `deploy/Caddyfile.ppm`：要附加到既有 Caddyfile 的獨立站點 block
- `.dockerignore`：排除 `.env`、`.deploy`、`node_modules`、`dist`、報告與規格文件

## 伺服器目錄與設定

專案放置於 `/opt/personal-project-manager`。`.env` 只存在伺服器（權限 600）或本機 `.deploy/`，不可提交。

`.env` 需要的值：

```dotenv
NODE_ENV=production
PORT=3000
APP_TIMEZONE=Asia/Hong_Kong
PUBLIC_ORIGIN=https://ppm.43-161-239-58.sslip.io

POSTGRES_DB=personal_project_manager
POSTGRES_USER=ppm
POSTGRES_PASSWORD=<random-hex>
DATABASE_URL=postgres://ppm:<same-password>@db:5432/personal_project_manager

ADMIN_PASSWORD_HASH=<bcrypt-hash>
SESSION_SECRET=<random-64-hex>
TRUST_PROXY_HOPS=1
```

`ADMIN_PASSWORD_HASH` 應以 `npm run auth:hash` 產生。不要使用 `.env.example` 的佔位值，也不要把密碼、雜湊或 Session secret 貼進聊天或提交到 Git。

## 本機產生設定與上傳

在本機專案根目錄（PowerShell）：

```powershell
$env:PUBLIC_ORIGIN = 'https://ppm.43-161-239-58.sslip.io'
node scripts/generate-deploy-env.mjs
# 產生 .deploy/production.env（DB 密碼、Session secret、ADMIN_PASSWORD_HASH）
# 與 .deploy/owner-password.txt（一次性擁有者密碼；不要貼到聊天）

tar -czf .deploy/ppm-source.tgz `
  --exclude=node_modules --exclude=dist --exclude=.deploy `
  --exclude=test-results --exclude=playwright-report --exclude=coverage `
  --exclude=.env .

scp -i .deploy/ppm_deploy .deploy/ppm-source.tgz .deploy/production.env `
  ubuntu@43.161.239.58:/tmp/
```

`production.env` 內 `ADMIN_PASSWORD_HASH` 會以單引號包住，避免 Docker Compose 的 env_file 解析 `$2b$...` 時出錯。上傳後在伺服器解壓到 `/opt/personal-project-manager`，把 `production.env` 安裝為 root 600 的 `.env`，再依下方步驟建置。`.deploy/`、`.env` 與 tar 都已被 `.gitignore`／`.dockerignore` 排除。

## 首次部署步驟（伺服器）

```bash
cd /opt/personal-project-manager

# 1. 建置；不會啟動任何服務
sudo docker compose build

# 2. 套用 migration；資料庫由 compose 的 db service 提供
sudo docker compose run --rm ppm-app node dist/scripts/migrate.js

# 3. 啟動
sudo docker compose up -d

# 4. 檢查
sudo docker compose ps
sudo docker compose exec ppm-app node -e "fetch('http://127.0.0.1:3000/readyz').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
curl -fsS https://ppm.43-161-239-58.sslip.io/readyz
```

`ppm-app` 啟動時會檢查 `schema_migrations`；若未先跑 migration 會明確失敗，不會自動改寫資料庫。

## Caddy 增加站點（additive）

既有 Caddyfile 位於 `/root/hear-you-are/deploy/Caddyfile`，由 `hear-you-are-caddy-1` 使用。部署前先備份：

```bash
sudo cp -a /root/hear-you-are/deploy/Caddyfile \
  /root/hear-you-are/deploy/Caddyfile.bak-$(date +%Y%m%d-%H%M%S)

# 把 deploy/Caddyfile.ppm 的內容附加到既有 Caddyfile
sudo sh -c 'cat /opt/personal-project-manager/deploy/Caddyfile.ppm >> /root/hear-you-are/deploy/Caddyfile'

# 先驗證再 reload；若驗證失敗，恢復備份
sudo docker exec hear-you-are-caddy-1 caddy validate \
  --config /etc/caddy/Caddyfile --adapter caddyfile
sudo docker exec hear-you-are-caddy-1 caddy reload \
  --config /etc/caddy/Caddyfile --adapter caddyfile
```

不要刪除或改寫原有 `{$HYA_DOMAIN}` site block；新增站點使用不同的 hostname。Caddy reload 是優雅的，但如果驗證失敗，應立即用備份恢復並重新 reload。

## 更新應用

```bash
cd /opt/personal-project-manager
sudo docker compose build ppm-app
sudo docker compose run --rm ppm-app node dist/scripts/migrate.js
sudo docker compose up -d ppm-app
```

應用容器重建不會刪除 `ppm_pgdata`。不要執行 `docker compose down -v`，除非明確要刪除資料庫。

## 備份（應用層與資料庫層）

### 應用層 JSON（建議日常使用）

登入 `/settings`：

1. 「下載完整備份」取得 UTF-8 JSON；檔名使用香港時間。
2. 還原時上傳同一 JSON，系統先完整驗證並顯示筆數。
3. 必須先下載「目前資料備份」，再輸入「還原」及擁有者密碼。
4. 成功後所有 Session 失效，需重新登入；失敗會整體 rollback。

備份不包含 Session、密碼、密鑰、migration、`system_state`、還原 token，也不包含連結指向的實體文件。

### 資料庫層 pg_dump（緊急回復）

先把 PostgreSQL dump 存到伺服器以外：

```bash
cd /opt/personal-project-manager
sudo docker compose exec -T db pg_dump -U ppm -d personal_project_manager \
  | gzip > /tmp/personal-project-manager-$(date +%Y%m%d-%H%M%S).sql.gz
```

下載到本機後再刪除 `/tmp` 的副本。這個 dump 含真實業務資料，不可提交到 Git，也不可放在公開位置。

## 還原資料庫（緊急用）

```bash
gunzip -c <backup>.sql.gz | sudo docker compose exec -T db \
  psql -U ppm -d personal_project_manager
```

還原前先停止 `ppm-app`，備份現況，並確認目標資料庫正確。這是資料庫層操作，不是 `/settings` 的應用層還原流程；應用層還原會另外更換 `data_epoch` 並清除 Session。

## 更換擁有者密碼

在專案目錄使用 runtime 內的編譯腳本產生新雜湊（互動輸入不會回顯）：

```bash
sudo docker compose run --rm ppm-app node dist/scripts/auth-hash.js
```

把輸出的 `ADMIN_PASSWORD_HASH` 更新到 `.env`，再 `sudo docker compose up -d ppm-app`。舊 Session 會因憑證指紋變更而失效。

## 監看與限制

```bash
sudo docker compose ps
sudo docker compose logs -f ppm-app
sudo docker compose logs -f db
sudo docker exec hear-you-are-caddy-1 caddy list-modules | head
```

- 只開放 80/443 給 Caddy；應用與 PostgreSQL 沒有 host port。
- 資料庫 volume 與既有 `hear-you-are` 完全分開。
- `sslip.io` 是臨時方案；正式上線請使用自有網域、更新 `PUBLIC_ORIGIN`、Caddy 設定，並重新驗證登入 Cookie、CSRF 與 HTTPS。
- 應用層 JSON 備份還原已實作；沒有自動排程備份。CI workflow 已加入 repo，但本輪未連接遠端 GitHub，未取得真實 Actions 執行證據；主機重開機與部分時序驗收仍為未驗證，詳見 `docs/BUILD_LOG.md`。
