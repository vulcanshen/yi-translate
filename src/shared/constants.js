// Message action types
export const ACTION = {
  TRANSLATE: 'yi:translate',
  TTS: 'yi:tts',
  TOGGLE: 'yi:toggle',
  GET_STATE: 'yi:get-state',
  PDF_FETCH: 'yi:pdf-fetch',
  LANG_CHANGED: 'yi:lang-changed',
  RESET_FAB: 'yi:reset-fab',
};

// IntersectionObserver margin — start translating elements before they enter viewport
export const OBSERVER_MARGIN = '200px';

// Debounce delay (ms) for batching elements that enter viewport
export const TRANSLATE_DEBOUNCE = 300;

// Elements to skip when traversing DOM
export const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'CODE', 'PRE', 'KBD', 'SAMP',
  'SVG', 'MATH', 'CANVAS', 'VIDEO', 'AUDIO',
  'INPUT', 'TEXTAREA', 'SELECT', 'BUTTON',
  'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED',
]);

// Selectors for block elements to translate
export const TRANSLATABLE_SELECTOR =
  'p, h1, h2, h3, h4, h5, h6, li, td, th, blockquote, figcaption, dd, dt';

// How many text segments per batch sent to background
export const BATCH_SIZE = 20;

// Max characters per Google Translate request (URL safe limit)
export const MAX_QUERY_LENGTH = 4000;

// Data attribute to mark translated elements
export const TRANSLATED_ATTR = 'data-yi';

// CSS class for injected translation spans
export const TRANSLATION_CLASS = 'yi-translation';

// Minimum text length to bother translating
export const MIN_TEXT_LENGTH = 4;

import { detectDefaultTargetLang } from './i18n.js';

// Default settings
export const DEFAULTS = {
  targetLang: detectDefaultTargetLang(),
  translationTextColor: '#C4A35A',
  translationBgColor: '#f5f0e5',
  showTranslationBg: false,
  selectionTranslate: true,
  translationFontSize: '14',
  hiddenMode: false,
  selectionAutoPopup: false,
  selectionTargetLang: detectDefaultTargetLang(),
};

// Target language options
export const TARGET_LANGUAGES = [
  { value: 'ZH-HANT', label: '繁體中文' },
  { value: 'ZH-HANS', label: '简体中文' },
  { value: 'EN', label: 'English' },
  { value: 'JA', label: '日本語' },
  { value: 'KO', label: '한국어' },
  { value: 'DE', label: 'Deutsch' },
  { value: 'FR', label: 'Français' },
  { value: 'ES', label: 'Español' },
];
