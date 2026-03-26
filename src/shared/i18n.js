export const EN_MESSAGES = {
    optionsTitle: '譯 - Settings',
    subtitle: 'Open-source bilingual translation',
    configSection: 'Settings',
    uiLangLabel: 'Settings UI language',
    prefSection: 'Full page translation',
    targetLangLabel: 'Target language',
    targetLangHint: 'Uses Google Translate (free). No API key required.',
    styleSection: 'Style',
    textColor: 'Text color',
    showBgColor: 'Show background color',
    preview: 'Preview',
    previewText: 'This is a sample translation preview.',
    save: 'Save',
    saved: 'Saved',
    popupDesc: 'Use the floating button on the page to enable / disable translation',
    settings: 'Settings',
    enableTip: 'Enable translation',
    disableTip: 'Disable translation',
    fontSize: 'Translation font size',
    hiddenMode: 'Hidden mode (click to reveal translation)',
    selectionSection: 'Text selection translation',
    selectionEnable: 'Enable selection translation',
    selectionAutoPopup: 'Auto show translation on selection',
    selectionLangLabel: 'Default language for selection',
    selectionTranslating: 'Translating…',
    selectionError: 'Translation failed',
    selectionClose: 'Close',
    pdfTranslate: 'Translate this PDF',
    pdfLoading: 'Loading…',
    pdfExtracting: 'Extracting text…',
    pdfTranslating: 'Translating…',
    pdfNoText: 'This PDF contains no extractable text (may be a scanned document).',
    pdfError: 'Failed to load PDF',
    pdfPage: 'Page {n}',
    pdfPermission: 'Permission needed to access this site and read the PDF',
    pdfAllow: 'Allow access',
    pdfFileAccess: 'Please enable "Allow access to file URLs" in extension settings',
    resetFab: 'Reset floating button position',
    resetFabDone: 'Reset done',
};

// Map browser language prefix → Google Translate language code (uppercase)
const BROWSER_LANG_MAP = {
    zh: null, // handled specially
    ja: 'JA', ko: 'KO', de: 'DE', fr: 'FR', es: 'ES',
    af: 'AF', sq: 'SQ', am: 'AM', ar: 'AR', hy: 'HY',
    az: 'AZ', eu: 'EU', be: 'BE', bn: 'BN', bs: 'BS',
    bg: 'BG', ca: 'CA', co: 'CO', hr: 'HR', cs: 'CS',
    da: 'DA', nl: 'NL', en: 'EN', eo: 'EO', et: 'ET',
    fi: 'FI', fy: 'FY', gl: 'GL', ka: 'KA', el: 'EL',
    gu: 'GU', ht: 'HT', ha: 'HA', he: 'IW', iw: 'IW',
    hi: 'HI', hu: 'HU', is: 'IS', ig: 'IG', id: 'ID',
    ga: 'GA', it: 'IT', jv: 'JW', jw: 'JW', kn: 'KN',
    kk: 'KK', km: 'KM', ku: 'KU', ky: 'KY', lo: 'LO',
    la: 'LA', lv: 'LV', lt: 'LT', lb: 'LB', mk: 'MK',
    mg: 'MG', ms: 'MS', ml: 'ML', mt: 'MT', mi: 'MI',
    mr: 'MR', mn: 'MN', my: 'MY', ne: 'NE', no: 'NO',
    nb: 'NO', nn: 'NO', ny: 'NY', ps: 'PS', fa: 'FA',
    pl: 'PL', pt: 'PT', pa: 'PA', ro: 'RO', ru: 'RU',
    sm: 'SM', gd: 'GD', sr: 'SR', st: 'ST', sn: 'SN',
    sd: 'SD', si: 'SI', sk: 'SK', sl: 'SL', so: 'SO',
    su: 'SU', sw: 'SW', sv: 'SV', tl: 'TL', tg: 'TG',
    ta: 'TA', te: 'TE', th: 'TH', tr: 'TR', uk: 'UK',
    ur: 'UR', uz: 'UZ', vi: 'VI', cy: 'CY', xh: 'XH',
    yi: 'YI', yo: 'YO', zu: 'ZU',
};

export function detectDefaultTargetLang() {
    const lang = navigator.language || 'en';
    if (lang.startsWith('zh')) {
        return (lang === 'zh-CN' || lang === 'zh-SG') ? 'ZH-HANS' : 'ZH-HANT';
    }
    const prefix = lang.split('-')[0].toLowerCase();
    return BROWSER_LANG_MAP[prefix] || 'EN';
}

export function detectDefaultUiLang() {
    return detectDefaultTargetLang();
}
