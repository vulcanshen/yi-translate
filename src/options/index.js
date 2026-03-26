import browser from 'webextension-polyfill';
import { getSettings, saveSettings } from '../shared/storage.js';
import { LANGUAGES, DEFAULTS, ACTION } from '../shared/constants.js';
import { EN_MESSAGES } from '../shared/i18n.js';
import { loadUiMessages } from '../shared/ui-i18n.js';

const uiLangEl = document.getElementById('ui-lang');
const targetLangEl = document.getElementById('target-lang');
const hiddenModeEl = document.getElementById('hidden-mode');
const selEnabledEl = document.getElementById('selection-enabled');
const selAutoPopupEl = document.getElementById('selection-auto-popup');
const selAutoRow = document.getElementById('selection-auto-row');
const selLangEl = document.getElementById('selection-target-lang');
const selLangRow = document.getElementById('selection-lang-row');
const fontSizeEl = document.getElementById('font-size');
const textColorEl = document.getElementById('text-color');
const textColorHex = document.getElementById('text-color-hex');
const bgEnabledEl = document.getElementById('bg-enabled');
const bgColorEl = document.getElementById('bg-color');
const bgColorHex = document.getElementById('bg-color-hex');
const bgColorRow = document.getElementById('bg-color-row');
const previewEl = document.getElementById('preview');
const saveBtn = document.getElementById('save-btn');
const statusEl = document.getElementById('status');

const loadingOverlay = document.getElementById('loading-overlay');

// Current UI messages
let t = EN_MESSAGES;

// Populate language dropdown (flat list, no optgroups)
function populateLangSelect(selectEl) {
    selectEl.innerHTML = '';
    for (const lang of LANGUAGES) {
        const option = document.createElement('option');
        option.value = lang.value;
        option.textContent = lang.label;
        selectEl.appendChild(option);
    }
}
populateLangSelect(uiLangEl);
populateLangSelect(targetLangEl);
populateLangSelect(selLangEl);

// Populate font size options
for (const size of [12, 14, 15, 16, 18, 20]) {
    const option = document.createElement('option');
    option.value = String(size);
    option.textContent = `${size}px`;
    fontSizeEl.appendChild(option);
}

selEnabledEl.addEventListener('change', () => {
    const show = selEnabledEl.checked;
    selAutoRow.style.display = show ? '' : 'none';
    selLangRow.style.display = show ? '' : 'none';
});

function updatePreview() {
    const tc = textColorEl.value;
    previewEl.style.color = tc;
    previewEl.style.borderLeftColor = tc;
    if (bgEnabledEl.checked) {
        previewEl.style.backgroundColor = bgColorEl.value;
        previewEl.style.borderRadius = '4px';
        previewEl.style.padding = '4px 4px 4px 8px';
    } else {
        previewEl.style.backgroundColor = '';
        previewEl.style.borderRadius = '';
        previewEl.style.padding = '';
        previewEl.style.paddingLeft = '8px';
    }
    bgColorRow.style.display = bgEnabledEl.checked ? 'flex' : 'none';
    previewEl.style.fontSize = fontSizeEl.value + 'px';
}

function showStatus(text, ok) {
    statusEl.textContent = text;
    statusEl.className = `status show ${ok ? 'ok' : 'err'}`;
    setTimeout(() => statusEl.classList.remove('show'), 2000);
}

// Apply i18n messages to all data-i18n elements
function applyI18n(messages) {
    t = messages;
    for (const el of document.querySelectorAll('[data-i18n]')) {
        const key = el.getAttribute('data-i18n');
        if (messages[key]) el.textContent = messages[key];
    }
}

// Load UI messages with loading overlay (shows spinner if translation needed)
async function loadAndApplyUi(langCode) {
    loadingOverlay.classList.add('show');
    try {
        const messages = await loadUiMessages(langCode);
        applyI18n(messages);
    } finally {
        loadingOverlay.classList.remove('show');
    }
}

// Live update
textColorEl.addEventListener('input', () => {
    textColorHex.textContent = textColorEl.value;
    updatePreview();
});
bgColorEl.addEventListener('input', () => {
    bgColorHex.textContent = bgColorEl.value;
    updatePreview();
});
bgEnabledEl.addEventListener('change', updatePreview);
fontSizeEl.addEventListener('change', updatePreview);

// Load settings and apply UI
getSettings().then(async (settings) => {
    targetLangEl.value = settings.targetLang;
    textColorEl.value = settings.translationTextColor || DEFAULTS.translationTextColor;
    textColorHex.textContent = textColorEl.value;
    bgEnabledEl.checked = !!settings.showTranslationBg;
    bgColorEl.value = settings.translationBgColor || DEFAULTS.translationBgColor;
    bgColorHex.textContent = bgColorEl.value;
    fontSizeEl.value = settings.translationFontSize || DEFAULTS.translationFontSize;
    hiddenModeEl.checked = !!settings.hiddenMode;
    selEnabledEl.checked = settings.selectionTranslate !== false;
    selAutoPopupEl.checked = !!settings.selectionAutoPopup;
    selLangEl.value = settings.selectionTargetLang || DEFAULTS.selectionTargetLang;
    uiLangEl.value = settings.uiLang || DEFAULTS.uiLang;
    selAutoRow.style.display = selEnabledEl.checked ? '' : 'none';
    selLangRow.style.display = selEnabledEl.checked ? '' : 'none';
    updatePreview();

    // Load and apply UI messages
    await loadAndApplyUi(settings.uiLang);
});

// Reset FAB position
document.getElementById('reset-fab-btn').addEventListener('click', async () => {
    await browser.runtime.sendMessage({ action: ACTION.RESET_FAB });
    showStatus(t.resetFabDone, true);
});

// Save
saveBtn.addEventListener('click', async () => {
    const settings = await getSettings();
    settings.targetLang = targetLangEl.value;
    settings.translationTextColor = textColorEl.value;
    settings.showTranslationBg = bgEnabledEl.checked;
    settings.translationBgColor = bgColorEl.value;
    settings.translationFontSize = fontSizeEl.value;
    settings.hiddenMode = hiddenModeEl.checked;
    settings.selectionTranslate = selEnabledEl.checked;
    settings.selectionAutoPopup = selAutoPopupEl.checked;
    settings.selectionTargetLang = selLangEl.value;
    settings.uiLang = uiLangEl.value;
    await saveSettings(settings);

    // Load UI messages for new language (will translate if not cached)
    await loadAndApplyUi(uiLangEl.value);

    showStatus(t.saved, true);
});
