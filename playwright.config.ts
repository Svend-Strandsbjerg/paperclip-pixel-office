import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/browser',
  use: { baseURL: 'http://127.0.0.1:4288', browserName: 'chromium' },
  webServer: { command: 'OFFICE_MODE=demo HOST=127.0.0.1 PORT=4288 npm run start', url: 'http://127.0.0.1:4288/health', reuseExistingServer: false },
})
