import browser from 'webextension-polyfill';
import {
    ACTION,
    SKIP_TAGS,
    TRANSLATABLE_SELECTOR,
    BATCH_SIZE,
    TRANSLATED_ATTR,
    TRANSLATION_CLASS,
    MIN_TEXT_LENGTH,
    OBSERVER_MARGIN,
    TRANSLATE_DEBOUNCE,
    TARGET_LANGUAGES,
} from '../shared/constants.js';
import { getSettings } from '../shared/storage.js';
import { t } from '../shared/i18n.js';

console.log('[譯] Content script loaded on:', location.hostname);

// PDF 頁面不需要 content script（翻譯由 background 工具列 icon 觸發）
const isPdf = document.contentType === 'application/pdf'
    || location.pathname.toLowerCase().endsWith('.pdf');
if (isPdf) {
    console.log('[譯] PDF detected, skipping content script');
    // 不建立 FAB、不建立 observer，一切交由工具列 icon
}

// Module state
let enabled = false;
let observer = null;
let pending = new Set();
let translatedCount = 0;
let debounceTimer = null;
let busy = false;
let nextId = 0;

const HIDDEN_CLASS = 'yi-hidden';
const SKIP_SELECTOR = Array.from(SKIP_TAGS).join(',');
const ID_ATTR = 'data-yi-id';

// Floating button references
let fabHost = null;
let fabBtn = null;

function injectStyles(textColor, bgColor) {
    let style = document.getElementById('yi-styles');
    if (!style) {
        style = document.createElement('style');
        style.id = 'yi-styles';
        document.head.appendChild(style);
    }
    const bgRule = bgColor
        ? `background-color: ${bgColor}; border-radius: 4px; padding: 4px 4px 4px 8px;`
        : '';
    style.textContent = `
        .${TRANSLATION_CLASS} {
            display: block;
            border-left: 3px solid ${textColor};
            padding-left: 8px;
            margin-top: 4px;
            color: ${textColor};
            font-size: 0.95em;
            line-height: 1.6;
            ${bgRule}
        }
        .yi-badge {
            display: inline-block;
            font-size: 0.75em;
            font-weight: 700;
            background: ${textColor};
            color: #fff;
            border-radius: 3px;
            padding: 0 4px;
            margin-right: 4px;
            vertical-align: middle;
            line-height: 1.6;
        }
        .${TRANSLATION_CLASS}.yi-loading {
            animation: yi-fade 1.5s ease-in-out infinite;
        }
        @keyframes yi-fade {
            0%, 100% { opacity: 0.3; }
            50% { opacity: 0.8; }
        }
        .${HIDDEN_CLASS} { display: none !important; }
    `;
}

function setWorking(_active) {
    // Loading state is now shown per-paragraph via yi-loading placeholders
}

function updateFabAppearance() {
    if (!fabBtn) return;
    if (enabled) {
        fabBtn.style.background = '#0066cc';
        fabBtn.title = t.disableTip;
    } else {
        fabBtn.style.background = '#888';
        fabBtn.title = t.enableTip;
    }
}

