import { defineConfig } from '@playwright/test'
const port = process.env.OFFICE_TEST_PORT || '4288'
export default defineConfig({
  testDir: './tests/browser',
  use: { baseURL: `http://127.0.0.1:${port}`, browserName: 'chromium' },
  webServer: { command: `OFFICE_MODE=demo HOST=127.0.0.1 PORT=${port} npm run start`, url: `http://127.0.0.1:${port}/health`, reuseExistingServer: false },
})
