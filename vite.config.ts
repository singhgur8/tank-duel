import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build` -> normal PWA build in dist/ (installable, offline via service worker)
// `npm run build:single` -> one self-contained HTML file in dist-single/ (handy for previews)
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    copyPublicDir: mode !== 'single',
  },
  define: { __SINGLE_FILE__: JSON.stringify(mode === 'single') },
}));
