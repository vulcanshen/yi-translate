import browser from 'webextension-polyfill';
import { ACTION } from './constants.js';
import { EN_MESSAGES } from './i18n.js';
import { getSettings, getUiMessages, saveUiMessages } from './storage.js';

/**
 * Load UI messages for a given language code.
 * Returns cached version from storage if available,
 * otherwise translates English base via background and caches.
 */
export async function loadUiMessages(langCode) {
    if (!langCode) {
        const settings = await getSettings();
        langCode = settings.uiLang;
    }

    // English is the base — return directly
    if (langCode === 'EN') return { ...EN_MESSAGES };

    // Check storage cache
    const cached = await getUiMessages(langCode);
    if (cached) return cached;

    // Translate via background
    const keys = Object.keys(EN_MESSAGES);
    const values = keys.map((k) => EN_MESSAGES[k]);

    const response = await browser.runtime.sendMessage({
        action: ACTION.TRANSLATE_UI,
        targetLang: langCode,
        texts: values,
    });

    if (!response.success) {
        console.warn('[譯] UI translation failed, using English', response.error);
        return { ...EN_MESSAGES };
    }

    const translated = {};
    keys.forEach((key, i) => {
        translated[key] = response.results[i] || EN_MESSAGES[key];
    });

    // Cache to storage
    await saveUiMessages(langCode, translated);
    return translated;
}
