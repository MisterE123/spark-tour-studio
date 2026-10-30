import { defineConfig } from 'vite';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {readStudioBuildInfo} from './scripts/studio-build-info.mjs';
const studioBuild=readStudioBuildInfo({cwd:fileURLToPath(new URL('./',import.meta.url))});
const {version}=JSON.parse(readFileSync(new URL('package.json',import.meta.url),'utf8'));
export default defineConfig({define:{__APP_VERSION__:JSON.stringify(version),__STUDIO_BUILD__:JSON.stringify(studioBuild)}, base: './', build: { manifest:true, rollupOptions: { input: { viewer: 'index.html', editor: 'editor.html' } }, chunkSizeWarningLimit: 9000 }, server: { host: '127.0.0.1' } });
