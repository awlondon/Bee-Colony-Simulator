import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const SHOTS = 'e2e/screenshots';

/** Project a world position to canvas pixel coordinates using the live camera. */
async function screenOf(page: import('@playwright/test').Page, x: number, y: number, z: number): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([wx, wy, wz]) => {
      const g = window.__game!;
      const cam = g.renderer.rig.camera;
      cam.updateMatrixWorld();
      const v = cam.position.clone().set(wx, wy, wz).project(cam);
      const c = g.canvasEl;
      return { x: ((v.x + 1) / 2) * c.clientWidth, y: ((1 - v.y) / 2) * c.clientHeight };
    },
    [x, y, z],
  );
}

test('beekeeper UI: select hive, inspect, plant, trends and minimap', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true });
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

  await page.goto('/');
  await page.waitForSelector('body[data-ready="true"]', { timeout: 60_000 });
  await page.evaluate(() => {
    window.__game!.human.focusOn(4, 12, 24);
    window.__game!.world.advanceCoarse(8 * 60);
  });
  await page.waitForTimeout(1200);

  // Minimap exists and was drawn.
  await expect(page.locator('#p-map canvas')).toBeVisible();

  // Trends sparklines appear once there is history.
  await expect(page.locator('#a-body svg').first()).toBeVisible({ timeout: 5000 });

  // Select the hive with a real click.
  const hive = await page.evaluate(() => {
    const h = window.__game!.world.state.colony.hivePos;
    return { x: h.x, y: h.y + 0.5, z: h.z };
  });
  const hp = await screenOf(page, hive.x, hive.y, hive.z);
  await page.mouse.click(hp.x, hp.y);
  await expect(page.locator('#s-actions button', { hasText: 'Inspect' })).toBeVisible();

  await page.locator('#s-actions button', { hasText: 'Inspect' }).click();
  await expect(page.locator('.toast', { hasText: 'Inspection' })).toBeVisible();

  // Feeding spends syrup stock.
  const syrupBefore = await page.evaluate(() => window.__game!.world.state.keeper.syrup);
  await page.locator('#s-actions button', { hasText: 'Feed 1 kg' }).click();
  expect(await page.evaluate(() => window.__game!.world.state.keeper.syrup)).toBeLessThan(syrupBefore);

  // Add a super and see the funds drop.
  const fundsBefore = await page.evaluate(() => window.__game!.world.state.keeper.money);
  await page.locator('#s-actions button', { hasText: 'Add super' }).click();
  expect(await page.evaluate(() => window.__game!.world.state.keeper.money)).toBe(fundsBefore - 40);
  await page.screenshot({ path: `${SHOTS}/human-ui.png` });

  // Plant a daisy patch on a free spot.
  const spot = await page.evaluate(() => {
    const w = window.__game!.world.state;
    for (let a = 0; a < 6.28; a += 0.2) {
      const x = Math.cos(a) * 32;
      const z = Math.sin(a) * 32;
      if (!w.patches.some((p) => Math.hypot(p.pos.x - x, p.pos.z - z) < 9)) return { x, z };
    }
    return { x: 0, z: 0 };
  });
  await page.evaluate(([x, z]) => window.__game!.human.focusOn(x, z, 20), [spot.x, spot.z]);
  await page.waitForTimeout(500);
  const before = await page.evaluate(() => window.__game!.world.state.patches.length);
  await page.locator('[data-plant="daisy"]').click();
  await expect.poll(() => page.evaluate(() => window.__game!.human.planting)).toBe('daisy');
  const gp = await screenOf(page, spot.x, 0, spot.z);
  await page.mouse.move(gp.x, gp.y);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/planting.png` });
  await page.mouse.click(gp.x, gp.y);
  await expect.poll(() => page.evaluate(() => window.__game!.world.state.patches.length)).toBe(before + 1);
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.__game!.human.planting)).toBeNull();

  expect(problems).toEqual([]);
});
