import browser from 'webextension-polyfill';
import { t, detectLocale } from '../shared/i18n.js';

// Apply i18n
document.documentElement.lang = detectLocale();
for (const el of document.querySelectorAll('[data-i18n]')) {
    const key = el.getAttribute('data-i18n');
    if (t[key]) el.textContent = t[key];
}

document.getElementById('settings-link').addEventListener('click', (e) => {
    e.preventDefault();
    browser.runtime.openOptionsPage();
});
