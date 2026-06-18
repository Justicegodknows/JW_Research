# Playwright E2E Testing Setup

This document describes the Playwright end-to-end testing setup for the JW Research chat UI.

## Installation

Playwright is already installed as a dev dependency:

```bash
cd web
npm install -D @playwright/test
npx playwright install chromium  # or firefox, webkit
```

## Test Configuration

- **Config File**: `playwright.config.ts`
- **Test Directory**: `tests/`
- **Base URL**: `http://localhost:3000` (default)
- **Browsers**: Chromium (default), Firefox, WebKit
- **Reporters**: HTML report in `playwright-report/`
- **Screenshots**: Captured on failures
- **Trace**: Recorded on first failure for debugging

## Running Tests

### Run all tests (all browsers)
```bash
npm run test:e2e
```

### Run tests in specific browser
```bash
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit
```

### Debug mode (opens inspector)
```bash
npm run test:e2e:debug
```

### Headed mode (opens browser)
```bash
npm run test:e2e:headed
```

### Single test file
```bash
npx playwright test tests/chat-ui.spec.ts
```

### Single test by name
```bash
npx playwright test -g "should load the home page"
```

### View HTML report
```bash
npx playwright show-report
```

## Test Suite: Chat UI

**Location**: `tests/chat-ui.spec.ts`  
**Tests**: 10  
**Coverage**: UI interactions, accessibility, responsive design

### Tests

1. ✅ **should load the home page**
   - Verifies page title and initial load

2. ✅ **should display chat interface**
   - Checks textarea and submit button visibility

3. ✅ **should accept user input**
   - Tests typing into textarea and value persistence

4. ✅ **should have send button clickable**
   - Verifies send button enabled when input present

5. ✅ **should display sources panel**
   - Confirms page loads without critical errors

6. ✅ **should have responsive layout on mobile**
   - Tests 375×812 viewport (iPhone 12)
   - Verifies UI elements visible on mobile

7. ✅ **should have keyboard support**
   - Tests keyboard text entry via `page.keyboard.type()`

8. ✅ **should have accessible labels**
   - Verifies textarea is focusable and accessible

9. ✅ **should show header with branding**
   - Tests "JW Research" header text visibility

10. ✅ **should have placeholder text in textarea**
    - Confirms placeholder text is set correctly

## Quick Start

### Setup (one time)
```bash
cd web
npx playwright install
npx playwright install-deps  # install system dependencies
```

### Run tests
```bash
# Terminal 1: Start dev server
npm run dev

# Terminal 2: Run tests
npm run test:e2e -- --project=chromium
```

### View results
```bash
# After tests finish
npx playwright show-report
```

## Selectors Used

- `textarea` — Main chat input
- `button[type="submit"]` — Send button
- `text=JW Research` — Header text (text selector)
- `page.locator('...')` — Flexible element selection
- `page.evaluate()` — JavaScript execution in page context

## Configuration Files

- **playwright.config.ts** — Main config with browser settings, timeout, reporters
- **package.json** — Scripts for `test:e2e`, `test:e2e:debug`, `test:e2e:headed`
- **tests/** — Test files (`.spec.ts` extension)

## Artifacts

On test failure:

- **Screenshots**: `test-results/**/test-failed-*.png`
- **Traces**: `test-results/**/trace.zip` (use `npx playwright show-trace` to view)
- **HTML Report**: `playwright-report/index.html`
- **Error Context**: `test-results/**/error-context.md`

## Best Practices

1. **Use `waitForLoadState()`** for page readiness
   ```typescript
   await page.waitForLoadState('networkidle');
   await page.waitForLoadState('domcontentloaded');
   ```

2. **Clear input before typing** in forms
   ```typescript
   await textarea.fill('');  // or .clear()
   await textarea.fill('new text');
   ```

3. **Use specific selectors**
   ```typescript
   // Good
   page.locator('button[type="submit"]').first()
   
   // Avoid
   page.locator('button')  // matches all buttons
   ```

4. **Test accessibility**
   ```typescript
   await element.focus();
   await page.keyboard.press('Tab');
   ```

5. **Add `await` for async operations**
   ```typescript
   await expect(element).toBeVisible();
   await element.click();
   ```

## Troubleshooting

### Tests timeout
- Increase `timeout` in `playwright.config.ts`
- Ensure dev server is running on port 3000
- Check GPU/CPU usage if slow

### Browser not found
```bash
npx playwright install chromium
sudo npx playwright install-deps
```

### Page not loading
- Verify dev server: `npm run dev`
- Check baseURL in config: `http://localhost:3000`
- Look at network logs: `npx playwright test --debug`

### Flaky tests
- Add explicit waits: `await page.waitForLoadState()`
- Increase timeout for specific tests
- Use `page.isVisible()` checks before interactions

## CI/CD Integration

For GitHub Actions, add to `.github/workflows/test.yml`:

```yaml
- name: Install dependencies
  run: cd web && npm install

- name: Install Playwright browsers
  run: cd web && npx playwright install --with-deps

- name: Run E2E tests
  run: cd web && npm run test:e2e

- name: Upload test results
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
    path: web/playwright-report/
```

## Resources

- **Playwright Docs**: https://playwright.dev
- **Selectors Guide**: https://playwright.dev/docs/locators
- **API Reference**: https://playwright.dev/docs/api/class-page
- **Best Practices**: https://playwright.dev/docs/best-practices

## Test Coverage Goals

Current coverage:
- ✅ UI rendering (headers, buttons, inputs)
- ✅ User interactions (typing, clicking)
- ✅ Responsive design (mobile viewports)
- ✅ Accessibility (keyboard, focus)
- ✅ Placeholder/label text

Future improvements:
- [ ] Chat API interaction (mock responses)
- [ ] Error state testing
- [ ] Loading state animation
- [ ] Sources panel rendering
- [ ] Cross-browser testing (Firefox, WebKit)
- [ ] Performance testing (Lighthouse)
- [ ] Visual regression testing

## Development Workflow

1. Write/update test in `tests/chat-ui.spec.ts`
2. Run `npm run test:e2e:headed` to see browser
3. Use inspector: `npm run test:e2e:debug`
4. Fix UI or test selectors as needed
5. Run `npm run test:e2e` to verify all pass
6. View report: `npx playwright show-report`

## Notes

- Tests run in parallel (10 workers by default) for speed
- Each test starts fresh (new page context)
- Screenshots/traces captured on failure for debugging
- Tests are deterministic and should always pass if UI unchanged
- No real API calls (future: mock `/api/chat` endpoint)
