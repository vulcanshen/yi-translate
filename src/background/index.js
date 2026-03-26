import browser from 'webextension-polyfill';
import { ACTION, MAX_QUERY_LENGTH } from '../shared/constants.js';
import { getSettings } from '../shared/storage.js';

console.log('[譯] Background started');

browser.runtime.onInstalled.addListener(() => {
    console.log('[譯] Extension installed');

    // 右鍵選單：在 PDF 頁面提供翻譯入口
    browser.contextMenus.create({
        id: 'yi-pdf-translate',
        title: 'PDF ➜',
        documentUrlPatterns: [
            '*://*/*.pdf',
            '*://*/*.pdf?*',
            '*://*/*.PDF',
            '*://*/*.PDF?*',
        ],
        contexts: ['page', 'frame'],
    });
});

// Chrome: 點擊 action icon 直接開啟 side panel
if (import.meta.env.MODE === 'chrome' && typeof chrome !== 'undefined' && chrome.sidePanel) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}

// Firefox: 點擊 action icon 切換 sidebar；其他平台 fallback 開 options
browser.action.onClicked.addListener(async () => {
    if (typeof browser.sidebarAction !== 'undefined') {
        browser.sidebarAction.toggle();
    } else {
        browser.runtime.openOptionsPage();
    }
});

browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== 'yi-pdf-translate') return;
    const pdfUrl = tab?.url || info.pageUrl;
    if (!pdfUrl) return;
    const viewerUrl = browser.runtime.getURL(
        `pdf-viewer/index.html?url=${encodeURIComponent(pdfUrl)}`,
    );
    await browser.tabs.create({ url: viewerUrl });
});

/**
 * Send a chunk of { id, text } items to Google Translate free endpoint.
 * Returns an array of { id, translated } in the same order.
 */
async function sendChunk(items, tl) {
    // Strip newlines from each text so \n is only our separator
    const cleanTexts = items.map((it) => it.text.replace(/\n/g, ' '));
    const joined = cleanTexts.join('\n');
    const url = 'https://translate.googleapis.com/translate_a/single?'
        + `client=gtx&sl=auto&tl=${tl}&dt=t&q=${encodeURIComponent(joined)}`;

    const res = await fetch(url);

    if (res.status === 429) {
        const err = new Error('RATE_LIMITED');
        err.retryAfter = parseInt(res.headers.get('Retry-After'), 10) || 30;
        throw err;
    }

    if (!res.ok) {
        throw new Error(`Google Translate ${res.status}`);
    }

    const data = await res.json();
    const fullTranslation = data[0].map((chunk) => chunk[0]).join('');
    const parts = fullTranslation.split('\n');

    return items.map((it, i) => ({
        id: it.id,
        translated: parts[i] !== undefined ? parts[i] : it.text,
    }));
}

/**
 * Translate an array of { id, text } items.
 * Splits into sub-chunks if the joined text exceeds URL safe limit.
 */
async function translateBatch(items, targetLang) {
    const langMap = { 'ZH-HANT': 'zh-TW', 'ZH-HANS': 'zh-CN' };
    const tl = langMap[targetLang] || targetLang.toLowerCase();

    const results = [];
    let chunk = [];
    let chunkLen = 0;

    for (const item of items) {
        const textLen = item.text.length;
        if (chunkLen + textLen + 1 > MAX_QUERY_LENGTH && chunk.length > 0) {
            const translated = await sendChunk(chunk, tl);
            results.push(...translated);
            chunk = [];
            chunkLen = 0;
        }
        chunk.push(item);
        chunkLen += textLen + 1;
    }

    if (chunk.length > 0) {
        const translated = await sendChunk(chunk, tl);
        results.push(...translated);
    }

    return results;
}

// Message handler
browser.runtime.onMessage.addListener((message, sender) => {
    if (message.action === ACTION.PDF_FETCH) {
        return (async () => {
            try {
                const res = await fetch(message.url);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const buffer = await res.arrayBuffer();
                const bytes = new Uint8Array(buffer);
                const chunks = [];
                for (let i = 0; i < bytes.length; i += 8192) {
                    chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)));
                }
                return { success: true, data: btoa(chunks.join('')) };
            } catch (err) {
                console.error('[譯] PDF_FETCH error:', err);
                return { success: false, error: err.message };
            }
        })();
    }

    if (message.action === ACTION.TTS) {
        return (async () => {
            try {
                const { text, lang } = message;
                const langMap = { 'ZH-HANT': 'zh-TW', 'ZH-HANS': 'zh-CN' };
                const tl = langMap[(lang || '').toUpperCase()] || lang.toLowerCase();
                const q = text.slice(0, 200);
                const url = 'https://translate.googleapis.com/translate_tts?'
                    + `ie=UTF-8&client=gtx&tl=${encodeURIComponent(tl)}`
                    + `&q=${encodeURIComponent(q)}&textlen=${q.length}`;
                const res = await fetch(url);
                if (!res.ok) throw new Error(`TTS ${res.status}`);
                const buffer = await res.arrayBuffer();
                const bytes = new Uint8Array(buffer);
                const chunks = [];
                for (let i = 0; i < bytes.length; i += 8192) {
                    chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)));
                }
                return { success: true, dataUrl: `data:audio/mpeg;base64,${btoa(chunks.join(''))}` };
            } catch (err) {
                console.error('[譯] TTS error:', err);
                return { success: false, error: err.message };
            }
        })();
    }

    if (message.action === ACTION.RESET_FAB) {
        return (async () => {
            const tabs = await browser.tabs.query({});
            for (const tab of tabs) {
                try {
                    await browser.tabs.sendMessage(tab.id, { action: ACTION.RESET_FAB });
                } catch { /* tab may not have content script */ }
            }
            return { success: true };
        })();
    }

    if (message.action === ACTION.TRANSLATE_UI) {
        return (async () => {
            try {
                const { targetLang, texts } = message;
                const langMap = { 'ZH-HANT': 'zh-TW', 'ZH-HANS': 'zh-CN' };
                const tl = langMap[targetLang] || targetLang.toLowerCase();

                // Translate all UI strings in one batch
                const items = texts.map((text, i) => ({ id: String(i), text }));
                const results = await translateBatch(items, targetLang);

                // Return translated strings in order
                const ordered = results
                    .sort((a, b) => Number(a.id) - Number(b.id))
                    .map((r) => r.translated);

                return { success: true, results: ordered };
            } catch (err) {
                console.error('[譯] TRANSLATE_UI error:', err);
                return { success: false, error: err.message };
            }
        })();
    }

    if (message.action !== ACTION.TRANSLATE) return;

    return (async () => {
        try {
            const settings = await getSettings();
            const targetLang = message.targetLang || settings.targetLang;

            const { items } = message;
            if (!items || items.length === 0) {
                return { success: true, results: [] };
            }

            const results = await translateBatch(items, targetLang);
            return { success: true, results };
        } catch (err) {
            if (err.message === 'RATE_LIMITED') {
                return { success: false, error: 'RATE_LIMITED', retryAfter: err.retryAfter };
            }
            console.error('[譯] Translation error:', err);
            return { success: false, error: err.message };
        }
    })();
});
