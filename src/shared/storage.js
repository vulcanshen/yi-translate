import browser from 'webextension-polyfill';
import { DEFAULTS } from './constants.js';

export async function getSettings() {
    const result = await browser.storage.local.get('settings');
    return { ...DEFAULTS, ...result.settings };
}

export async function saveSettings(settings) {
    await browser.storage.local.set({ settings });
}

export async function getUiMessages(langCode) {
    const result = await browser.storage.local.get('uiMessages');
    return result.uiMessages?.[langCode] || null;
}

export async function saveUiMessages(langCode, messages) {
    const result = await browser.storage.local.get('uiMessages');
    const all = result.uiMessages || {};
    all[langCode] = messages;
    await browser.storage.local.set({ uiMessages: all });
}
