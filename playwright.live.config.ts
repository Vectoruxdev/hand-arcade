import { defineConfig } from '@playwright/test';
import base from './playwright.config.ts';

// The same gates, pointed at a deployed arcade instead of the dev server:
//   ARCADE_BASE_URL=https://hand-arcade-xxxx.vercel.app npm run test:live
// Vercel Authentication must be off for the URL (the production domain is open by default).
// Smoke and games only: boards.spec and reef.spec import src/data modules through the dev server.
const baseURL = process.env['ARCADE_BASE_URL'];
if (!baseURL)
  throw new Error(
    'Set ARCADE_BASE_URL to the deployed arcade, e.g. https://hand-arcade-xxxx.vercel.app',
  );

export default defineConfig({
  ...base,
  use: { ...base.use, baseURL },
  webServer: undefined,
});
