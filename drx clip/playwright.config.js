import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: 'media.spec.js', timeout: 180000, workers: 1, retries: 0,
  outputDir: 'test-results', reporter: [['list'],['html',{open:'never'}]],
  use: { baseURL:'http://127.0.0.1:4173', trace:'retain-on-failure', launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,args:['--autoplay-policy=no-user-gesture-required']} },
  webServer:{command:'node dev-server.mjs',env:{PORT:'4173'},url:'http://127.0.0.1:4173',reuseExistingServer:!process.env.CI},
});
