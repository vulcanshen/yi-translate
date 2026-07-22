// Message action types
export const ACTION = {
  TRANSLATE: 'yi:translate',
  TTS: 'yi:tts',
  TOGGLE: 'yi:toggle',
  GET_STATE: 'yi:get-state',
  PDF_FETCH: 'yi:pdf-fetch',
  LANG_CHANGED: 'yi:lang-changed',
  RESET_FAB: 'yi:reset-fab',
  TRANSLATE_UI: 'yi:translate-ui',
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

// Embedded '譯' badge font (woff2), shared by the FAB and the selection UI
export const YI_FONT_FACE = `@font-face { font-family: 'Yi'; src: url(data:font/woff2;base64,d09GMgABAAAAAAPIABAAAAAAB6wAAANwAAEAgwAAAAAAAAAAAAAAAAAAAAAAAAAAGYFSGyAcIAZgADQRCAqELINvATYCJAMGCwYABCAFg2wHIBckGAYbUgZAnge2bWMLnqhG5Sx2/WgyT8TD/6/R7pv5K+ZNQzQPzeX0jaJAq5REVGsk0mbmYq3tvXtSw5KJnogmhhAZUiQ0EqWxvH/vp1ByzyuIDd4gYvSIb47yVCVoDMp8907v2gPwngdYpIGF7WtMGtvWwD1AAskDnZN+Flga6LLNtrvACCJkmLq5QY9PbyVQbs+rgNK5heNr6O67mgDzxxrJw/wJKrHQPUclFLoXqCHBvBDIJL2aur6gFOSSavUKPiCKfYjcEVK0QNIqcLpPYa3X+MOEaWiyKFVTPAQVpjF8YAFsl4WVulUhVf4tIkFxCwAZh1P+gK8HSshe8ocAq5wtthRCHZRf7rnW5k8bsP4quz1bIKdoAemJTwNAQPziPwT6+ZEBD81iDggD+kEqEbzKvr2FTEEfBODwBpDx50mowifgDwCUXbVfz+OJ8nSroJhY5sslPj5sG+KrHSYyyWOBsT0l9rEwuL/hAbH2e3B1FxGqXg0SDlBrfCM7Cuwb4eNXC3FtF3t8tft3qP18F652zvzal6f5arewbQOuJhejisbHibWPDi0NrRrfV8bR3Tg/hfrD3uVD4vFVfBiwPMIrcLXKqH2dr3YNsd+XibOu5/gT6Qc+d/uOH/FO9jX65356/YLObx6iF05FKwY2tgb2+g4GtjYGDoW7f/Se8AOdO0PsH6UdqNglvnvoA+JD+ub2OrzhdRdTf6h88su8VQQ9a4HnJ0bSIdU3i7rmPSbGM+a6i2/yXBO/quhXtTL3kegjdzlRrl4bv/nan2VcgHM8YH2MPrJ704mAw/eB6VLHyQRpo9m92AT0Be8n9LR7NdT7FPBadeoauS0DAAiEW6GU57notN3/chL4BPg6ZJ4CwG8Vd29bb8uv8lOgVAaC9HTzkfwvGDeNEwQ1x0yfGoIgiyfQ7lEgD+R5KLNmlyUx4DU4Uej1gzK13qLclH+UjIcGKtEZXsRKDUeKLTKFS8OiMQx1c2Z6PEt87YNk7BFJkodOoDSmuj0yA4OFq9tgEizHoW7uz+UxKCxeNG0ajc2ZZ8JMwclE/70yGU1AosgkBt00r6J0QuylZZzBejyXSPhMQhzPwjyzo2VLHu041bDUdFIvAyYztLX3RvnwNqHRsUdPvX6narr9VGlRDgWFUQ/I83/uu1J155agCxBRgRzHAAA=) format('woff2'); }`;

import { detectDefaultTargetLang, detectDefaultUiLang } from './i18n.js';

// Default settings
export const DEFAULTS = {
  targetLang: detectDefaultTargetLang(),
  translationTextColor: '#0066cc',
  translationBgColor: '#f5f0e5',
  showTranslationBg: false,
  selectionTranslate: true,
  translationFontSize: '14',
  hiddenMode: false,
  showFab: true,
  selectionAutoPopup: false,
  selectionTargetLang: detectDefaultTargetLang(),
  uiLang: detectDefaultUiLang(),
};

// All supported languages (sorted by label)
export const LANGUAGES = [
  { value: 'AF', label: 'Afrikaans' },
  { value: 'SQ', label: 'Shqip (Albanian)' },
  { value: 'AM', label: 'አማርኛ (Amharic)' },
  { value: 'AR', label: 'العربية (Arabic)' },
  { value: 'HY', label: 'Հայերեն (Armenian)' },
  { value: 'AZ', label: 'Azərbaycan (Azerbaijani)' },
  { value: 'EU', label: 'Euskara (Basque)' },
  { value: 'BE', label: 'Беларуская (Belarusian)' },
  { value: 'BN', label: 'বাংলা (Bengali)' },
  { value: 'BS', label: 'Bosanski (Bosnian)' },
  { value: 'BG', label: 'Български (Bulgarian)' },
  { value: 'CA', label: 'Català (Catalan)' },
  { value: 'CEB', label: 'Cebuano' },
  { value: 'ZH-HANS', label: '简体中文 (Chinese Simplified)' },
  { value: 'ZH-HANT', label: '繁體中文 (Chinese Traditional)' },
  { value: 'CO', label: 'Corsu (Corsican)' },
  { value: 'HR', label: 'Hrvatski (Croatian)' },
  { value: 'CS', label: 'Čeština (Czech)' },
  { value: 'DA', label: 'Dansk (Danish)' },
  { value: 'NL', label: 'Nederlands (Dutch)' },
  { value: 'EN', label: 'English' },
  { value: 'EO', label: 'Esperanto' },
  { value: 'ET', label: 'Eesti (Estonian)' },
  { value: 'FI', label: 'Suomi (Finnish)' },
  { value: 'FR', label: 'Français (French)' },
  { value: 'FY', label: 'Frysk (Frisian)' },
  { value: 'GL', label: 'Galego (Galician)' },
  { value: 'KA', label: 'ქართული (Georgian)' },
  { value: 'DE', label: 'Deutsch (German)' },
  { value: 'EL', label: 'Ελληνικά (Greek)' },
  { value: 'GU', label: 'ગુજરાતી (Gujarati)' },
  { value: 'HT', label: 'Kreyòl Ayisyen (Haitian Creole)' },
  { value: 'HA', label: 'Hausa' },
  { value: 'HAW', label: 'ʻŌlelo Hawaiʻi (Hawaiian)' },
  { value: 'IW', label: 'עברית (Hebrew)' },
  { value: 'HI', label: 'हिन्दी (Hindi)' },
  { value: 'HMN', label: 'Hmoob (Hmong)' },
  { value: 'HU', label: 'Magyar (Hungarian)' },
  { value: 'IS', label: 'Íslenska (Icelandic)' },
  { value: 'IG', label: 'Igbo' },
  { value: 'ID', label: 'Bahasa Indonesia (Indonesian)' },
  { value: 'GA', label: 'Gaeilge (Irish)' },
  { value: 'IT', label: 'Italiano (Italian)' },
  { value: 'JA', label: '日本語 (Japanese)' },
  { value: 'JW', label: 'Basa Jawa (Javanese)' },
  { value: 'KN', label: 'ಕನ್ನಡ (Kannada)' },
  { value: 'KK', label: 'Қазақ (Kazakh)' },
  { value: 'KM', label: 'ខ្មែរ (Khmer)' },
  { value: 'KO', label: '한국어 (Korean)' },
  { value: 'KU', label: 'Kurdî (Kurdish)' },
  { value: 'KY', label: 'Кыргызча (Kyrgyz)' },
  { value: 'LO', label: 'ລາວ (Lao)' },
  { value: 'LA', label: 'Latina (Latin)' },
  { value: 'LV', label: 'Latviešu (Latvian)' },
  { value: 'LT', label: 'Lietuvių (Lithuanian)' },
  { value: 'LB', label: 'Lëtzebuergesch (Luxembourgish)' },
  { value: 'MK', label: 'Македонски (Macedonian)' },
  { value: 'MG', label: 'Malagasy' },
  { value: 'MS', label: 'Bahasa Melayu (Malay)' },
  { value: 'ML', label: 'മലയാളം (Malayalam)' },
  { value: 'MT', label: 'Malti (Maltese)' },
  { value: 'MI', label: 'Te Reo Māori (Māori)' },
  { value: 'MR', label: 'मराठी (Marathi)' },
  { value: 'MN', label: 'Монгол (Mongolian)' },
  { value: 'MY', label: 'ဗမာ (Myanmar)' },
  { value: 'NE', label: 'नेपाली (Nepali)' },
  { value: 'NO', label: 'Norsk (Norwegian)' },
  { value: 'NY', label: 'Chinyanja (Nyanja)' },
  { value: 'PS', label: 'پښتو (Pashto)' },
  { value: 'FA', label: 'فارسی (Persian)' },
  { value: 'PL', label: 'Polski (Polish)' },
  { value: 'PT', label: 'Português (Portuguese)' },
  { value: 'PA', label: 'ਪੰਜਾਬੀ (Punjabi)' },
  { value: 'RO', label: 'Română (Romanian)' },
  { value: 'RU', label: 'Русский (Russian)' },
  { value: 'SM', label: 'Gagana Samoa (Samoan)' },
  { value: 'GD', label: 'Gàidhlig (Scottish Gaelic)' },
  { value: 'SR', label: 'Српски (Serbian)' },
  { value: 'ST', label: 'Sesotho' },
  { value: 'SN', label: 'ChiShona (Shona)' },
  { value: 'SD', label: 'سنڌي (Sindhi)' },
  { value: 'SI', label: 'සිංහල (Sinhala)' },
  { value: 'SK', label: 'Slovenčina (Slovak)' },
  { value: 'SL', label: 'Slovenščina (Slovenian)' },
  { value: 'SO', label: 'Soomaaliga (Somali)' },
  { value: 'ES', label: 'Español (Spanish)' },
  { value: 'SU', label: 'Basa Sunda (Sundanese)' },
  { value: 'SW', label: 'Kiswahili (Swahili)' },
  { value: 'SV', label: 'Svenska (Swedish)' },
  { value: 'TL', label: 'Tagalog' },
  { value: 'TG', label: 'Тоҷикӣ (Tajik)' },
  { value: 'TA', label: 'தமிழ் (Tamil)' },
  { value: 'TE', label: 'తెలుగు (Telugu)' },
  { value: 'TH', label: 'ไทย (Thai)' },
  { value: 'TR', label: 'Türkçe (Turkish)' },
  { value: 'UK', label: 'Українська (Ukrainian)' },
  { value: 'UR', label: 'اردو (Urdu)' },
  { value: 'UZ', label: 'Oʻzbek (Uzbek)' },
  { value: 'VI', label: 'Tiếng Việt (Vietnamese)' },
  { value: 'CY', label: 'Cymraeg (Welsh)' },
  { value: 'XH', label: 'IsiXhosa (Xhosa)' },
  { value: 'YI', label: 'ייִדיש (Yiddish)' },
  { value: 'YO', label: 'Yorùbá (Yoruba)' },
  { value: 'ZU', label: 'IsiZulu (Zulu)' },
];