function createFab() {
    if (fabHost) return;

    fabHost = document.createElement('div');
    fabHost.id = 'yi-fab-host';
    fabHost.style.cssText = 'position:fixed;z-index:2147483647;top:0;left:0;width:0;height:0;';

    const shadow = fabHost.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = `
        .fab-wrap {
            position: fixed;
            bottom: 80px;
            right: 20px;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 4px;
            user-select: none;
            -webkit-user-select: none;
        }
        .fab-container {
            position: relative;
            width: 36px;
            height: 36px;
        }
        .fab-btn {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            border: none;
            background: #888;
            color: #fff;
            cursor: pointer;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.2s, box-shadow 0.2s;
            touch-action: none;
            padding: 0;
            font-size: 16px;
            font-weight: 700;
        }
        .fab-btn:hover {
            box-shadow: 0 4px 16px rgba(0,0,0,0.4);
        }
    `;

    const wrap = document.createElement('div');
    wrap.className = 'fab-wrap';

    const container = document.createElement('div');
    container.className = 'fab-container';

    fabBtn = document.createElement('button');
    fabBtn.className = 'fab-btn';
    fabBtn.textContent = '譯';
    fabBtn.title = t.enableTip;

    container.appendChild(fabBtn);
    wrap.appendChild(container);
    shadow.appendChild(style);
    shadow.appendChild(wrap);

    // Restore saved position
    try {
        const saved = localStorage.getItem('yi-fab-pos');
        if (saved) {
            const { bottom, right } = JSON.parse(saved);
            wrap.style.bottom = bottom + 'px';
            wrap.style.right = right + 'px';
        }
    } catch { /* ignore */ }

    // Drag logic
    let dragging = false;
    let startX, startY, startRight, startBottom;
    const DRAG_THRESHOLD = 5;
    let moved = false;

    fabBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        dragging = true;
        moved = false;
        startX = e.clientX;
        startY = e.clientY;
        const rect = wrap.getBoundingClientRect();
        startRight = window.innerWidth - rect.right;
        startBottom = window.innerHeight - rect.bottom;
        fabBtn.setPointerCapture(e.pointerId);
    });

    fabBtn.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (!moved && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        moved = true;
        const newRight = Math.max(0, startRight - dx);
        const newBottom = Math.max(0, startBottom - dy);
        wrap.style.right = newRight + 'px';
        wrap.style.bottom = newBottom + 'px';
    });

    fabBtn.addEventListener('pointerup', (e) => {
        if (!dragging) return;
        dragging = false;
        fabBtn.releasePointerCapture(e.pointerId);
        if (moved) {
            // Save position
            try {
                localStorage.setItem('yi-fab-pos', JSON.stringify({
                    bottom: parseInt(wrap.style.bottom),
                    right: parseInt(wrap.style.right),
                }));
            } catch { /* ignore */ }
        } else {
            // Click — toggle
            if (enabled) {
                disable();
            } else {
                enable();
            }
        }
    });

    document.documentElement.appendChild(fabHost);
    updateFabAppearance();
}

/**
 * Assign a unique yi ID to an element if it doesn't have one.
 */
function assignId(el) {
    if (!el.hasAttribute(ID_ATTR)) {
        el.setAttribute(ID_ATTR, String(nextId++));
    }
    return el.getAttribute(ID_ATTR);
}

