# 智慧溫室農場管理網站部署說明

這是一個靜態網站，可部署到 GitHub Pages、Netlify、Cloudflare Pages、Vercel，或一般支援 HTML/CSS/JS 的主機。

## 網站檔案

- `index.html`
- `styles.css`
- `script.js`
- `assets/`

部署時請上傳整個 `管理網站` 資料夾內的內容。

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

## 目前資料儲存方式

此版本使用瀏覽器 `localStorage` 儲存日誌與進度資料。好處是不需要伺服器，部署最簡單；限制是每台電腦或手機會各自保存資料，不會多人同步。

如果需要多人共用同一份日誌、帳號登入、手機與電腦同步資料，下一步需要加上後端資料庫，例如 Firebase、Supabase、Google Sheets API 或自架伺服器。
