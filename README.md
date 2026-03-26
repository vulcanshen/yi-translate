
<img src="src/icons/icon.svg" width="48" height="48" alt="譯">

開源雙語對照翻譯 Browser Extension，快速閱讀用。

**不需要 AI、不需要 API Key、無廣告、不需要註冊帳號。** 無後端、無伺服器、無追蹤、完全開源、可審查。

## 功能

- **全頁雙語對照** — 點擊浮動按鈕，自動翻譯可視範圍內的段落，原文與譯文上下對照
- **隱藏模式** — 翻譯結果預設隱藏，點擊段落旁的小按鈕才展開，適合學習或考試情境
- **劃詞翻譯** — 選取任意文字，點擊「譯」按鈕即時翻譯，可在彈出視窗中切換語言
- **TTS 發音** — 劃詞翻譯結果支援朗讀，一鍵聽取翻譯發音
- **PDF 翻譯** — 在 PDF 頁面右鍵選擇「PDF ➜」，開新分頁顯示逐頁雙語對照翻譯
- **側邊欄設定** — 點擊工具列圖示直接在側邊欄開啟設定，不離開當前頁面
- **可拖曳浮動按鈕** — 不擋閱讀，位置自動記憶，磁吸左右邊緣
- **自訂翻譯樣式** — 文字顏色、背景色、字體大小皆可調整
- **多語系介面** — 支援所有 Google Translate 語言，設定介面自動翻譯並快取

## 翻譯方式

使用 Google Translate 免費端點（`translate.googleapis.com`），**不需要 API Key、不需要付費、不需要任何設定**，安裝即用。翻譯請求直連 Google，不經過任何第三方伺服器。

## 支援翻譯語言

支援 Google Translate 全部語言（100+），包含繁體中文、簡體中文、English、日本語、한국어、Deutsch、Français、Español 等。

## 安裝

| 平台                    | 連結                                                                                                      |
|-----------------------|---------------------------------------------------------------------------------------------------------|
| Chrome / Edge / Brave | [Chrome Web Store](https://chromewebstore.google.com/detail/%E8%AD%AF/jbnkpfhaobilpghmalbgfaomopgcifbi) |
| Firefox               | [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/%E8%AD%AF-yi/)                         |

## 手動安裝（從 GitHub Release）

前往 [Releases](https://github.com/vulcanshen/yi-translate/releases) 下載最新版本的 zip 檔案。

### Chrome / Edge / Brave

1. 下載 `yi-chrome-v*.zip`，解壓縮到任意資料夾
2. 開啟 `chrome://extensions`（Edge 為 `edge://extensions`）
3. 開啟右上角「開發人員模式」
4. 點擊「載入未封裝項目」，選擇解壓縮後的資料夾

### Firefox

1. 下載 `yi-firefox-v*.zip`（不需解壓縮）
2. 開啟 `about:addons` → 齒輪圖示 → 「從檔案安裝附加元件…」
3. 選擇下載的 `.zip` 檔案

## 專案結構

```
src/
├── background/   Service worker，發送翻譯請求
├── content/      注入網頁，雙語排版、浮動按鈕、劃詞翻譯
├── options/      設定頁面（語言、樣式、劃詞翻譯）
├── pdf-viewer/   PDF 翻譯頁面（pdf.js 擷取文字 + 雙語對照）
└── shared/       共用常數、i18n、storage 工具
```

## 授權

[GPL 3.0](LICENSE)
