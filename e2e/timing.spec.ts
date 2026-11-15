import { test, expect } from '@playwright/test';

test.describe('Phase 2 Step 10: Timing Accuracy in Real Browser', () => {
  test.setTimeout(120_000);

  test('Timestamp timing matches real wall-clock time within 50ms and survives 30s backgrounding', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('preset-quick-1m').click();

    // Start clock and record exact browser timestamp at start
    const browserStartMs = await page.evaluate(() => {
      const startBtn = document.querySelector('[data-testid="clock-start-pause"]') as HTMLButtonElement;
      startBtn.click();
      return Date.now();
    });

    // Verify clock is ticking
    const arena = page.getByTestId('clock-arena');
    await expect(arena).toHaveAttribute('data-clock-status', 'running');

    // Simulate tab backgrounding / lock for 30 seconds
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Wait 30 seconds while "backgrounded"
    await page.waitForTimeout(30_000);

    // Simulate returning to tab / unlocking device and immediately pause
    const { browserEndMs, remainingMs } = await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));

      const pauseBtn = document.querySelector('[data-testid="clock-start-pause"]') as HTMLButtonElement;
      pauseBtn.click();
      const endMs = Date.now();

      const raw = localStorage.getItem('chronomate_active_match_v1');
      const parsed = raw ? JSON.parse(raw) : null;
      return {
        browserEndMs: endMs,
        remainingMs: parsed?.state?.p1TimeMs ?? 0,
      };
    });

    // Actual wall clock elapsed inside the browser
    const realElapsedMs = browserEndMs - browserStartMs;
    // Engine clock deducted elapsed time
    const engineElapsedMs = 60_000 - remainingMs;

    const driftMs = Math.abs(realElapsedMs - engineElapsedMs);
    console.log(`Real browser time: ${realElapsedMs}ms, Engine time: ${engineElapsedMs}ms, Drift: ${driftMs}ms`);

    // Must be within 50ms of real wall-clock time (timestamp-anchored)
    expect(driftMs).toBeLessThan(50);
  });
});
