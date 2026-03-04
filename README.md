
<img src="src/icons/icon.svg" width="48" height="48" alt="譯">

開源雙語對照翻譯 Browser Extension，快速閱讀用。

**不需要 AI、不需要 API Key、不需要註冊帳號。** 無後端、無伺服器、無追蹤、完全開源、可審查。

## 功能

- **全頁雙語對照** — 點擊浮動按鈕，自動翻譯可視範圍內的段落，原文與譯文上下對照
- **劃詞翻譯** — 選取任意文字，點擊「譯」按鈕即時翻譯，可在彈出視窗中切換語言
- **TTS 發音** — 劃詞翻譯結果支援朗讀，一鍵聽取翻譯發音
- **側邊欄設定** — 點擊工具列圖示直接在側邊欄開啟設定，不離開當前頁面
- **可拖曳浮動按鈕** — 不擋閱讀，位置自動記憶
- **自訂翻譯樣式** — 文字顏色、背景色皆可調整
- **多語系介面** — 繁體中文、簡體中文、English、日本語、한국어

## 翻譯方式

使用 Google Translate 免費端點（`translate.googleapis.com`），**不需要 API Key、不需要付費、不需要任何設定**，安裝即用。翻譯請求直連 Google，不經過任何第三方伺服器。

## 支援翻譯語言

繁體中文、簡體中文、English、日本語、한국어、Deutsch、Français、Español

## 安裝

| 平台                    | 連結                                                                          |
|-----------------------|-----------------------------------------------------------------------------|
| Chrome / Edge / Brave | [Chrome Web Store](https://chromewebstore.google.com/) <!-- 審核中，通過後更新連結 --> |
| Firefox               | [Firefox Add-ons](https://addons.mozilla.org/) <!-- 審核中，通過後更新連結 -->         |

## 從原始碼建置

```bash
git clone https://github.com/vulcanshen/yi-translate.git
cd yi-translate
npm install

npm run build:chrome    # 打包 Chrome
npm run build:firefox   # 打包 Firefox
npm run build:all       # 同時打包兩個平台
npm run dev:chrome      # watch mode
```

產出在 `dist/chrome` 或 `dist/firefox`，可用開發者模式載入測試。

## 專案結構

```
src/
├── background/   Service worker，發送翻譯請求
├── content/      注入網頁，雙語排版、浮動按鈕、劃詞翻譯
├── options/      設定頁面（語言、樣式、劃詞翻譯）
└── shared/       共用常數、i18n、storage 工具
```

## 授權

[GPL 3.0](LICENSE)
