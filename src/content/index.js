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
let hiddenMode = false;
let revealedIds = new Set();

const HIDDEN_CLASS = 'yi-hidden';
const SKIP_SELECTOR = Array.from(SKIP_TAGS).join(',');
const ID_ATTR = 'data-yi-id';

// Zen Maru Gothic subset (譯 only, ~1KB woff2)
const YI_FONT_FACE = `@font-face { font-family: 'Yi'; src: url(data:font/woff2;base64,d09GMgABAAAAAAPIABAAAAAAB6wAAANwAAEAgwAAAAAAAAAAAAAAAAAAAAAAAAAAGYFSGyAcIAZgADQRCAqELINvATYCJAMGCwYABCAFg2wHIBckGAYbUgZAnge2bWMLnqhG5Sx2/WgyT8TD/6/R7pv5K+ZNQzQPzeX0jaJAq5REVGsk0mbmYq3tvXtSw5KJnogmhhAZUiQ0EqWxvH/vp1ByzyuIDd4gYvSIb47yVCVoDMp8907v2gPwngdYpIGF7WtMGtvWwD1AAskDnZN+Flga6LLNtrvACCJkmLq5QY9PbyVQbs+rgNK5heNr6O67mgDzxxrJw/wJKrHQPUclFLoXqCHBvBDIJL2aur6gFOSSavUKPiCKfYjcEVK0QNIqcLpPYa3X+MOEaWiyKFVTPAQVpjF8YAFsl4WVulUhVf4tIkFxCwAZh1P+gK8HSshe8ocAq5wtthRCHZRf7rnW5k8bsP4quz1bIKdoAemJTwNAQPziPwT6+ZEBD81iDggD+kEqEbzKvr2FTEEfBODwBpDx50mowifgDwCUXbVfz+OJ8nSroJhY5sslPj5sG+KrHSYyyWOBsT0l9rEwuL/hAbH2e3B1FxGqXg0SDlBrfCM7Cuwb4eNXC3FtF3t8tft3qP18F652zvzal6f5arewbQOuJhejisbHibWPDi0NrRrfV8bR3Tg/hfrD3uVD4vFVfBiwPMIrcLXKqH2dr3YNsd+XibOu5/gT6Qc+d/uOH/FO9jX65356/YLObx6iF05FKwY2tgb2+g4GtjYGDoW7f/Se8AOdO0PsH6UdqNglvnvoA+JD+ub2OrzhdRdTf6h88su8VQQ9a4HnJ0bSIdU3i7rmPSbGM+a6i2/yXBO/quhXtTL3kegjdzlRrl4bv/nan2VcgHM8YH2MPrJ704mAw/eB6VLHyQRpo9m92AT0Be8n9LR7NdT7FPBadeoauS0DAAiEW6GU57notN3/chL4BPg6ZJ4CwG8Vd29bb8uv8lOgVAaC9HTzkfwvGDeNEwQ1x0yfGoIgiyfQ7lEgD+R5KLNmlyUx4DU4Uej1gzK13qLclH+UjIcGKtEZXsRKDUeKLTKFS8OiMQx1c2Z6PEt87YNk7BFJkodOoDSmuj0yA4OFq9tgEizHoW7uz+UxKCxeNG0ajc2ZZ8JMwclE/70yGU1AosgkBt00r6J0QuylZZzBejyXSPhMQhzPwjyzo2VLHu041bDUdFIvAyYztLX3RvnwNqHRsUdPvX6narr9VGlRDgWFUQ/I83/uu1J155agCxBRgRzHAAA=) format('woff2'); }`;

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
            opacity: 0.6;
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
    if (!changes.settings || !enabled) return;
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
        hiddenMode = !!newVal.hiddenMode;
        refreshTranslation();
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
});

// Create floating button on load
createFab();

// ─── TTS (Text-to-Speech) ────────────────────────────────────────────

function createTtsIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 640 512');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M533.6 32.5C598.5 85.2 640 165.8 640 256s-41.5 170.7-106.4 223.5c-10.3 8.4-25.4 6.8-33.8-3.5s-6.8-25.4 3.5-33.8C557.5 398.2 592 331.2 592 256s-34.5-142.2-88.7-186.3c-10.3-8.4-11.8-23.5-3.5-33.8s23.5-11.8 33.8-3.5zM473.1 107c43.2 35.2 70.9 88.9 70.9 149s-27.7 113.8-70.9 149c-10.3 8.4-25.4 6.8-33.8-3.5s-6.8-25.4 3.5-33.8C475.3 341.3 496 301.1 496 256s-20.7-85.3-53.2-111.8c-10.3-8.4-11.8-23.5-3.5-33.8s23.5-11.8 33.8-3.5zm-60.5 74.5C434.1 199.1 448 225.9 448 256s-13.9 56.9-35.4 74.5c-10.3 8.4-25.4 6.8-33.8-3.5s-6.8-25.4 3.5-33.8C393.1 284.4 400 271 400 256s-6.9-28.4-17.7-37.3c-10.3-8.4-11.8-23.5-3.5-33.8s23.5-11.8 33.8-3.5zM301.1 34.8C312.6 40 320 51.4 320 64l0 384c0 12.6-7.4 24-18.9 29.2s-25 3.1-34.4-5.3L131.8 352 64 352c-35.3 0-64-28.7-64-64l0-64c0-35.3 28.7-64 64-64l67.8 0L266.7 40.1c9.4-8.4 22.9-10.4 34.4-5.3z');
    path.setAttribute('fill', 'currentColor');
    svg.appendChild(path);
    return svg;
}

function createStopIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 384 512');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M0 128C0 92.7 28.7 64 64 64H320c35.3 0 64 28.7 64 64V384c0 35.3-28.7 64-64 64H64c-35.3 0-64-28.7-64-64V128z');
    path.setAttribute('fill', 'currentColor');
    svg.appendChild(path);
    return svg;
}

let currentAudio = null;
let activeTtsBtn = null;

function setTtsBtnPlaying(btn, playing) {
    if (!btn) return;
    btn.replaceChildren(playing ? createStopIcon() : createTtsIcon());
}

