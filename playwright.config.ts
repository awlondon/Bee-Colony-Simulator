import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

// A Chromium is preinstalled in the cloud sandbox; never download another one.
const sandboxChromium = '/opt/pw-browsers/chromium';

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      executablePath: existsSync(sandboxChromium) ? sandboxChromium : undefined,
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
    },
  },
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