function shouldSkip(el) {
    if (el.hasAttribute(TRANSLATED_ATTR)) return true;
    if (el.closest(SKIP_SELECTOR)) return true;
    if (el.closest(`.${TRANSLATION_CLASS}`)) return true;
    if (el.textContent.trim().length < MIN_TEXT_LENGTH) return true;
    // Skip parent if it contains nested translatable children (avoid duplicate translations)
    if (el.querySelector(TRANSLATABLE_SELECTOR)) return true;
    return false;
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

/**
 * Send items to background with automatic 429 retry + countdown.
 * Returns the response on success, or null if disabled/error.
 */
async function sendWithRetry(items) {
    while (true) {
        if (!enabled) return null;

        try {
            const response = await browser.runtime.sendMessage({
                action: ACTION.TRANSLATE,
                items,
            });

            if (!response) {
                return null;
            }

            if (response.error === 'RATE_LIMITED') {
                const wait = response.retryAfter || 60;
                for (let s = wait; s > 0; s--) {
                    if (!enabled) return null;
                    await sleep(1000);
                }
                continue;
            }

            return response;
        } catch (err) {
            console.error('[譯] Translation error:', err.message);
            return null;
        }
    }
}

/**
 * Flush pending elements — send to background for translation.
 * Uses ID-based matching to insert translations next to the correct element.
 */
async function flushPending() {
    if (busy || pending.size === 0) return;
    busy = true;
    setWorking(true);

    try {
        while (pending.size > 0 && enabled) {
            const elements = [...pending];
            pending.clear();

            const toTranslate = elements.filter((el) => !el.hasAttribute(TRANSLATED_ATTR));
            if (toTranslate.length === 0) continue;

            for (let i = 0; i < toTranslate.length; i += BATCH_SIZE) {
                if (!enabled) return;
                const batch = toTranslate.slice(i, i + BATCH_SIZE);

                // Build items with ID + text, insert loading placeholders
                const items = batch.map((el) => {
                    const id = assignId(el);
                    const text = el.textContent.trim();
                    if (!el.hasAttribute(TRANSLATED_ATTR)) {
                        el.setAttribute(TRANSLATED_ATTR, id);
                        const span = document.createElement('span');
                        span.className = `${TRANSLATION_CLASS} yi-loading`;
                        span.setAttribute('data-yi-for', id);
                        const badge = document.createElement('span');
                        badge.className = 'yi-badge';
                        badge.textContent = '譯';
                        span.appendChild(badge);
                        span.appendChild(document.createTextNode(' ⋯'));
                        el.appendChild(span);
                    }
                    return { id, text };
                });

                const response = await sendWithRetry(items);
                if (!response) return;

                if (!response.success) {
                    console.warn('[譯] Batch failed, skipping:', response.error);
                    // Remove failed placeholders
                    for (const item of items) {
                        const ph = document.querySelector(`[data-yi-for="${item.id}"].yi-loading`);
                        if (ph) ph.remove();
                        const el = document.querySelector(`[${ID_ATTR}="${item.id}"]`);
                        if (el) el.removeAttribute(TRANSLATED_ATTR);
                    }
                    continue;
                }

                // Replace placeholders with actual translations
                for (const result of response.results) {
                    const span = document.querySelector(`[data-yi-for="${result.id}"]`);
                    if (!span) continue;

                    const el = document.querySelector(`[${ID_ATTR}="${result.id}"]`);
                    const originalText = el ? el.textContent.trim() : '';
                    // If translation is same as original, remove placeholder
                    if (result.translated === originalText || !result.translated) {
                        span.remove();
                        if (el) el.removeAttribute(TRANSLATED_ATTR);
                        continue;
                    }

                    span.textContent = result.translated;
                    span.classList.remove('yi-loading');
                    translatedCount++;
                }
            }
        }

    } finally {
        setWorking(false);
        busy = false;
        if (pending.size > 0 && enabled) {
            scheduleFlush();
        }
    }
}

function scheduleFlush() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        debounceTimer = null;
        flushPending();
    }, TRANSLATE_DEBOUNCE);
}

function createObserver() {
    observer = new IntersectionObserver(
        (entries) => {
            for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                const el = entry.target;
                observer.unobserve(el);
                if (el.hasAttribute(TRANSLATED_ATTR)) continue;
                assignId(el);
                pending.add(el);
            }
            if (pending.size > 0) {
                scheduleFlush();
            }
        },
        { rootMargin: OBSERVER_MARGIN },
    );
}

function observeAll() {
    const elements = document.querySelectorAll(TRANSLATABLE_SELECTOR);
    for (const el of elements) {
        if (shouldSkip(el)) continue;
        observer.observe(el);
    }
}

async function enable() {
    enabled = true;
    busy = false;

    const settings = await getSettings();
    const bgColor = settings.showTranslationBg ? settings.translationBgColor : '';
    injectStyles(settings.translationTextColor, bgColor);

    const hidden = document.querySelectorAll(`.${TRANSLATION_CLASS}.${HIDDEN_CLASS}`);
    for (const el of hidden) {
        el.classList.remove(HIDDEN_CLASS);
    }

    createObserver();
    observeAll();

    updateFabAppearance();
}

function disable() {
    enabled = false;
    busy = false;

    if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
    }
    pending.clear();

    if (observer) {
        observer.disconnect();
        observer = null;
    }

    const spans = document.querySelectorAll(`.${TRANSLATION_CLASS}`);
    for (const span of spans) {
        span.classList.add(HIDDEN_CLASS);
    }

    setWorking(false);
    updateFabAppearance();
}

