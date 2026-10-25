import { defineConfig, devices } from '@playwright/test'

// End-to-end smoke tests against the production build (npm run build first).
export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.e2e.ts', // keeps Vitest (*.test.ts) and Playwright apart
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:4174', locale: 'pl-PL', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: { command: 'npx vite preview --port 4174 --strictPort', url: 'http://localhost:4174', reuseExistingServer: !process.env.CI },
})
