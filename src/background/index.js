import browser from 'webextension-polyfill';

console.log('[FreeBabel] Background started');

browser.runtime.onInstalled.addListener(() => {
    console.log('[FreeBabel] Extension installed');
});