// PDF 頁面完全跳過（翻譯由工具列 icon 觸發，開新分頁）
if (!isPdf) {

// Listen for messages from popup (via tabs.sendMessage)
browser.runtime.onMessage.addListener((message) => {
    if (message.action === ACTION.GET_STATE) {
        return Promise.resolve({ enabled, count: translatedCount });
    }

    if (message.action === ACTION.TOGGLE) {
        if (enabled) {
            disable();
        } else {
            enable();
        }
        return Promise.resolve({ enabled, count: translatedCount });
    }
});

// Create floating button on load
createFab();

// ─── TTS (Text-to-Speech) ────────────────────────────────────────────

function createTtsIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z');
    path.setAttribute('fill', 'currentColor');
    svg.appendChild(path);
    return svg;
}

let currentAudio = null;

async function speakText(text, langCode) {
    stopSpeech();
    try {
        const response = await browser.runtime.sendMessage({
            action: ACTION.TTS,
            text,
            lang: langCode,
        });
        if (response && response.success) {
            currentAudio = new Audio(response.dataUrl);
            currentAudio.play().catch(() => {});
        }
    } catch {
        // TTS unavailable
    }
}

function stopSpeech() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio = null;
    }
}

// ─── Selection Translation ───────────────────────────────────────────

let selHost = null;
let selShadow = null;
let selTriggerEl = null;
let selPopupEl = null;
let selText = '';
let selLang = '';
let selEnabled = true;
let selDefaultLang = '';

function createSelHost() {
    selHost = document.createElement('div');
    selHost.id = 'yi-sel-host';
    selHost.style.cssText = 'position:fixed;z-index:2147483646;top:0;left:0;width:0;height:0;pointer-events:none;';
    selShadow = selHost.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = `
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        .sel-trigger {
            position: fixed;
            width: 28px;
            height: 28px;
            border-radius: 50%;
            border: 2px solid #0066cc;
            background: #fff;
            color: #0066cc;
            font-size: 14px;
            font-weight: 700;
            cursor: pointer;
            box-shadow: 0 2px 8px rgba(0,0,0,0.25);
            display: flex;
            align-items: center;
            justify-content: center;
            pointer-events: auto;
            transition: transform 0.1s;
            z-index: 2147483646;
        }
        .sel-trigger:hover { transform: scale(1.1); }
        .sel-popup {
            position: fixed;
            width: 320px;
            max-height: 340px;
            background: #fff;
            border: 1px solid #ddd;
            border-radius: 10px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            pointer-events: auto;
            z-index: 2147483646;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 14px;
            color: #333;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }
        .sel-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 12px;
            border-bottom: 1px solid #eee;
            gap: 8px;
        }
        .sel-header select {
            flex: 1;
            border: 1px solid #ccc;
            border-radius: 6px;
            padding: 4px 8px;
            font-size: 13px;
            background: #fff;
            color: #333;
        }
        .sel-close {
            width: 24px;
            height: 24px;
            border: none;
            background: none;
            cursor: pointer;
            font-size: 16px;
            color: #999;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
            flex-shrink: 0;
        }
        .sel-close:hover { background: #f0f0f0; color: #333; }
        .sel-original {
            padding: 8px 12px;
            display: flex;
            align-items: flex-start;
            gap: 4px;
        }
        .sel-original-text {
            flex: 1;
            font-size: 13px;
            color: #888;
            line-height: 1.5;
            white-space: pre-wrap;
            word-break: break-word;
            max-height: 80px;
            overflow-y: auto;
        }
        .sel-divider {
            height: 1px;
            background: #eee;
            margin: 0 12px;
        }
        .sel-body-wrap {
            padding: 8px 12px;
            overflow-y: auto;
            flex: 1;
            display: flex;
            align-items: flex-start;
            gap: 4px;
        }
        .sel-body-text {
            flex: 1;
            line-height: 1.6;
            white-space: pre-wrap;
            word-break: break-word;
        }
        .sel-body-text.loading { color: #999; }
        .sel-body-text.error { color: #c62828; }
        .sel-tts-btn {
            width: 24px;
            height: 24px;
            border: none;
            background: none;
            cursor: pointer;
            font-size: 16px;
            color: #999;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
            flex-shrink: 0;
            padding: 0;
        }
        .sel-tts-btn:hover { color: #0066cc; background: #f0f0f0; }
        @media (prefers-color-scheme: dark) {
            .sel-popup {
                background: #2a2a2a;
                border-color: #444;
                color: #e0e0e0;
            }
            .sel-header { border-bottom-color: #444; }
            .sel-header select {
                background: #333;
                border-color: #555;
                color: #e0e0e0;
            }
            .sel-close { color: #888; }
            .sel-close:hover { background: #3a3a3a; color: #e0e0e0; }
            .sel-original-text { color: #999; }
            .sel-divider { background: #444; }
            .sel-body-text.loading { color: #888; }
            .sel-body-text.error { color: #ef5350; }
            .sel-tts-btn { color: #888; }
            .sel-tts-btn:hover { color: #4da6ff; background: #3a3a3a; }
        }
    `;
    selShadow.appendChild(style);
    document.documentElement.appendChild(selHost);
}

