import browser from 'webextension-polyfill';
import { ACTION, MAX_QUERY_LENGTH } from '../shared/constants.js';
import { getSettings } from '../shared/storage.js';

console.log('[譯] Background started');

browser.runtime.onInstalled.addListener(() => {
    console.log('[譯] Extension installed');
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
browser.runtime.onMessage.addListener((message, _sender) => {
    if (message.action !== ACTION.TRANSLATE) return;

    return (async () => {
        try {
            const settings = await getSettings();
            const { targetLang } = settings;

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
