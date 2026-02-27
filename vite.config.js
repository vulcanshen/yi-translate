import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync } from 'fs';

export default defineConfig(({ mode }) => {
    const isFirefox = mode === 'firefox';
    const outDir = resolve(__dirname, isFirefox ? 'dist/firefox' : 'dist/chrome');

    return {
        root: resolve(__dirname, 'src'),

        build: {
            outDir,
            emptyOutDir: true,
            rollupOptions: {
                input: {
                    background: resolve(__dirname, 'src/background/index.js'),
                    popup:      resolve(__dirname, 'src/popup/index.html'),
                    options:    resolve(__dirname, 'src/options/index.html'),
                },
                output: {
                    entryFileNames: '[name]/index.js',
                    chunkFileNames: 'shared/[name].js',
                    assetFileNames: 'assets/[name].[ext]',
                },
            },
        },

        plugins: [
            {
                name: 'copy-manifest',
                closeBundle() {
                    const src = isFirefox
                        ? resolve(__dirname, 'manifest.firefox.json')
                        : resolve(__dirname, 'manifest.chrome.json');
                    copyFileSync(src, `${outDir}/manifest.json`);
                    console.log(`✓ Copied manifest → ${outDir}/manifest.json`);
                },
            },
            // content script 獨立打包成 IIFE
            {
                name: 'build-content-script',
                async closeBundle() {
                    const { build } = await import('vite');
                    await build({
                        root: resolve(__dirname, 'src'),
                        build: {
                            outDir,
                            emptyOutDir: false,  // 不清空，保留其他已打包的檔案
                            lib: {
                                entry: resolve(__dirname, 'src/content/index.js'),
                                name: 'FreeBabelContent',
                                formats: ['iife'],
                                fileName: () => 'content/index.js',
                            },
                        },
                    });
                },
            },
        ],
    };
});