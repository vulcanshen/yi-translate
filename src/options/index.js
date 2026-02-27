import browser from 'webextension-polyfill';
import { getSettings, saveSettings } from '../shared/storage.js';

const providerEl = document.getElementById('api-provider');
const apiKeyEl = document.getElementById('api-key');
const saveBtn = document.getElementById('save-btn');
const statusEl = document.getElementById('status');

function showStatus(text, ok) {
    statusEl.textContent = text;
    statusEl.className = `status show ${ok ? 'ok' : 'err'}`;
    setTimeout(() => statusEl.classList.remove('show'), 2000);
}

// 載入已儲存的設定
getSettings().then((settings) => {
    if (settings.apiProvider) providerEl.value = settings.apiProvider;
    if (settings.apiKey) apiKeyEl.value = settings.apiKey;
});

saveBtn.addEventListener('click', async () => {
    const apiKey = apiKeyEl.value.trim();
    if (!apiKey) {
        showStatus('請輸入 API Key', false);
        return;
    }

    const settings = await getSettings();
    settings.apiProvider = providerEl.value;
    settings.apiKey = apiKey;
    await saveSettings(settings);
    showStatus('已儲存', true);
});