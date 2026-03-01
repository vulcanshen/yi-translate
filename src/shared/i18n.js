const messages = {
    'zh-TW': {
        optionsTitle: '譯 - 設定',
        subtitle: '開源雙語對照翻譯',
        prefSection: '翻譯偏好',
        targetLangLabel: '翻譯目標語言',
        targetLangHint: '使用 Google Translate 免費翻譯，不需要 API Key。',
        styleSection: '翻譯樣式',
        textColor: '文字顏色',
        showBgColor: '顯示背景色',
        preview: '預覽',
        previewText: '這是翻譯預覽範例文字。',
        save: '儲存設定',
        saved: '已儲存',
        popupDesc: '使用頁面上的浮動按鈕來啟用／停用翻譯',
        settings: '設定',
        enableTip: '啟用翻譯',
        disableTip: '停用翻譯',
    },
    'zh-CN': {
        optionsTitle: '译 - 设置',
        subtitle: '开源双语对照翻译',
        prefSection: '翻译偏好',
        targetLangLabel: '翻译目标语言',
        targetLangHint: '使用 Google Translate 免费翻译，不需要 API Key。',
        styleSection: '翻译样式',
        textColor: '文字颜色',
        showBgColor: '显示背景色',
        preview: '预览',
        previewText: '这是翻译预览示例文字。',
        save: '保存设置',
        saved: '已保存',
        popupDesc: '使用页面上的浮动按钮来启用／停用翻译',
        settings: '设置',
        enableTip: '启用翻译',
        disableTip: '停用翻译',
    },
    en: {
        optionsTitle: '譯 - Settings',
        subtitle: 'Open-source bilingual translation',
        prefSection: 'Translation',
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
    },
    ja: {
        optionsTitle: '譯 - 設定',
        subtitle: 'オープンソースのバイリンガル翻訳',
        prefSection: '翻訳設定',
        targetLangLabel: '翻訳先の言語',
        targetLangHint: 'Google Translate（無料）を使用。APIキー不要。',
        styleSection: 'スタイル',
        textColor: '文字色',
        showBgColor: '背景色を表示',
        preview: 'プレビュー',
        previewText: 'これは翻訳プレビューのサンプルです。',
        save: '保存',
        saved: '保存しました',
        popupDesc: 'ページ上のフローティングボタンで翻訳のON/OFFを切り替えます',
        settings: '設定',
        enableTip: '翻訳を有効にする',
        disableTip: '翻訳を無効にする',
    },
    ko: {
        optionsTitle: '譯 - 설정',
        subtitle: '오픈소스 이중 언어 번역',
        prefSection: '번역 설정',
        targetLangLabel: '번역 대상 언어',
        targetLangHint: 'Google Translate(무료)를 사용합니다. API 키 불필요.',
        styleSection: '스타일',
        textColor: '텍스트 색상',
        showBgColor: '배경색 표시',
        preview: '미리보기',
        previewText: '번역 미리보기 샘플 텍스트입니다.',
        save: '저장',
        saved: '저장됨',
        popupDesc: '페이지의 플로팅 버튼을 사용하여 번역을 켜고 끄세요',
        settings: '설정',
        enableTip: '번역 활성화',
        disableTip: '번역 비활성화',
    },
};

export function detectLocale() {
    const lang = navigator.language || 'en';
    if (lang.startsWith('zh')) {
        return (lang === 'zh-CN' || lang === 'zh-SG') ? 'zh-CN' : 'zh-TW';
    }
    if (lang.startsWith('ja')) return 'ja';
    if (lang.startsWith('ko')) return 'ko';
    return 'en';
}

export function detectDefaultTargetLang() {
    const lang = navigator.language || 'en';
    if (lang.startsWith('zh')) {
        return (lang === 'zh-CN' || lang === 'zh-SG') ? 'ZH-HANS' : 'ZH-HANT';
    }
    if (lang.startsWith('ja')) return 'JA';
    if (lang.startsWith('ko')) return 'KO';
    if (lang.startsWith('de')) return 'DE';
    if (lang.startsWith('fr')) return 'FR';
    if (lang.startsWith('es')) return 'ES';
    return 'EN';
}

const locale = detectLocale();
export const t = messages[locale] || messages.en;
