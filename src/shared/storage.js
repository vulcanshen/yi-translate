import browser from 'webextension-polyfill';

export async function getSettings() {
    const result = await browser.storage.local.get('settings');
    return result.settings ?? {};
}

export async function saveSettings(settings) {
    await browser.storage.local.set({ settings });
}