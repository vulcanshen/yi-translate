# 譯

開源雙語對照翻譯 Browser Extension，快速閱讀用。

無後端、無伺服器、無追蹤、完全開源、可審查。

## 功能

- **全頁雙語對照** — 點擊浮動按鈕，自動翻譯可視範圍內的段落，原文與譯文上下對照
- **劃詞翻譯** — 選取任意文字，點擊「譯」按鈕即時翻譯，可在彈出視窗中切換語言
- **可拖曳浮動按鈕** — 不擋閱讀，位置自動記憶
- **自訂翻譯樣式** — 文字顏色、背景色皆可調整
- **多語系介面** — 繁體中文、簡體中文、English、日本語、한국어

## 翻譯方式

使用 Google Translate 免費端點（`translate.googleapis.com`），不需要 API Key，翻譯請求直連 Google，不經過任何第三方伺服器。

## 支援平台

| 平台 | Manifest |
|------|----------|
| Chrome / Edge / Brave | Manifest V3 |
| Firefox | Manifest V2 |

## 支援翻譯語言

繁體中文、簡體中文、English、日本語、한국어、Deutsch、Français、Español

## 安裝

### 從原始碼安裝

```bash
git clone https://github.com/<your-username>/freebabel.git
cd freebabel
npm install
```

#### Chrome

```bash
npm run build:chrome
```

1. 開啟 `chrome://extensions`
2. 啟用「開發人員模式」
3. 點「載入未封裝項目」，選擇 `dist/chrome` 資料夾

#### Firefox

```bash
npm run build:firefox
```

1. 開啟 `about:debugging#/runtime/this-firefox`
2. 點「載入暫時性附加元件」，選擇 `dist/firefox/manifest.json`

## 開發

```bash
npm run dev:chrome    # watch mode，自動重建
npm run dev:firefox   # watch mode (Firefox)
npm run build:all     # 同時打包 Chrome + Firefox
```

## 專案結構

```
src/
├── background/   Service worker，發送翻譯請求
├── content/      注入網頁，雙語排版、浮動按鈕、劃詞翻譯
├── options/      設定頁面（語言、樣式、劃詞翻譯）
└── shared/       共用常數、i18n、storage 工具
```

## 授權

[MIT](LICENSE)