function showTrigger(x, y) {
    dismissSelection();
    selTriggerEl = document.createElement('button');
    selTriggerEl.className = 'sel-trigger';
    selTriggerEl.textContent = '譯';
    selTriggerEl.style.left = x + 'px';
    selTriggerEl.style.top = y + 'px';
    selShadow.appendChild(selTriggerEl);

    selTriggerEl.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const sel = window.getSelection();
        selText = sel ? sel.toString().trim() : '';
    });

    selTriggerEl.addEventListener('click', (e) => {
        e.stopPropagation();
        showPopup();
    });
}

function showPopup() {
    if (selTriggerEl) {
        selTriggerEl.remove();
        selTriggerEl = null;
    }
    if (!selText) return;

    selPopupEl = document.createElement('div');
    selPopupEl.className = 'sel-popup';

    // Header
    const header = document.createElement('div');
    header.className = 'sel-header';

    const langSelect = document.createElement('select');
    for (const lang of TARGET_LANGUAGES) {
        const opt = document.createElement('option');
        opt.value = lang.value;
        opt.textContent = lang.label;
        langSelect.appendChild(opt);
    }
    langSelect.value = selLang;
    langSelect.addEventListener('change', () => {
        selLang = langSelect.value;
        doSelectionTranslate();
    });

    const closeBtn = document.createElement('button');
    closeBtn.className = 'sel-close';
    closeBtn.textContent = '✕';
    closeBtn.title = t.selectionClose;
    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dismissSelection();
    });

    header.appendChild(langSelect);
    header.appendChild(closeBtn);

    // Original text area
    const original = document.createElement('div');
    original.className = 'sel-original';

    const originalText = document.createElement('div');
    originalText.className = 'sel-original-text';
    originalText.textContent = selText;

    const pageLang = document.documentElement.lang || 'en';
    const originalTts = document.createElement('button');
    originalTts.className = 'sel-tts-btn';
    originalTts.appendChild(createTtsIcon());
    originalTts.addEventListener('click', (e) => {
        e.stopPropagation();
        speakText(selText, pageLang);
    });

    original.appendChild(originalText);
    original.appendChild(originalTts);

    // Divider
    const divider = document.createElement('div');
    divider.className = 'sel-divider';

    // Translation area
    const bodyWrap = document.createElement('div');
    bodyWrap.className = 'sel-body-wrap';

    const bodyText = document.createElement('div');
    bodyText.className = 'sel-body-text loading';
    bodyText.textContent = t.selectionTranslating;

    bodyWrap.appendChild(bodyText);

    selPopupEl.appendChild(header);
    selPopupEl.appendChild(original);
    selPopupEl.appendChild(divider);
    selPopupEl.appendChild(bodyWrap);
    selShadow.appendChild(selPopupEl);

    positionPopup();
    doSelectionTranslate();
}

