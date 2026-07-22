import browser from 'webextension-polyfill';
import { ACTION, LANGUAGES, YI_FONT_FACE } from './constants.js';
import { getSettings } from './storage.js';

// Injected by initSelectionTranslate()
let ttsEnabled = false;
let getMsg = () => ({});

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

let audioCtx = null;
let currentSource = null;
let activeTtsBtn = null;

function setTtsBtnPlaying(btn, playing) {
    if (!btn) return;
    btn.replaceChildren(playing ? createStopIcon() : createTtsIcon());
}

function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
}

function base64ToArrayBuffer(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
}

async function speakText(text, langCode, btn) {
    stopSpeech();
    try {
        const response = await browser.runtime.sendMessage({
            action: ACTION.TTS,
            text,
            lang: langCode,
        });
        if (!response || !response.success || !response.dataUrl) return;

        // Decode the base64 MP3 and play via Web Audio instead of an <audio>
        // data: URL — a page's CSP media-src can block data: audio in content
        // scripts (e.g. github.com), which fails silently.
        const b64 = response.dataUrl.split(',')[1] || '';
        const ctx = getAudioCtx();
        if (ctx.state === 'suspended') await ctx.resume();
        const audioBuffer = await ctx.decodeAudioData(base64ToArrayBuffer(b64));

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        source.onended = () => {
            if (currentSource !== source) return;
            setTtsBtnPlaying(activeTtsBtn, false);
            activeTtsBtn = null;
            currentSource = null;
        };
        currentSource = source;
        activeTtsBtn = btn || null;
        setTtsBtnPlaying(activeTtsBtn, true);
        source.start(0);
    } catch {
        // TTS unavailable
    }
}

function stopSpeech() {
    if (currentSource) {
        try {
            currentSource.onended = null;
            currentSource.stop();
        } catch {
            // already stopped
        }
        currentSource = null;
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
let selDetectedSrcLang = '';

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
    for (const lang of LANGUAGES) {
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
    closeBtn.title = getMsg().selectionClose;
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

    original.appendChild(originalText);
    if (ttsEnabled) {
        const originalTts = document.createElement('button');
        originalTts.className = 'sel-tts-btn';
        originalTts.appendChild(createTtsIcon());
        originalTts.addEventListener('click', (e) => {
            e.stopPropagation();
            if (activeTtsBtn === originalTts) { stopSpeech(); return; }
            const lang = selDetectedSrcLang || document.documentElement.lang || 'en';
            speakText(selText, lang, originalTts);
        });
        original.appendChild(originalTts);
    }

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

    selDetectedSrcLang = '';

    try {
        const response = await browser.runtime.sendMessage({
            action: ACTION.TRANSLATE,
            items: [{ id: 'sel-0', text: selText }],
            targetLang: selLang,
        });
        if (!selPopupEl) return; // dismissed while waiting
        if (response && response.success && response.results && response.results.length > 0) {
            const translated = response.results[0].translated;
            if (response.srcLang) selDetectedSrcLang = response.srcLang;
            body.className = 'sel-body-text';
            body.textContent = translated;

            if (ttsEnabled) {
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
            }
            positionPopup();
        } else {
            body.className = 'sel-body-text error';
            body.textContent = getMsg().selectionError;
        }
    } catch {
        if (!selPopupEl) return;
        body.className = 'sel-body-text error';
        body.textContent = getMsg().selectionError;
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
    selDetectedSrcLang = '';
}

function setupSelectionListeners() {
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

/**
 * Set up text-selection translation on the current page.
 * @param {object} opts
 * @param {() => object} opts.getMessages  Returns the current UI message map.
 * @param {boolean} [opts.enableTts]       Show TTS buttons (original + translation).
 * @returns {{ dismiss: () => void }}
 */
export function initSelectionTranslate({ getMessages, enableTts = false } = {}) {
    getMsg = getMessages || (() => ({}));
    ttsEnabled = !!enableTts;
    createSelHost();
    setupSelectionListeners();
    loadSelectionSettings();
    return { dismiss: dismissSelection };
}
