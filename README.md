# 智慧溫室農場管理網站

這是一個本機管理版靜態網站，適合在固定管理電腦上填寫與保存智慧溫室管理資料。

資料使用瀏覽器 `localStorage` 儲存在本機裝置，不會上傳到雲端，也不會與其他手機或電腦同步。

## 網站檔案

- `index.html`
- `styles.css`
- `script.js`
- `assets/`

部署時請上傳整個 `管理網站` 資料夾內的內容。

## 本機使用

直接用瀏覽器開啟 `index.html` 即可使用。建議固定使用同一台電腦與同一個瀏覽器，避免資料分散。

## 備份與還原

- 按「匯出」可下載目前資料的 JSON 備份。
- 按「匯入」可選擇先前匯出的 JSON 備份並還原資料。
- 建議每天或每週匯出備份一次，放到隨身碟、NAS 或雲端硬碟。

## GitHub Pages 部署

1. 建立一個 GitHub repository，例如 `greenhouse-management`。
2. 上傳本資料夾內所有檔案到 repository 根目錄。
3. 到 repository 的 `Settings`。
4. 進入 `Pages`。
5. `Source` 選擇 `Deploy from a branch`。
6. Branch 選擇 `main`，資料夾選擇 `/root`。
7. 儲存後等待 GitHub 產生網址。

## Netlify 部署

1. 登入 Netlify。
2. 選擇 `Add new site`。
3. 可直接拖曳整個 `管理網站` 資料夾到 Netlify Deploys。
4. 部署完成後會取得公開網址。

## 資料儲存方式

此版本使用瀏覽器 `localStorage` 儲存日誌與進度資料。好處是不需要伺服器、帳號或資料庫；限制是每台電腦或手機會各自保存資料，不會多人同步。

如果未來需要多人共用同一份日誌、帳號登入、手機與電腦同步資料，才需要加上後端資料庫，例如 Firebase、Supabase、Google Sheets API 或自架伺服器。
