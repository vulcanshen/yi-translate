import browser from 'webextension-polyfill';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import { ACTION, SUGGESTED_LANGUAGES, ALL_LANGUAGES, BATCH_SIZE } from '../shared/constants.js';
import { getSettings } from '../shared/storage.js';
import { t } from '../shared/i18n.js';

// pdf.js worker — copied to same directory by vite plugin
GlobalWorkerOptions.workerSrc = './pdf.worker.min.mjs';

// DOM
const contentEl = document.getElementById('content');
const loadingState = document.getElementById('loading-state');
const loadingText = document.getElementById('loading-text');
const errorState = document.getElementById('error-state');
const errorText = document.getElementById('error-text');
const permissionState = document.getElementById('permission-state');
const permissionText = document.getElementById('permission-text');
const permissionBtn = document.getElementById('permission-btn');
const docTitle = document.getElementById('doc-title');
const pageInfo = document.getElementById('page-info');
const langSelect = document.getElementById('target-lang');

let pdfUrl = '';
let targetLang = '';
let translationColor = '#C4A35A';
let translationBgColor = '';
let showBg = false;

// ─── Language selector ───────────────────────────────────────────────
const popGroup = document.createElement('optgroup');
popGroup.label = '★';
for (const lang of SUGGESTED_LANGUAGES) {
    const opt = document.createElement('option');
    opt.value = lang.value;
    opt.textContent = lang.label;
    popGroup.appendChild(opt);
}
langSelect.appendChild(popGroup);
const allGroup = document.createElement('optgroup');
allGroup.label = '⋯';
for (const lang of ALL_LANGUAGES) {
    const opt = document.createElement('option');
    opt.value = lang.value;
    opt.textContent = lang.label;
    allGroup.appendChild(opt);
}
langSelect.appendChild(allGroup);
langSelect.addEventListener('change', () => {
    targetLang = langSelect.value;
    retranslateAll();
});

// ─── Init ────────────────────────────────────────────────────────────
async function init() {
    const settings = await getSettings();
    targetLang = settings.targetLang;
    translationColor = settings.translationTextColor || '#C4A35A';
    showBg = !!settings.showTranslationBg;
    translationBgColor = settings.translationBgColor || '';
    langSelect.value = targetLang;
    applyColors();

    // Read PDF URL from query string
    const params = new URLSearchParams(location.search);
    pdfUrl = params.get('url');
    if (!pdfUrl) {
        showError(t.pdfError);
        return;
    }

    // Title
    try {
        const name = decodeURIComponent(pdfUrl.split('/').pop().split('?')[0]);
        docTitle.textContent = name || 'PDF';
        document.title = `譯 — ${name || 'PDF'}`;
    } catch {
        docTitle.textContent = 'PDF';
    }

    loadingText.textContent = t.pdfLoading;

    if (pdfUrl.startsWith('file://')) {
        showState('permission');
        permissionText.textContent = t.pdfFileAccess;
        permissionBtn.style.display = 'none';
        return;
    }

    await loadPdf();
}

function applyColors() {
    let style = document.getElementById('yi-colors');
    if (!style) {
        style = document.createElement('style');
        style.id = 'yi-colors';
        document.head.appendChild(style);
    }
    const bgRule = showBg && translationBgColor
        ? `background-color: ${translationBgColor}; border-radius: 4px; padding: 4px 4px 4px 8px;`
        : '';
    style.textContent = `
        .pdf-trans { color: ${translationColor}; border-left-color: ${translationColor}; ${bgRule} }
        .yi-badge { background: ${translationColor}; }
    `;
}

function showState(which) {
    loadingState.style.display = which === 'loading' ? 'flex' : 'none';
    errorState.style.display = which === 'error' ? 'flex' : 'none';
    permissionState.style.display = which === 'permission' ? 'flex' : 'none';
    contentEl.style.display = which === 'content' ? '' : 'none';
}

function showError(msg) {
    showState('error');
    errorText.textContent = msg;
}

function showPermissionPrompt(origin) {
    showState('permission');
    permissionText.textContent = t.pdfPermission;
    permissionBtn.textContent = t.pdfAllow;
    permissionBtn.style.display = '';
    permissionBtn.onclick = async () => {
        try {
            const granted = await browser.permissions.request({ origins: [origin] });
            if (granted) {
                showState('loading');
                loadingText.textContent = t.pdfLoading;
                await loadPdf();
            }
        } catch (err) {
            console.error('[譯] Permission request failed:', err);
        }
    };
}

