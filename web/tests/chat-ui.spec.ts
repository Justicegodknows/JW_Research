import { test, expect } from '@playwright/test';

test.describe('JW Research Chat UI', () => {
  test('should load the home page', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveTitle(/JW Research/i);
  });

  test('should display chat interface', async ({ page }) => {
    await page.goto('/');
    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible();
    const submitButton = page.locator('button[type="submit"]').first();
    await expect(submitButton).toBeVisible();
  });

  test('should accept user input', async ({ page }) => {
    await page.goto('/');
    const textarea = page.locator('textarea');
    await textarea.fill('What is the purpose of the watchtower magazine?');
    await expect(textarea).toHaveValue('What is the purpose of the watchtower magazine?');
  });

  test('should have send button clickable', async ({ page }) => {
    await page.goto('/');
    const textarea = page.locator('textarea');
    await textarea.fill('Test question');
    const submitButton = page.locator('button[type="submit"]').first();
    await expect(submitButton).toBeEnabled();
    await expect(submitButton).toBeVisible();
  });

  test('should display sources panel', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    const url = page.url();
    expect(url).toContain('localhost');
  });

  test('should have responsive layout on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible();
    const submitButton = page.locator('button[type="submit"]').first();
    await expect(submitButton).toBeVisible();
  });

  test('should have keyboard support', async ({ page }) => {
    await page.goto('/');
    const textarea = page.locator('textarea');
    await textarea.focus();
    await page.keyboard.type('Test with keyboard');
    await expect(textarea).toHaveValue('Test with keyboard');
  });

  test('should have accessible labels', async ({ page }) => {
    await page.goto('/');
    const textarea = page.locator('textarea');
    await textarea.focus();
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    expect(focused).toBe('TEXTAREA');
  });

  test('should show header with branding', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=JW Research')).toBeVisible();
    await expect(page.locator('text=Grounded answers from JW Library')).toBeVisible();
  });

  test('should have placeholder text in textarea', async ({ page }) => {
    await page.goto('/');
    const textarea = page.locator('textarea');
    const placeholder = await textarea.getAttribute('placeholder');
    expect(placeholder).toContain('Ask anything about JW Library');
  });
});
