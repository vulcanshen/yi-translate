# Changelog

All notable changes to this project will be documented in this file.

## [1.2.1] - 2026-03-09

- 修正劃詞翻譯觸發按鈕位置：多行選取時，按鈕改為出現在選取範圍結尾處，而非整個選取區域的最右下角
- 更新 GitHub Pages 首頁與 README 說明

## [1.2.0] - 2026-03-05

- 新增 PDF 翻譯功能：在 PDF 頁面右鍵選擇「譯 PDF ➜」，開新分頁顯示逐頁雙語對照翻譯
- 使用 pdf.js 擷取 PDF 文字，支援 IntersectionObserver 懶載入翻譯
- 新增右鍵選單（contextMenus）作為 PDF 翻譯入口
- 新增 optional_host_permissions 按需請求權限，不增加預設權限範圍
- PDF 頁面跳過 content script 注入（FAB、劃詞翻譯等），避免干擾原生 PDF 檢視器
- 新增 5 語系 PDF 相關翻譯字串

## [1.1.3] - 2025-06-07

- Switch license from MIT to GPL-3.0-only
- Replace all `innerHTML` usage with safe DOM APIs (`createElement`/`createElementNS`)
- Add Chrome sidePanel mode guard

## [1.1.2] - 2025-06-07

- Fix duplicate translations for nested elements (e.g. `<li>` containing `<p>`)

## [1.1.1] - 2025-06-06

- Remove unused `scripting` permission (Chrome Web Store rejection fix)

## [1.1.0] - 2025-06-06

- Settings open in browser sidebar (Chrome sidePanel / Firefox sidebar_action)
- Options page RWD for narrow sidebar width
- Add GitHub Pages landing page

## [1.0.0] - 2025-06-05

- Selection popup shows original text + translation with speaker buttons
- Switch from Web Speech API to Google Translate TTS for reliable cross-language audio
- Shrink floating action button from 48px to 36px

## [0.1.0] - 2025-06-04

### Initial Release

- Full-page bilingual translation with viewport lazy loading (IntersectionObserver)
- Selection translation (select text → trigger button → popup with language switcher)
- Per-paragraph loading placeholders (`譯 ⋯` badge with fade animation)
- Draggable floating action button (FAB) with position memory
- Settings page (target language, translation text/background color, selection translation toggle)
- Click toolbar icon opens options page directly (no popup)
- Extension icon (blue circle, white 譯)
- i18n support (zh-TW, zh-CN, en, ja, ko)
- Google Translate free endpoint (no API key, no backend server)
- Support Chrome and Firefox
- Privacy policy (PRIVACY.md)