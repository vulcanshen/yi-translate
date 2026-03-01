import browser from 'webextension-polyfill';
import { DEFAULTS } from './constants.js';

export async function getSettings() {
    const result = await browser.storage.local.get('settings');
    return { ...DEFAULTS, ...result.settings };
}

export async function saveSettings(settings) {
    await browser.storage.local.set({ settings });
}
