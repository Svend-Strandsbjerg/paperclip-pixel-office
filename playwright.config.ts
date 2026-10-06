import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/browser',
  use: { baseURL: 'http://127.0.0.1:4288', browserName: 'chromium' },
  webServer: { command: 'npm run preview -- --port 4288 --strictPort', url: 'http://127.0.0.1:4288', reuseExistingServer: false },
})