// ─── Fetch PDF via background ────────────────────────────────────────
async function fetchPdfData() {
    const resp = await browser.runtime.sendMessage({
        action: ACTION.PDF_FETCH,
        url: pdfUrl,
    });
    if (!resp || !resp.success) throw new Error(resp?.error || 'fetch failed');
    const bin = atob(resp.data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}

// ─── Load & extract ──────────────────────────────────────────────────
async function loadPdf() {
    try {
        loadingText.textContent = t.pdfLoading;
        let pdfData;
        try {
            pdfData = await fetchPdfData();
        } catch (err) {
            if (err.message && /40[13]|Failed to fetch/.test(err.message)) {
                try {
                    showPermissionPrompt(new URL(pdfUrl).origin + '/*');
                } catch { showError(t.pdfError + ': ' + err.message); }
                return;
            }
            showError(t.pdfError + ': ' + err.message);
            return;
        }

        loadingText.textContent = t.pdfExtracting;
        const pdf = await getDocument({ data: pdfData }).promise;
        const total = pdf.numPages;
        if (total === 0) { showError(t.pdfNoText); return; }

        pageInfo.textContent = `${total} pages`;

        const pages = [];
        let hasText = false;
        for (let i = 1; i <= total; i++) {
            const page = await pdf.getPage(i);
            const tc = await page.getTextContent();
            const paras = groupIntoParagraphs(tc.items);
            if (paras.length > 0) hasText = true;
            pages.push({ num: i, paras });
        }

        if (!hasText) { showError(t.pdfNoText); return; }

        showState('content');
        renderPages(pages);
        observePages();
    } catch (err) {
        console.error('[譯] PDF load error:', err);
        showError(t.pdfError + ': ' + err.message);
    }
}

// ─── Text grouping ──────────────────────────────────────────────────
function groupIntoParagraphs(items) {
    const sorted = items
        .filter((it) => it.str && it.str.trim())
        .map((it) => ({
            text: it.str,
            x: it.transform[4],
            y: it.transform[5],
            h: it.height || 12,
        }));
    if (sorted.length === 0) return [];

    sorted.sort((a, b) => b.y - a.y || a.x - b.x);

    // Group into lines
    const lines = [];
    let line = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
        const prev = line[0];
        const cur = sorted[i];
        if (Math.abs(cur.y - prev.y) < prev.h * 0.5) {
            line.push(cur);
        } else {
            line.sort((a, b) => a.x - b.x);
            lines.push(line.map((it) => it.text).join(' '));
            line = [cur];
        }
    }
    line.sort((a, b) => a.x - b.x);
    lines.push(line.map((it) => it.text).join(' '));

    // Group lines into paragraphs
    const paras = [];
    let cur = [];
    for (const l of lines) {
        const t = l.trim();
        if (!t) {
            if (cur.length) { paras.push(cur.join(' ')); cur = []; }
        } else {
            cur.push(t);
        }
    }
    if (cur.length) paras.push(cur.join(' '));
    return paras.filter((p) => p.length >= 4);
}

// ─── Render ──────────────────────────────────────────────────────────
function renderPages(pages) {
    contentEl.innerHTML = '';
    for (const page of pages) {
        const el = document.createElement('div');
        el.className = 'pdf-page';
        el.dataset.page = page.num;

        const hdr = document.createElement('div');
        hdr.className = 'page-header';
        hdr.textContent = t.pdfPage.replace('{n}', page.num);
        el.appendChild(hdr);

        for (const para of page.paras) {
            const p = document.createElement('div');
            p.className = 'pdf-para';
            p.textContent = para;
            el.appendChild(p);
        }
        contentEl.appendChild(el);
    }
}

// ─── Lazy translate ──────────────────────────────────────────────────
let pageObserver = null;
const translatedPages = new Set();

function observePages() {
    if (pageObserver) pageObserver.disconnect();
    pageObserver = new IntersectionObserver((entries) => {
        for (const e of entries) {
            if (!e.isIntersecting) continue;
            const n = parseInt(e.target.dataset.page, 10);
            if (translatedPages.has(n)) continue;
            translatedPages.add(n);
            pageObserver.unobserve(e.target);
            translatePage(e.target);
        }
    }, { rootMargin: '300px' });

    for (const el of contentEl.querySelectorAll('.pdf-page')) {
        pageObserver.observe(el);
    }
}

async function translatePage(pageEl) {
    const paras = pageEl.querySelectorAll('.pdf-para');
    const items = [];

    for (const pEl of paras) {
        if (pEl.querySelector('.pdf-trans')) continue;
        const id = `p${pageEl.dataset.page}-${items.length}`;
        const text = pEl.textContent.trim();
        if (text.length < 4) continue;

        const span = document.createElement('span');
        span.className = 'pdf-trans yi-loading';
        span.dataset.yiId = id;
        const badge = document.createElement('span');
        badge.className = 'yi-badge';
        badge.textContent = '譯';
        span.appendChild(badge);
        span.appendChild(document.createTextNode(' ⋯'));
        pEl.appendChild(span);

        items.push({ id, text, el: pEl });
    }
    if (items.length === 0) return;

    for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const batch = items.slice(i, i + BATCH_SIZE);
        const msg = batch.map((it) => ({ id: it.id, text: it.text }));
        const resp = await sendWithRetry(msg);

        if (!resp || !resp.success) {
            for (const it of batch) {
                const ph = pageEl.querySelector(`[data-yi-id="${it.id}"]`);
                if (ph) ph.remove();
            }
            continue;
        }

        for (const r of resp.results) {
            const span = pageEl.querySelector(`[data-yi-id="${r.id}"]`);
            if (!span) continue;
            const item = batch.find((it) => it.id === r.id);
            if (item && (r.translated === item.text || !r.translated)) {
                span.remove();
                continue;
            }
            span.textContent = r.translated;
            span.classList.remove('yi-loading');
        }
    }
}

async function sendWithRetry(items) {
    while (true) {
        try {
            const resp = await browser.runtime.sendMessage({
                action: ACTION.TRANSLATE,
                items,
                targetLang,
            });
            if (!resp) return null;
            if (resp.error === 'RATE_LIMITED') {
                await new Promise((r) => setTimeout(r, (resp.retryAfter || 60) * 1000));
                continue;
            }
            return resp;
        } catch (err) {
            console.error('[譯] translate error:', err.message);
            return null;
        }
    }
}

function retranslateAll() {
    for (const el of contentEl.querySelectorAll('.pdf-trans')) el.remove();
    translatedPages.clear();
    observePages();
}

// ─── Start ───────────────────────────────────────────────────────────
init();