function positionPopup() {
    if (!selPopupEl) return;
    const sel = window.getSelection();
    let anchorX = 0, anchorY = 0;
    if (sel && sel.rangeCount > 0) {
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        anchorX = rect.left;
        anchorY = rect.bottom + 6;
        // If popup would go below viewport, position above
        if (anchorY + 340 > window.innerHeight) {
            anchorY = rect.top - 340 - 6;
            if (anchorY < 0) anchorY = 8;
        }
    }
    // Clamp horizontal
    const popupWidth = 320;
    if (anchorX + popupWidth > window.innerWidth - 8) {
        anchorX = window.innerWidth - popupWidth - 8;
    }
    if (anchorX < 8) anchorX = 8;
    selPopupEl.style.left = anchorX + 'px';
    selPopupEl.style.top = anchorY + 'px';
}

async function doSelectionTranslate() {
    if (!selPopupEl) return;
    const body = selPopupEl.querySelector('.sel-body-text');
    if (!body) return;

    body.className = 'sel-body-text loading';
    body.textContent = t.selectionTranslating;

    // Remove existing translation TTS button
    const existingTts = selPopupEl.querySelector('.sel-body-wrap .sel-tts-btn');
    if (existingTts) existingTts.remove();

    try {
        const response = await browser.runtime.sendMessage({
            action: ACTION.TRANSLATE,
            items: [{ id: 'sel-0', text: selText }],
            targetLang: selLang,
        });
        if (!selPopupEl) return; // dismissed while waiting
        if (response && response.success && response.results && response.results.length > 0) {
            const translated = response.results[0].translated;
            body.className = 'sel-body-text';
            body.textContent = translated;

            // Add TTS button for translation
            const ttsBtn = document.createElement('button');
            ttsBtn.className = 'sel-tts-btn';
            ttsBtn.appendChild(createTtsIcon());
            ttsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                speakText(translated, selLang);
            });
            const bodyWrap = selPopupEl.querySelector('.sel-body-wrap');
            if (bodyWrap) bodyWrap.appendChild(ttsBtn);
        } else {
            body.className = 'sel-body-text error';
            body.textContent = t.selectionError;
        }
    } catch {
        if (!selPopupEl) return;
        body.className = 'sel-body-text error';
        body.textContent = t.selectionError;
    }
}

function dismissSelection() {
    stopSpeech();
    if (selTriggerEl) {
        selTriggerEl.remove();
        selTriggerEl = null;
    }
    if (selPopupEl) {
        selPopupEl.remove();
        selPopupEl = null;
    }
    selText = '';
}

function initSelectionTranslate() {
    document.addEventListener('mouseup', (e) => {
        if (!selEnabled) return;
        // Ignore if clicking inside our shadow DOM
        if (e.composedPath().includes(selHost)) return;

        // Small delay to let selection settle
        setTimeout(() => {
            const sel = window.getSelection();
            const text = sel ? sel.toString().trim() : '';
            if (text.length < 2) return;

            const range = sel.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            // Position trigger at bottom-right of selection
            const x = Math.min(rect.right + 4, window.innerWidth - 36);
            const y = rect.bottom + 4;
            showTrigger(x, y);
        }, 10);
    });

    document.addEventListener('mousedown', (e) => {
        if (e.composedPath().includes(selHost)) return;
        dismissSelection();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            dismissSelection();
        }
    });

    document.addEventListener('scroll', () => {
        dismissSelection();
    }, true);
}

function loadSelectionSettings() {
    getSettings().then((settings) => {
        selEnabled = settings.selectionTranslate !== false;
        selDefaultLang = settings.selectionTargetLang || settings.targetLang;
        selLang = selDefaultLang;
    });

    // Listen for settings changes
    browser.storage.onChanged.addListener((changes) => {
        if (changes.settings) {
            const s = { ...changes.settings.newValue };
            selEnabled = s.selectionTranslate !== false;
            selDefaultLang = s.selectionTargetLang || s.targetLang;
            selLang = selDefaultLang;
        }
    });
}

createSelHost();
initSelectionTranslate();
loadSelectionSettings();

} // end if (!isPdf)
