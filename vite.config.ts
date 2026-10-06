import { defineConfig } from 'vite';
export default defineConfig({ base: './', build: { manifest:true, rollupOptions: { input: { viewer: 'index.html', editor: 'editor.html' } }, chunkSizeWarningLimit: 9000 }, server: { host: '127.0.0.1' } });
