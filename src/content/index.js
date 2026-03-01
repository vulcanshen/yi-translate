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
} from '../shared/constants.js';
import { getSettings } from '../shared/storage.js';
import { t } from '../shared/i18n.js';

console.log('[譯] Content script loaded on:', location.hostname);

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
let fabSpinner = null;

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
        .${HIDDEN_CLASS} { display: none !important; }
    `;
}

function setWorking(active) {
    if (fabSpinner) {
        fabSpinner.classList.toggle('active', active);
    }
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
            width: 48px;
            height: 48px;
        }
        .fab-btn {
            width: 48px;
            height: 48px;
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
            font-size: 20px;
            font-weight: 700;
        }
        .fab-btn:hover {
            box-shadow: 0 4px 16px rgba(0,0,0,0.4);
        }
        .fab-spinner {
            position: absolute;
            inset: -4px;
            border-radius: 50%;
            border: 2.5px solid transparent;
            border-top-color: rgba(255,255,255,0.9);
            border-right-color: rgba(255,255,255,0.3);
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.3s;
        }
        .fab-spinner.active {
            opacity: 1;
            animation: fab-spin 0.8s linear infinite;
        }
        @keyframes fab-spin {
            to { transform: rotate(360deg); }
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

    fabSpinner = document.createElement('div');
    fabSpinner.className = 'fab-spinner';

    container.appendChild(fabBtn);
    container.appendChild(fabSpinner);
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
                setWorking(false);
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
            setWorking(false);
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

    try {
        while (pending.size > 0 && enabled) {
            const elements = [...pending];
            pending.clear();

            const toTranslate = elements.filter((el) => !el.hasAttribute(TRANSLATED_ATTR));
            if (toTranslate.length === 0) continue;

            setWorking(true);

            for (let i = 0; i < toTranslate.length; i += BATCH_SIZE) {
                if (!enabled) return;
                const batch = toTranslate.slice(i, i + BATCH_SIZE);

                // Build items with ID + text
                const items = batch.map((el) => ({
                    id: assignId(el),
                    text: el.textContent.trim(),
                }));

                const response = await sendWithRetry(items);
                if (!response) return;

                if (!response.success) {
                    console.warn('[譯] Batch failed, skipping:', response.error);
                    continue;
                }

                // Insert translations using ID to find the correct element
                for (const result of response.results) {
                    const el = document.querySelector(`[${ID_ATTR}="${result.id}"]`);
                    if (!el || el.hasAttribute(TRANSLATED_ATTR)) continue;

                    const originalText = el.textContent.trim();
                    if (result.translated === originalText) continue;

                    el.setAttribute(TRANSLATED_ATTR, result.id);
                    const span = document.createElement('span');
                    span.className = TRANSLATION_CLASS;
                    span.setAttribute('data-yi-for', result.id);
                    span.textContent = result.translated;
                    el.appendChild(span);
                    translatedCount++;
                }
            }
        }

        if (enabled) {
            setWorking(false);
        }
    } finally {
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