async function speakText(text, langCode, btn) {
    stopSpeech();
    try {
        const response = await browser.runtime.sendMessage({
            action: ACTION.TTS,
            text,
            lang: langCode,
        });
        if (response && response.success) {
            currentAudio = new Audio(response.dataUrl);
            activeTtsBtn = btn || null;
            setTtsBtnPlaying(activeTtsBtn, true);
            currentAudio.addEventListener('ended', () => {
                setTtsBtnPlaying(activeTtsBtn, false);
                activeTtsBtn = null;
                currentAudio = null;
            });
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
    if (activeTtsBtn) {
        setTtsBtnPlaying(activeTtsBtn, false);
        activeTtsBtn = null;
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
let selAutoPopup = false;
let selDefaultLang = '';
let selRect = null;

function createSelHost() {
    selHost = document.createElement('div');
    selHost.id = 'yi-sel-host';
    selHost.style.cssText = 'position:fixed;z-index:2147483646;top:0;left:0;width:0;height:0;pointer-events:none;';
    selShadow = selHost.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = `
        ${YI_FONT_FACE}
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        .sel-trigger {
            position: fixed;
            width: 22px;
            height: 22px;
            border-radius: 2px 50% 50% 50%;
            border: 2px solid #C4A35A;
            background: #0066cc;
            color: #fff;
            font-family: 'Yi', sans-serif;
            font-size: 11px;
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
            border-radius: 10px 10px 2px 10px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            pointer-events: auto;
            z-index: 2147483646;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 14px;
            color: #333;
            overflow: auto;
            overscroll-behavior: contain;
            resize: both;
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
        .sel-body-text.loading {
            color: #0066cc;
            animation: sel-fade 1.5s ease-in-out infinite;
        }
        .sel-body-text .sel-badge {
            display: inline-block;
            font-size: 0.75em;
            font-weight: 700;
            background: #0066cc;
            color: #fff;
            border-radius: 3px;
            padding: 0 4px;
            margin-right: 4px;
            vertical-align: middle;
            line-height: 1.6;
        }
        @keyframes sel-fade {
            0%, 100% { opacity: 0.3; }
            50% { opacity: 0.8; }
        }
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
            .sel-body-text.loading { color: #4da6ff; }
            .sel-body-text.error { color: #ef5350; }
            .sel-tts-btn { color: #888; }
            .sel-tts-btn:hover { color: #4da6ff; background: #3a3a3a; }
        }
    `;
    selShadow.appendChild(style);
    document.documentElement.appendChild(selHost);
}

function setSelLoading(el) {
    el.textContent = '';
    const badge = document.createElement('span');
    badge.className = 'sel-badge';
    badge.textContent = '譯';
    el.appendChild(badge);
    el.appendChild(document.createTextNode(' ⋯'));
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
        if (sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            const rects = range.getClientRects();
            const r = rects.length > 0 ? rects[rects.length - 1] : range.getBoundingClientRect();
            const fr = range.getBoundingClientRect();
            selRect = { left: fr.left, right: r.right, top: r.top, bottom: r.bottom, fullTop: fr.top };
        }
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
        if (activeTtsBtn === originalTts) { stopSpeech(); return; }
        speakText(selText, pageLang, originalTts);
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
    setSelLoading(bodyText);

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
    let anchorX = 0, anchorY = 0;
    if (selRect) {
        anchorX = selRect.left;
        const popupHeight = selPopupEl.offsetHeight || 200;
        const selTop = selRect.fullTop != null ? selRect.fullTop : selRect.top;
        const spaceBelow = window.innerHeight - selRect.bottom - 6;
        const spaceAbove = selTop - 6;
        if (spaceBelow >= popupHeight) {
            // Enough room below selection
            anchorY = selRect.bottom + 6;
        } else if (spaceAbove >= popupHeight) {
            // Show above entire selection (use first line's top)
            anchorY = selTop - popupHeight - 6;
        } else {
            // Neither fits perfectly — pick the side with more space
            anchorY = spaceBelow >= spaceAbove
                ? selRect.bottom + 6
                : Math.max(8, selTop - popupHeight - 6);
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
    setSelLoading(body);

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
                if (activeTtsBtn === ttsBtn) { stopSpeech(); return; }
                speakText(translated, selLang, ttsBtn);
            });
            const bodyWrap = selPopupEl.querySelector('.sel-body-wrap');
            if (bodyWrap) bodyWrap.appendChild(ttsBtn);
            positionPopup();
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
    selRect = null;
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
            const rects = range.getClientRects();
            // Use last rect (end of selection) instead of full bounding box
            const rect = rects.length > 0 ? rects[rects.length - 1] : range.getBoundingClientRect();
            const fullRect = range.getBoundingClientRect();
            selRect = { left: fullRect.left, right: rect.right, top: rect.top, bottom: rect.bottom, fullTop: fullRect.top };
            if (selAutoPopup) {
                selText = text;
                showPopup();
            } else {
                const x = Math.min(rect.right + 2, window.innerWidth - 26);
                const y = rect.bottom + 2;
                showTrigger(x, y);
            }
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
        selAutoPopup = !!settings.selectionAutoPopup;
        selDefaultLang = settings.selectionTargetLang || settings.targetLang;
        selLang = selDefaultLang;
    });

    // Listen for settings changes
    browser.storage.onChanged.addListener((changes) => {
        if (changes.settings) {
            const s = { ...changes.settings.newValue };
            selEnabled = s.selectionTranslate !== false;
            selAutoPopup = !!s.selectionAutoPopup;
            selDefaultLang = s.selectionTargetLang || s.targetLang;
            selLang = selDefaultLang;
        }
    });
}

createSelHost();
initSelectionTranslate();
loadSelectionSettings();

} // end if (!isPdf)
