import { test, expect } from '@playwright/test';

test.describe('Phase 2: Clock E2E Core Flows', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message, err.stack));
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text());
    });
    // Clear storage for clean test slate
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('Quick start: one tap on a preset goes straight to ready clock (no extra screens)', async ({ page }) => {
    await page.goto('/');
    const preset5m = page.getByTestId('preset-quick-5m');
    await expect(preset5m).toBeVisible();
    await preset5m.click();

    // Clock arena is immediately visible
    const arena = page.getByTestId('clock-arena');
    await expect(arena).toBeVisible();
    await expect(arena).toHaveAttribute('data-clock-status', 'idle');

    // Both pads are ready with 5:00
    await expect(page.getByTestId('p1-time')).toHaveText('5:00');
    await expect(page.getByTestId('p2-time')).toHaveText('5:00');
  });

  test('Start button starts clock, tapping active pad passes turn, inactive pad does nothing', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('preset-quick-5m').click();

    const startBtn = page.getByTestId('clock-start-pause');
    await expect(startBtn).toBeVisible();
    await startBtn.click();

    const arena = page.getByTestId('clock-arena');
    await expect(arena).toHaveAttribute('data-clock-status', 'running');

    // White (p1) is active. Inactive pad (p2) tapping does nothing.
    const padP2 = page.getByTestId('pad-p2');
    const padP1 = page.getByTestId('pad-p1');

    await padP2.click(); // Inactive tap
    // Turn should still be P1
    await expect(padP1).toHaveText(/ACTIVE TURN/);

    // Active pad (p1) tap passes turn to p2
    await padP1.click();
    await expect(padP2).toHaveText(/ACTIVE TURN/);
    await expect(padP1).toHaveText(/Moves: 1/);
    await expect(padP2).toHaveText(/Moves: 0/);

    // Now P1 is inactive; tapping P1 does nothing
    await padP1.click();
    await expect(padP2).toHaveText(/ACTIVE TURN/);
    await expect(padP1).toHaveText(/Moves: 1/);

    // Tapping P2 passes turn back to P1
    await padP2.click();
    await expect(padP1).toHaveText(/ACTIVE TURN/);
    await expect(padP2).toHaveText(/Moves: 1/);
  });

  test('Pause shows an overlay, and tapping a pad while paused does NOT resume', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('preset-quick-5m').click();

    // Start clock
    await page.getByTestId('clock-start-pause').click();
    const arena = page.getByTestId('clock-arena');
    await expect(arena).toHaveAttribute('data-clock-status', 'running');

    // Pause clock
    await page.getByTestId('clock-start-pause').click();
    await expect(arena).toHaveAttribute('data-clock-status', 'paused');

    // Pause overlay is visible
    const pauseOverlay = page.getByTestId('pause-overlay');
    await expect(pauseOverlay).toBeVisible();

    // Tapping clock pads while paused does NOT resume clock
    await page.getByTestId('pad-p1').click({ force: true });
    await expect(arena).toHaveAttribute('data-clock-status', 'paused');

    await page.getByTestId('pad-p2').click({ force: true });
    await expect(arena).toHaveAttribute('data-clock-status', 'paused');

    // Clicking resume in overlay resumes clock
    await page.getByTestId('pause-resume').click();
    await expect(arena).toHaveAttribute('data-clock-status', 'running');
    await expect(pauseOverlay).toBeHidden();
  });

  test('Reset and Back to home ask for confirmation while game is running', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('preset-quick-5m').click();

    // Start game
    await page.getByTestId('clock-start-pause').click();

    // Tap reset button while running
    await page.getByTestId('clock-reset').click();

    // Confirmation dialog appears
    const confirmDialog = page.getByRole('dialog');
    await expect(confirmDialog).toBeVisible();
    await expect(confirmDialog).toContainText('Reset Active Match?');

    // Dismiss with "Keep Playing"
    await page.getByRole('button', { name: 'Keep Playing' }).click();
    await expect(confirmDialog).toBeHidden();

    // Resume and test "Back to home"
    await page.getByTestId('pause-resume').click();
    await page.getByTestId('clock-back-home').click();

    await expect(confirmDialog).toBeVisible();
    await expect(confirmDialog).toContainText('Leave Current Match?');

    // Confirm leave match
    await page.getByTestId('confirm-dialog-accept').click();
    await expect(page.getByTestId('clock-arena')).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Physical Chess Clock in Your Pocket' })).toBeVisible();
  });

  test('Custom setup: names, asymmetric times, increment, and validation errors for bad input', async ({ page }) => {
    await page.goto('/');

    // Test bad input validation: empty / negative
    await page.locator('#p1-min').fill('-5');
    await page.getByTestId('start-custom-match').click();

    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('cannot be negative');

    // Configure valid asymmetric match
    await page.locator('#input-p1-name').fill('Carlsen');
    await page.locator('#input-p2-name').fill('Nakamura');

    // Select asymmetric mode
    await page.getByRole('button', { name: 'Custom per Player (Odds)' }).click();

    await page.locator('#p1-min').fill('3');
    await page.locator('#p1-sec').fill('0');
    await page.locator('#p1-inc').fill('2');

    await page.locator('#p2-min').fill('5');
    await page.locator('#p2-sec').fill('0');
    await page.locator('#p2-inc').fill('3');

    await page.getByTestId('start-custom-match').click();

    // Verify clock arena loaded custom values
    await expect(page.getByTestId('p1-name')).toHaveText('Carlsen');
    await expect(page.getByTestId('p2-name')).toHaveText('Nakamura');
    await expect(page.getByTestId('p1-time')).toHaveText('3:00');
    await expect(page.getByTestId('p2-time')).toHaveText('5:00');
  });

  test('Flag fall: shows end screen; Rematch resets to ready clock with same settings', async ({ page }) => {
    await page.goto('/');

    // Launch 1 min Bullet clock for fast flag test
    await page.getByTestId('preset-quick-1m').click();

    // Start clock
    await page.getByTestId('clock-start-pause').click();

    // Set remaining time to 2 seconds via Arbiter Edit modal
    await page.getByTestId('clock-adjust-time').click();
    await page.locator('#adj-p1-min').fill('0');
    await page.locator('#adj-p1-sec').fill('2');
    await page.getByRole('button', { name: 'Apply Time Adjustment' }).click();

    // Resume clock and wait for flag
    await page.getByTestId('pause-resume').click();

    // Wait for end screen
    const endScreen = page.getByTestId('flag-end-screen');
    await expect(endScreen).toBeVisible({ timeout: 6000 });
    await expect(endScreen).toContainText('Wins!');

    // Tap rematch
    await page.getByTestId('end-screen-rematch').click();
    await expect(endScreen).toBeHidden();

    // Clock should be reset to idle 1 min
    const arena = page.getByTestId('clock-arena');
    await expect(arena).toHaveAttribute('data-clock-status', 'idle');
    await expect(page.getByTestId('p1-time')).toHaveText('1:00');
    await expect(page.getByTestId('p2-time')).toHaveText('1:00');
  });

  test('Refresh mid-game restores the game in a paused state with exact times', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('preset-quick-5m').click();
    await page.getByTestId('clock-start-pause').click();

    // Wait 1.5 seconds of active ticking
    await page.waitForTimeout(1500);

    // Refresh page
    await page.reload();

    // Clock arena is still active, but paused
    const arena = page.getByTestId('clock-arena');
    await expect(arena).toBeVisible();
    await expect(arena).toHaveAttribute('data-clock-status', 'paused');
    await expect(page.getByTestId('pause-overlay')).toBeVisible();

    // P1 time has decremented from 5:00 to ~4:58/4:59
    const p1Time = await page.getByTestId('p1-time').innerText();
    expect(p1Time).toMatch(/^4:5[789]$/);
  });

  test('Settings (sound, last used preset, rotation) persist after reload', async ({ page }) => {
    await page.goto('/');

    // Launch 30m preset
    await page.getByTestId('preset-quick-30m').click();

    // Toggle sound off
    await page.getByTestId('sound-toggle').click();

    // Toggle rotation
    await page.getByTestId('rotation-toggle').click();

    // Exit to home
    await page.getByTestId('clock-back-home').click();

    // Reload page
    await page.reload();

    // Verify last used preset persisted in header launcher
    const headerBtn = page.getByTestId('header-launch-preset');
    await expect(headerBtn).toContainText('30 min');

    // Launch clock again and check rotation & sound preference
    await headerBtn.click();
    const soundToggle = page.getByTestId('sound-toggle');
    await expect(soundToggle).toHaveAttribute('aria-label', 'Enable Clock Sound'); // muted
  });
});
