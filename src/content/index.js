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
    YI_FONT_FACE,
} from '../shared/constants.js';
import { getSettings } from '../shared/storage.js';
import { EN_MESSAGES } from '../shared/i18n.js';
import { loadUiMessages } from '../shared/ui-i18n.js';
import { initSelectionTranslate } from '../shared/selection-translate.js';

// UI messages — start with English, load translated version async
let t = { ...EN_MESSAGES };

function refreshUiMessages() {
    loadUiMessages().then((msgs) => {
        t = msgs;
        if (fabBtn) {
            fabBtn.title = enabled ? t.disableTip : t.enableTip;
        }
    });
}
refreshUiMessages();

// Reload UI messages when settings change (e.g. uiLang changed in options)
browser.storage.onChanged.addListener((changes) => {
    if (changes.settings || changes.uiMessages) {
        refreshUiMessages();
    }
});

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
let hiddenMode = false;
let revealedIds = new Set();
let domObserver = null;

const HIDDEN_CLASS = 'yi-hidden';
const SKIP_SELECTOR = Array.from(SKIP_TAGS).join(',');
const ID_ATTR = 'data-yi-id';

// Floating button references
let fabHost = null;
let fabWrap = null;
let fabBtn = null;

function injectStyles(textColor, bgColor, fontSize) {
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
        ${YI_FONT_FACE}
        .${TRANSLATION_CLASS} {
            display: block;
            border-left: 3px solid ${textColor};
            padding-left: 8px;
            margin-top: 4px;
            color: ${textColor};
            font-size: ${fontSize || 16}px;
            line-height: 1.6;
            ${bgRule}
        }
        .yi-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 20px;
            height: 20px;
            font-family: 'Yi', sans-serif;
            font-size: 11px;
            font-weight: 700;
            background: #0066cc;
            color: #fff;
            border: 1.5px solid #C4A35A;
            border-radius: 50%;
            margin-right: 4px;
            vertical-align: middle;
        }
        .${TRANSLATION_CLASS}.yi-loading {
            animation: yi-fade 1.5s ease-in-out infinite;
        }
        @keyframes yi-fade {
            0%, 100% { opacity: 0.3; }
            50% { opacity: 0.8; }
        }
        .${HIDDEN_CLASS} { display: none !important; }
        .yi-reveal-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 20px;
            height: 20px;
            font-family: 'Yi', sans-serif;
            font-size: 11px;
            font-weight: 700;
            background: #0066cc;
            color: #fff;
            border: 1.5px solid #C4A35A;
            border-radius: 50% 50% 50% 2px;
            padding: 0;
            margin-left: 3px;
            vertical-align: top;
            cursor: pointer;
            opacity: 0.85;
            transition: opacity 0.15s, transform 0.1s;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .yi-reveal-btn:hover { opacity: 1; transform: scale(1.1); }
        .${TRANSLATION_CLASS}.yi-collapsed { display: none; }
    `;
}

function setWorking(_active) {
    // Loading state is now shown per-paragraph via yi-loading placeholders
}

function updateFabAppearance() {
    if (!fabBtn) return;
    if (enabled) {
        fabBtn.style.borderColor = '#C4A35A';
        fabBtn.style.background = '#0066cc';
        fabBtn.style.color = '#fff';
        fabBtn.title = t.disableTip;
    } else {
        fabBtn.style.borderColor = '#888';
        fabBtn.style.background = '#e8e8e8';
        fabBtn.style.color = '#888';
        fabBtn.title = t.enableTip;
    }
}

function createFab() {
    if (fabHost) return;

    // Inject @font-face at document level (shadow DOM may not load it)
    if (!document.getElementById('yi-font-face')) {
        const fontStyle = document.createElement('style');
        fontStyle.id = 'yi-font-face';
        fontStyle.textContent = YI_FONT_FACE;
        document.head.appendChild(fontStyle);
    }

    fabHost = document.createElement('div');
    fabHost.id = 'yi-fab-host';
    fabHost.style.cssText = 'position:fixed;z-index:2147483647;top:0;left:0;right:0;bottom:0;pointer-events:none;';

    const shadow = fabHost.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = `
        ${YI_FONT_FACE}
        .fab-wrap {
            position: absolute;
            bottom: 80px;
            right: 20px;
            width: 36px;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
            user-select: none;
            -webkit-user-select: none;
            pointer-events: auto;
        }
        .fab-wrap.snapping {
            animation: snap-move 0.4s cubic-bezier(0.25, 1, 0.5, 1) forwards;
        }
        @keyframes snap-fade {
            0%   { opacity: 1; }
            25%  { opacity: 0.3; }
            75%  { opacity: 0.3; }
            100% { opacity: 1; }
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
            border: 2px solid #888;
            background: #e8e8e8;
            color: #888;
            cursor: pointer;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            display: flex;
            align-items: center;
            justify-content: center;
            transition: border-color 0.2s, color 0.2s, box-shadow 0.2s;
            touch-action: none;
            padding: 0;
            font-family: 'Yi', sans-serif;
            font-size: 16px;
            font-weight: 700;
        }
        .fab-btn:hover {
            box-shadow: 0 4px 16px rgba(0,0,0,0.25);
        }
        .fab-wrap.fab-enter {
            animation: fab-enter 0.3s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        .fab-wrap.fab-leave {
            animation: fab-leave 0.2s cubic-bezier(0.55, 0, 1, 0.45) forwards;
        }
        @keyframes fab-enter {
            0%   { opacity: 0; transform: scale(0) rotate(-180deg); }
            100% { opacity: 1; transform: scale(1) rotate(0deg); }
        }
        @keyframes fab-leave {
            0%   { opacity: 1; transform: scale(1) rotate(0deg); }
            100% { opacity: 0; transform: scale(0) rotate(180deg); }
        }
    `;

    const wrap = document.createElement('div');
    wrap.className = 'fab-wrap';
    fabWrap = wrap;

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
            const pos = JSON.parse(saved);
            wrap.style.bottom = pos.bottom + 'px';
            if (pos.side === 'left') {
                wrap.style.right = 'auto';
                wrap.style.left = pos.left + 'px';
            } else {
                wrap.style.right = pos.right + 'px';
            }
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
        const hostRect = fabHost.getBoundingClientRect();
        // Always switch to right-based positioning during drag
        wrap.style.left = 'auto';
        startRight = hostRect.right - rect.right;
        wrap.style.right = startRight + 'px';
        startBottom = hostRect.bottom - rect.bottom;
        fabBtn.setPointerCapture(e.pointerId);
    });

    fabBtn.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (!moved && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        if (!moved) {
            wrap.style.transition = 'none';
            wrap.classList.remove('snapping');
        }
        moved = true;
        const newRight = Math.max(0, startRight - dx);
        const maxBottom = fabHost.getBoundingClientRect().height - wrap.getBoundingClientRect().height;
        const newBottom = Math.min(maxBottom, Math.max(0, startBottom - dy));
        wrap.style.right = newRight + 'px';
        wrap.style.bottom = newBottom + 'px';
    });

    fabBtn.addEventListener('pointercancel', (e) => {
        if (!dragging) return;
        dragging = false;
    });

    fabBtn.addEventListener('pointerup', (e) => {
        if (!dragging) return;
        dragging = false;
        fabBtn.releasePointerCapture(e.pointerId);
        if (moved) {
            // Snap to left or right edge based on button center vs window center
            const FAB_MARGIN = 20;
            const rect = wrap.getBoundingClientRect();
            const hostRect = fabHost.getBoundingClientRect();
            const btnCenterX = rect.left + rect.width / 2;
            const snapToLeft = btnCenterX < hostRect.width / 2;

            if (snapToLeft) {
                // Animate right → then switch to left positioning
                const snapRight = hostRect.width - rect.width - FAB_MARGIN;
                const currentRight = parseFloat(wrap.style.right);
                const distance = Math.abs(snapRight - currentRight);
                const duration = Math.min(0.5, Math.max(0.25, distance / 800));
                wrap.style.transition = `right ${duration}s cubic-bezier(0.25, 1, 0.5, 1)`;
                wrap.style.animation = `snap-fade ${duration}s ease`;
                wrap.style.right = snapRight + 'px';

                const onEnd = () => {
                    wrap.style.transition = '';
                    wrap.style.animation = '';
                    // Switch to left-based positioning
                    wrap.style.right = 'auto';
                    wrap.style.left = FAB_MARGIN + 'px';
                    wrap.removeEventListener('transitionend', onEnd);
                };
                wrap.addEventListener('transitionend', onEnd);

                try {
                    localStorage.setItem('yi-fab-pos', JSON.stringify({
                        bottom: parseInt(wrap.style.bottom),
                        left: FAB_MARGIN,
                        side: 'left',
                    }));
                } catch { /* ignore */ }
            } else {
                const snapRight = FAB_MARGIN;
                const currentRight = parseFloat(wrap.style.right);
                const distance = Math.abs(snapRight - currentRight);
                const duration = Math.min(0.5, Math.max(0.25, distance / 800));
                wrap.style.transition = `right ${duration}s cubic-bezier(0.25, 1, 0.5, 1)`;
                wrap.style.animation = `snap-fade ${duration}s ease`;
                wrap.style.right = snapRight + 'px';

                const onEnd = () => {
                    wrap.style.transition = '';
                    wrap.style.animation = '';
                    wrap.removeEventListener('transitionend', onEnd);
                };
                wrap.addEventListener('transitionend', onEnd);

                try {
                    localStorage.setItem('yi-fab-pos', JSON.stringify({
                        bottom: parseInt(wrap.style.bottom),
                        right: snapRight,
                        side: 'right',
                    }));
                } catch { /* ignore */ }
            }
        } else {
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
                if (!response) {
                    if (enabled) {
                        // Show error on placeholders (disabled case: placeholders will be hidden by disable())
                        for (const item of items) {
                            const ph = document.querySelector(`[data-yi-for="${item.id}"].yi-loading`);
                            if (ph) {
                                ph.textContent = `✕ ${t.selectionError}`;
                                ph.classList.remove('yi-loading');
                                ph.style.color = '#c62828';
                            }
                        }
                    }
                    return;
                }

                if (!response.success) {
                    console.warn('[譯] Batch failed, skipping:', response.error);
                    const errMsg = response.error || t.selectionError;
                    for (const item of items) {
                        const ph = document.querySelector(`[data-yi-for="${item.id}"].yi-loading`);
                        if (ph) {
                            ph.textContent = `✕ ${errMsg}`;
                            ph.classList.remove('yi-loading');
                            ph.style.color = '#c62828';
                        }
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

                    if (hiddenMode && !revealedIds.has(result.id)) {
                        span.classList.add('yi-collapsed');
                        const revealBtn = document.createElement('button');
                        revealBtn.className = 'yi-reveal-btn';
                        revealBtn.textContent = '譯';
                        revealBtn.setAttribute('data-yi-reveal', result.id);
                        revealBtn.addEventListener('click', () => {
                            span.classList.remove('yi-collapsed');
                            revealBtn.remove();
                        });
                        span.parentElement.appendChild(revealBtn);
                    }
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

function startDomObserver() {
    if (domObserver) domObserver.disconnect();
    domObserver = new MutationObserver((mutations) => {
        if (!enabled || !observer) return;
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== Node.ELEMENT_NODE) continue;
                // Skip our own injected elements
                if (node.classList && (node.classList.contains(TRANSLATION_CLASS) || node.id === 'yi-fab-host' || node.id === 'yi-sel-host')) continue;
                // Check the node itself
                if (node.matches && node.matches(TRANSLATABLE_SELECTOR) && !shouldSkip(node)) {
                    observer.observe(node);
                }
                // Check children
                const children = node.querySelectorAll ? node.querySelectorAll(TRANSLATABLE_SELECTOR) : [];
                for (const child of children) {
                    if (!shouldSkip(child)) {
                        observer.observe(child);
                    }
                }
            }
        }
    });
    domObserver.observe(document.body, { childList: true, subtree: true });
}

async function enable() {
    enabled = true;
    busy = false;

    const settings = await getSettings();
    hiddenMode = !!settings.hiddenMode;
    const bgColor = settings.showTranslationBg ? settings.translationBgColor : '';
    injectStyles(settings.translationTextColor, bgColor, settings.translationFontSize);

    const hidden = document.querySelectorAll(`.${TRANSLATION_CLASS}.${HIDDEN_CLASS}`);
    for (const el of hidden) {
        el.classList.remove(HIDDEN_CLASS);
    }

    // Sync hidden mode state for existing translations
    applyHiddenMode();

    createObserver();
    observeAll();
    startDomObserver();

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

    if (domObserver) {
        domObserver.disconnect();
        domObserver = null;
    }
    if (observer) {
        observer.disconnect();
        observer = null;
    }

    const spans = document.querySelectorAll(`.${TRANSLATION_CLASS}`);
    for (const span of spans) {
        span.classList.add(HIDDEN_CLASS);
    }
    for (const btn of document.querySelectorAll('.yi-reveal-btn')) btn.remove();

    setWorking(false);
    updateFabAppearance();
}

function applyHiddenMode() {
    if (hiddenMode) {
        // For all completed translation spans, ensure they are collapsed with a reveal button
        for (const span of document.querySelectorAll(`.${TRANSLATION_CLASS}:not(.yi-loading):not(.${HIDDEN_CLASS})`)) {
            const id = span.getAttribute('data-yi-for');
            if (!id) continue;
            // Skip if reveal button already exists
            if (document.querySelector(`.yi-reveal-btn[data-yi-reveal="${id}"]`)) continue;
            // Skip already-revealed (user clicked to show)
            if (!span.classList.contains('yi-collapsed') && span.textContent.trim()) {
                // Visible span without button — collapse it
            }
            span.classList.add('yi-collapsed');
            const revealBtn = document.createElement('button');
            revealBtn.className = 'yi-reveal-btn';
            revealBtn.textContent = '譯';
            revealBtn.setAttribute('data-yi-reveal', id);
            revealBtn.addEventListener('click', () => {
                span.classList.remove('yi-collapsed');
                revealBtn.remove();
            });
            span.parentElement.appendChild(revealBtn);
        }
    } else {
        // Disable hidden mode: show all collapsed spans, remove all reveal buttons
        for (const span of document.querySelectorAll(`.${TRANSLATION_CLASS}.yi-collapsed`)) {
            span.classList.remove('yi-collapsed');
        }
        for (const btn of document.querySelectorAll('.yi-reveal-btn')) btn.remove();
    }
}

function refreshTranslation() {
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
    pending.clear();
    busy = false;
    if (observer) { observer.disconnect(); observer = null; }

    // Remember which IDs were revealed (visible, not collapsed) before refresh
    revealedIds.clear();
    for (const span of document.querySelectorAll(`.${TRANSLATION_CLASS}:not(.yi-collapsed):not(.yi-loading):not(.${HIDDEN_CLASS})`)) {
        const id = span.getAttribute('data-yi-for');
        if (id) revealedIds.add(id);
    }

    // Remove all translation spans and reveal buttons
    for (const span of document.querySelectorAll(`.${TRANSLATION_CLASS}`)) span.remove();
    for (const btn of document.querySelectorAll('.yi-reveal-btn')) btn.remove();
    // Remove translated markers so elements can be re-translated
    for (const el of document.querySelectorAll(`[${TRANSLATED_ATTR}]`)) el.removeAttribute(TRANSLATED_ATTR);

    translatedCount = 0;
    createObserver();
    observeAll();
}

// PDF 頁面完全跳過（翻譯由工具列 icon 觸發，開新分頁）
if (!isPdf) {

// Listen for messages from popup (via tabs.sendMessage)
browser.runtime.onMessage.addListener((message) => {
    if (message.action === ACTION.GET_STATE) {
        return Promise.resolve({ enabled, count: translatedCount });
    }

    if (message.action === ACTION.RESET_FAB) {
        if (fabWrap) {
            fabWrap.style.transition = '';
            fabWrap.style.left = 'auto';
            fabWrap.style.right = '20px';
            fabWrap.style.bottom = '80px';
        }
        try { localStorage.removeItem('yi-fab-pos'); } catch { /* ignore */ }
        return Promise.resolve({ success: true });
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

browser.storage.onChanged.addListener((changes) => {
    if (!changes.settings) return;
    const oldVal = changes.settings.oldValue || {};
    const newVal = changes.settings.newValue || {};

    const langChanged = oldVal.targetLang !== newVal.targetLang;
    const hiddenChanged = !!oldVal.hiddenMode !== !!newVal.hiddenMode;
    const styleChanged =
        oldVal.translationTextColor !== newVal.translationTextColor ||
        !!oldVal.showTranslationBg !== !!newVal.showTranslationBg ||
        oldVal.translationBgColor !== newVal.translationBgColor ||
        oldVal.translationFontSize !== newVal.translationFontSize;

    if (langChanged) {
        selectionApi.dismiss();
        hiddenMode = !!newVal.hiddenMode;
        if (enabled) {
            // refreshTranslation preserves revealed state in hidden mode
            refreshTranslation();
        } else {
            // Not enabled — just clear everything
            for (const span of document.querySelectorAll(`.${TRANSLATION_CLASS}`)) span.remove();
            for (const btn of document.querySelectorAll('.yi-reveal-btn')) btn.remove();
            for (const el of document.querySelectorAll(`[${TRANSLATED_ATTR}]`)) el.removeAttribute(TRANSLATED_ATTR);
            translatedCount = 0;
        }
        return;
    }

    if (styleChanged) {
        const bgColor = newVal.showTranslationBg ? newVal.translationBgColor : '';
        injectStyles(newVal.translationTextColor, bgColor, newVal.translationFontSize);
    }

    if (hiddenChanged) {
        hiddenMode = !!newVal.hiddenMode;
        applyHiddenMode();
    }

    if (!!oldVal.showFab !== !!newVal.showFab) {
        setFabVisible(newVal.showFab !== false);
    }
});

// Create floating button on load
createFab();

function setFabVisible(visible) {
    if (!fabHost || !fabWrap) return;
    if (visible) {
        fabHost.style.display = '';
        fabWrap.classList.remove('fab-leave');
        fabWrap.classList.add('fab-enter');
        const onEnd = () => {
            fabWrap.classList.remove('fab-enter');
            fabWrap.removeEventListener('animationend', onEnd);
        };
        fabWrap.addEventListener('animationend', onEnd);
    } else {
        fabWrap.classList.remove('fab-enter');
        fabWrap.classList.add('fab-leave');
        const onEnd = () => {
            fabHost.style.display = 'none';
            fabWrap.classList.remove('fab-leave');
            fabWrap.removeEventListener('animationend', onEnd);
        };
        fabWrap.addEventListener('animationend', onEnd);
    }
}

// Apply showFab setting on load
getSettings().then((s) => {
    if (s.showFab === false && fabHost) fabHost.style.display = 'none';
});

const selectionApi = initSelectionTranslate({ getMessages: () => t, enableTts: true });

} // end if (!isPdf)
