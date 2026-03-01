import { getSettings, saveSettings } from '../shared/storage.js';
import { TARGET_LANGUAGES, DEFAULTS } from '../shared/constants.js';
import { t, detectLocale } from '../shared/i18n.js';

// Apply i18n
document.documentElement.lang = detectLocale();
for (const el of document.querySelectorAll('[data-i18n]')) {
    const key = el.getAttribute('data-i18n');
    if (t[key]) el.textContent = t[key];
}

const targetLangEl = document.getElementById('target-lang');
const textColorEl = document.getElementById('text-color');
const textColorHex = document.getElementById('text-color-hex');
const bgEnabledEl = document.getElementById('bg-enabled');
const bgColorEl = document.getElementById('bg-color');
const bgColorHex = document.getElementById('bg-color-hex');
const bgColorRow = document.getElementById('bg-color-row');
const previewEl = document.getElementById('preview');
const saveBtn = document.getElementById('save-btn');
const statusEl = document.getElementById('status');

// Populate target language dropdown
for (const lang of TARGET_LANGUAGES) {
    const option = document.createElement('option');
    option.value = lang.value;
    option.textContent = lang.label;
    targetLangEl.appendChild(option);
}

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
}

function showStatus(text, ok) {
    statusEl.textContent = text;
    statusEl.className = `status show ${ok ? 'ok' : 'err'}`;
    setTimeout(() => statusEl.classList.remove('show'), 2000);
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

// Load settings
getSettings().then((settings) => {
    targetLangEl.value = settings.targetLang;
    textColorEl.value = settings.translationTextColor || DEFAULTS.translationTextColor;
    textColorHex.textContent = textColorEl.value;
    bgEnabledEl.checked = !!settings.showTranslationBg;
    bgColorEl.value = settings.translationBgColor || DEFAULTS.translationBgColor;
    bgColorHex.textContent = bgColorEl.value;
    updatePreview();
});

// Save
saveBtn.addEventListener('click', async () => {
    const settings = await getSettings();
    settings.targetLang = targetLangEl.value;
    settings.translationTextColor = textColorEl.value;
    settings.showTranslationBg = bgEnabledEl.checked;
    settings.translationBgColor = bgColorEl.value;
    await saveSettings(settings);
    showStatus(t.saved, true);
});
