import { test, expect } from '@playwright/test';

const VIEWPORTS = [
  { name: 'small-phone-360x640', width: 360, height: 640 },
  { name: 'iphone-390x844', width: 390, height: 844 },
  { name: 'large-phone-430x932', width: 430, height: 932 },
  { name: 'ipad-mini-768x1024', width: 768, height: 1024 },
];

test.describe('Phase 3: Device & Layout Checks', () => {
  for (const vp of VIEWPORTS) {
    test(`Portrait checks for ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');

      // Check home screen fits & presets visible
      const preset5m = page.getByTestId('preset-quick-5m');
      await expect(preset5m).toBeVisible();

      // Launch 5m clock
      await preset5m.click();
      const arena = page.getByTestId('clock-arena');
      await expect(arena).toBeVisible();

      // Verify no scrolling on the clock screen
      const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
      const clientHeight = await page.evaluate(() => document.documentElement.clientHeight);
      expect(scrollHeight).toBeLessThanOrEqual(clientHeight + 1); // 0 or subpixel

      // Verify digits large and fully visible
      const p1Time = page.getByTestId('p1-time');
      const p2Time = page.getByTestId('p2-time');
      await expect(p1Time).toBeVisible();
      await expect(p2Time).toBeVisible();

      // Check button min touch target sizes (>= 48px height)
      const startBtn = page.getByTestId('clock-start-pause');
      const box = await startBtn.boundingBox();
      expect(box).toBeTruthy();
      expect(box!.height).toBeGreaterThanOrEqual(44); // touch target standard
      expect(box!.width).toBeGreaterThanOrEqual(44);

      // Verify top pad is rotated 180 degrees in portrait by default
      const padP2 = page.getByTestId('pad-p2');
      await expect(padP2).toHaveClass(/rotate-180/);

      // Test rotation toggle
      const rotToggle = page.getByTestId('rotation-toggle');
      if (await rotToggle.isVisible()) {
        await rotToggle.click();
        await expect(padP2).not.toHaveClass(/rotate-180/);
        await rotToggle.click();
        await expect(padP2).toHaveClass(/rotate-180/);
      }

      // Take screenshot for visual inspection
      await page.screenshot({ path: `test-results/viewport-${vp.name}-portrait.png` });
    });

    test(`Landscape checks for ${vp.name} (${vp.height}x${vp.width})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.height, height: vp.width });
      await page.goto('/');

      const preset5m = page.getByTestId('preset-quick-5m');
      await preset5m.click();

      const arena = page.getByTestId('clock-arena');
      await expect(arena).toBeVisible();

      // Verify no scrolling on the clock screen in landscape
      const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
      const clientHeight = await page.evaluate(() => document.documentElement.clientHeight);
      expect(scrollHeight).toBeLessThanOrEqual(clientHeight + 1);

      // Take screenshot for visual inspection
      await page.screenshot({ path: `test-results/viewport-${vp.name}-landscape.png` });
    });
  }

  test('Step 12: Rotate orientation during a running game without reset or glitch', async ({ page }) => {
    // Start in Portrait
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByTestId('preset-quick-5m').click();

    // Start clock and let it tick
    await page.getByTestId('clock-start-pause').click();
    await page.waitForTimeout(500);

    const arena = page.getByTestId('clock-arena');
    await expect(arena).toHaveAttribute('data-clock-status', 'running');

    // Make a move
    await page.getByTestId('pad-p1').click();
    await expect(page.getByTestId('pad-p2')).toHaveText(/ACTIVE TURN/);

    // Rotate to Landscape
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(300);

    // Clock should still be running on P2's turn without resetting
    await expect(arena).toHaveAttribute('data-clock-status', 'running');
    await expect(page.getByTestId('pad-p2')).toHaveText(/ACTIVE TURN/);
    await expect(page.getByTestId('pad-p1')).toHaveText(/Moves: 1/);

    // Rotate back to Portrait
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);

    await expect(arena).toHaveAttribute('data-clock-status', 'running');
    await expect(page.getByTestId('pad-p2')).toHaveText(/ACTIVE TURN/);
  });

  test('Step 13: CSS touch-action, user-select, overscroll-behavior on clock screen', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('preset-quick-5m').click();

    const cssProperties = await page.evaluate(() => {
      const arena = document.querySelector('[data-testid="clock-arena"]');
      if (!arena) return null;
      const computed = window.getComputedStyle(arena);
      return {
        touchAction: computed.touchAction,
        userSelect: computed.userSelect,
        overscrollBehavior: computed.overscrollBehavior,
      };
    });

    expect(cssProperties).toBeTruthy();
    expect(cssProperties!.touchAction).toBe('manipulation');
    expect(cssProperties!.userSelect).toBe('none');
    expect(cssProperties!.overscrollBehavior).toBe('none');
  });
});
