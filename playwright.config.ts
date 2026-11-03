import { defineConfig, devices } from '@playwright/test';

// The arcade is always full screen on a 16:9 display. Every tool and smoke test runs at
// 1920×1080 with devicePixelRatio 2, the same frame the fps and capture gates use.
const viewport = { width: 1920, height: 1080 };

export default defineConfig({
  testDir: 'tools',
  testMatch: /.*\.spec\.ts$/,
  timeout: 30_000,
  fullyParallel: false,
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4800',
    viewport,
    deviceScaleFactor: 2,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport, deviceScaleFactor: 2 },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:4800',
    reuseExistingServer: !process.env['CI'],
    timeout: 60_000,
  },
});
