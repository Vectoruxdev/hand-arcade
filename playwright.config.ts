import { defineConfig, devices } from '@playwright/test';

// The arcade is always full screen on a 16:9 display. Every tool and smoke test runs at
// 1920×1080 with devicePixelRatio 2, the same frame the fps and capture gates use.
const viewport = { width: 1920, height: 1080 };
// Another checkout's `npm run dev` may hold 4800: ARCADE_PORT=4801 npm run test:e2e runs beside it.
const port = Number(process.env['ARCADE_PORT'] ?? 4800);

export default defineConfig({
  testDir: 'tools',
  testMatch: /.*\.spec\.ts$/,
  timeout: 30_000,
  fullyParallel: false,
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    viewport,
    deviceScaleFactor: 2,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport,
        deviceScaleFactor: 2,
        // WebGL and audio in headless Chromium: software GL is fine for the gates that run here.
        launchOptions: {
          args: ['--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader'],
        },
      },
    },
  ],
  webServer: {
    command: `npx vite --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env['CI'],
    timeout: 60_000,
  },
});
