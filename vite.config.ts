import { defineConfig } from 'vite';
import {readFileSync} from 'node:fs';
const {version}=JSON.parse(readFileSync(new URL('package.json',import.meta.url),'utf8'));
export default defineConfig({define:{__APP_VERSION__:JSON.stringify(version)}, base: './', build: { manifest:true, rollupOptions: { input: { viewer: 'index.html', editor: 'editor.html' } }, chunkSizeWarningLimit: 9000 }, server: { host: '127.0.0.1' } });
