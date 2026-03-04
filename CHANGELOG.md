# Changelog

All notable changes to this project will be documented in this file.

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