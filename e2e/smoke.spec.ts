import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const SHOTS = 'e2e/screenshots';

test('meadow renders and Tab switches between Human and Bee mode', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true });
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

  await page.goto('/');
  await expect(page.locator('canvas#game')).toBeVisible();
  await page.waitForSelector('body[data-ready="true"]', { timeout: 60_000 });
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'human');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/human.png` });

  // Instancing keeps the whole meadow, hundreds of bees included, to a handful of draw calls.
  const calls = await page.evaluate(() => window.__game!.renderer.gl.info.render.calls);
  console.log(`draw calls per frame: ${calls}`);
  expect(calls).toBeGreaterThan(0);
  expect(calls).toBeLessThan(80);

  const visible = await page.evaluate(() => window.__game!.stats.visibleBees);
  expect(visible).toBeGreaterThan(5);
  await expect(page.locator('#c-workers')).not.toHaveText('0');

  await page.keyboard.press('Tab');
  await page.waitForSelector('body[data-mode="bee"]', { timeout: 15_000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/bee.png` });
  const possessed = await page.evaluate(() => window.__game!.world.state.possessedBeeId);
  expect(possessed).not.toBeNull();

  // Fly forward for a moment: the possessed bee must actually move.
  const before = await page.evaluate(() => {
    const b = window.__game!.world.possessedBee()!;
    return { x: b.pos.x, y: b.pos.y, z: b.pos.z };
  });
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1500);
  await page.keyboard.up('KeyW');
  const after = await page.evaluate(() => {
    const b = window.__game!.world.possessedBee()!;
    return { x: b.pos.x, y: b.pos.y, z: b.pos.z };
  });
  expect(Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z)).toBeGreaterThan(1);
  await page.screenshot({ path: `${SHOTS}/bee-flying.png` });

  await page.keyboard.press('Tab');
  await page.waitForSelector('body[data-mode="human"]', { timeout: 15_000 });
  expect(await page.evaluate(() => window.__game!.world.state.possessedBeeId)).toBeNull();

  expect(problems).toEqual([]);
});
