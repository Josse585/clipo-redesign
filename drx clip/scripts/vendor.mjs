import { copyFile, mkdir } from 'node:fs/promises';
await mkdir(new URL('../public/vendor/', import.meta.url), { recursive: true });
await copyFile(new URL('../node_modules/mediabunny/dist/bundles/mediabunny.min.mjs', import.meta.url), new URL('../public/vendor/mediabunny-1.65.2.mjs', import.meta.url));
await copyFile(new URL('../node_modules/mediabunny/LICENSE', import.meta.url), new URL('../public/vendor/Mediabunny-LICENSE.txt', import.meta.url));
