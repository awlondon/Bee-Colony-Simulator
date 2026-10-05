import { expect, test } from '@playwright/test';

test('audio starts on the first gesture and can be muted', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

  await page.goto('/');
  await page.waitForSelector('body[data-ready="true"]', { timeout: 60_000 });
  expect(await page.evaluate(() => window.__game!.audio.running)).toBe(false);

  await page.mouse.click(640, 360); // first gesture
  await expect.poll(() => page.evaluate(() => window.__game!.audio.running), { timeout: 10_000 }).toBe(true);

  await expect(page.locator('#h-mute')).toHaveText('Sound');
  await page.keyboard.press('KeyM');
  await expect(page.locator('#h-mute')).toHaveText('Muted');
  expect(await page.evaluate(() => window.__game!.audio.muted)).toBe(true);

  // The choice is remembered.
  await page.reload();
  await page.waitForSelector('body[data-ready="true"]', { timeout: 60_000 });
  await expect(page.locator('#h-mute')).toHaveText('Muted');
  await page.locator('#h-mute').click();
  await expect(page.locator('#h-mute')).toHaveText('Sound');

  expect(problems).toEqual([]);
});
