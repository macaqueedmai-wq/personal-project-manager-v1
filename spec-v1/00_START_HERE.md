# 個人項目管理平台規格包使用說明

2026年11月1日版本。這個規格包供你交給VS Code中的開發助手，從零建立可在電腦使用、之後部署上雲的個人管理平台。已先調查GitHub參考；尚未建立應用程式、遠端repository或雲端服務。

## 檔案用途

- 04_REFERENCES.md：九個GitHub參考、核實來源、採用與排除原因。
- 01_SPEC.md：完整功能、頁面、資料結構、API、日期、登入、備份與部署規格。
- 03_ACCEPTANCE.md：可逐項執行的第一版驗收案例。
- 02_PROMPTS.md：啟動、M2至M6、續接、修正及獨立審查提示詞。
- PRODUCT.md：短版產品背景，方便長對話或換模型後繼續。

## 交給VS Code的方法

1. 建立一個空的 personal-project-manager 資料夾，並用VS Code開啟。
2. 在裏面建立 docs/spec-v1/，將本包所有Markdown檔放入該資料夾。
3. 在你使用的開發助手中確認可讀取這些檔案；如需附加檔案，先附01_SPEC、03_ACCEPTANCE、04_REFERENCES及PRODUCT。
4. 複製02_PROMPTS的「啟動提示詞」，讓模型完成M1並交付可運行的第一個階段。
5. 檢查其實際運行及測試回報，再依次送M2至M6。每階段都沿用現有工程，不開另一個同名專案。
6. 最後使用獨立審查提示詞。程式完成後，再提供你的GitHub repository及雲端目標，另行安排推送和部署。

這些路徑是交付包的放置約定。若你自行改放其他位置，請同步修改提示詞中的docs/spec-v1/；不要讓模型憑檔名猜測已讀到內容。

## 本版採用的路線

自建一個統一的輕量網頁系統，借鑑Super Productivity的每日流程、Vikunja的任務視圖、Job Application Tracker的申請跟進、Monica的人物紀錄、Beaver Habits的打卡模型。不直接拼接多套服務。

技術預設為React/TypeScript/Vite + Express + PostgreSQL。本機開發與雲端沿用同一資料庫類型；登入、資料持久化、備份和部署在第一版規格內。GitHub只放程式及虛構測試資料，實際任務、履歷、聯絡人、備份和密鑰另存。

完整規格可以分六個階段實作，但「只完成M1」不是「完成整個第一版」。每階段的完成證據應寫入開發工程的docs/BUILD_LOG.md，驗收案例未執行時只能標示未驗證。
