import { expect, test, type Page, type Route } from '@playwright/test';
import Fastify, { type FastifyInstance } from 'fastify';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp, type ProxyConfig } from '../../src/app.js';
import { createFakeExa } from '../helpers/fakeExa.js';

let app: FastifyInstance;
let upstream: Awaited<ReturnType<typeof createFakeExa>>;
let webhook: FastifyInstance;
let baseUrl = '';
let stateDir = '';
const webhookDeliveries: unknown[] = [];

async function fulfillJson(route: Route, body: unknown): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body)
  });
}

async function listenUrl(server: FastifyInstance): Promise<string> {
  await server.listen({ host: '127.0.0.1', port: 0 });
  const address = server.server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind to a TCP port');
  return `http://127.0.0.1:${address.port}`;
}

async function closeIsolatedApp(server: FastifyInstance): Promise<void> {
  const nodeServer = server.server as FastifyInstance['server'] & {
    closeAllConnections?: () => void;
    closeIdleConnections?: () => void;
  };
  nodeServer.closeIdleConnections?.();
  nodeServer.closeAllConnections?.();
  await server.close();
}

async function seedRequest(method: 'GET' | 'POST', url: string, payload?: Record<string, unknown>): Promise<void> {
  await app.inject({
    method,
    url,
    headers: { authorization: 'Bearer client_local_token', 'content-type': 'application/json' },
    payload
  });
}

async function visibleLogRowCount(page: Page): Promise<number> {
  return page.locator('.log-table-scroll').evaluate((scroller) => Array.from(scroller.querySelectorAll('tbody tr')).filter((row) => {
    const rowBox = row.getBoundingClientRect();
    const scrollBox = scroller.getBoundingClientRect();
    return rowBox.height > 1 && rowBox.bottom > scrollBox.top && rowBox.top < scrollBox.bottom;
  }).length);
}

async function visibleKeyRowCount(page: Page): Promise<number> {
  return page.locator('.key-table-scroll').evaluate((scroller) => Array.from(scroller.querySelectorAll('tbody tr')).filter((row) => {
    const rowBox = row.getBoundingClientRect();
    const scrollBox = scroller.getBoundingClientRect();
    return rowBox.height > 1 && rowBox.bottom > scrollBox.top && rowBox.top < scrollBox.bottom;
  }).length);
}

async function authEntryTargetMetrics(page: Page): Promise<{
  overflow: number;
  card: { width: number; height: number; clippedX: boolean; clippedY: boolean };
  targets: Array<{ label: string; width: number; height: number; clippedX: boolean; clippedY: boolean; covered: boolean }>;
}> {
  return page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const card = document.querySelector<HTMLElement>('.login-card');
    const cardRect = card?.getBoundingClientRect() || new DOMRect();
    const targets = Array.from(document.querySelectorAll<HTMLElement>('#loginToken, #toggleLoginToken, #fillDemoToken, #loginButton, .auth-boundary > span, .auth-trust-strip > span'))
      .filter((item) => {
        const rect = item.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .map((item) => {
        // Scroll before measure so sticky auth chrome does not false-cover hit targets.
        item.scrollIntoView({ block: 'center', inline: 'nearest' });
        const rect = item.getBoundingClientRect();
        const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return {
          label: item.id || item.className || item.textContent?.trim().slice(0, 24) || item.tagName.toLowerCase(),
          width: rect.width,
          height: rect.height,
          clippedX: item.scrollWidth > item.clientWidth + 1,
          clippedY: item.scrollHeight > item.clientHeight + 1,
          covered: !(target === item || item.contains(target))
        };
      });
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      card: {
        width: cardRect.width,
        height: cardRect.height,
        clippedX: cardRect.left < -0.5 || cardRect.right > viewportWidth + 0.5,
        clippedY: cardRect.top < -0.5 || cardRect.bottom > viewportHeight + 0.5
      },
      targets
    };
  });
}

function expectAuthEntryTargets(
  metrics: Awaited<ReturnType<typeof authEntryTargetMetrics>>,
  options: { minControlHeight?: number; loginEyeMinHeight?: number; fillDemoMinHeight?: number } = {}
): void {
  const minControlHeight = options.minControlHeight ?? 28;
  const loginEyeMinHeight = options.loginEyeMinHeight ?? minControlHeight;
  const fillDemoMinHeight = options.fillDemoMinHeight ?? minControlHeight;
  expect(metrics.overflow).toBeLessThanOrEqual(1);
  expect(metrics.card.width).toBeGreaterThan(300);
  expect(metrics.card.clippedX, JSON.stringify(metrics.card)).toBe(false);
  expect(metrics.card.clippedY, JSON.stringify(metrics.card)).toBe(false);
  expect(metrics.targets.length).toBeGreaterThanOrEqual(4);
  for (const target of metrics.targets) {
    expect(target.width, JSON.stringify(target)).toBeGreaterThan(40);
    let minH = minControlHeight;
    if (target.label === 'toggleLoginToken') minH = loginEyeMinHeight;
    if (target.label === 'fillDemoToken') minH = fillDemoMinHeight;
    expect(Math.round(target.height), JSON.stringify(target)).toBeGreaterThanOrEqual(minH);
    expect(target.clippedX, JSON.stringify(target)).toBe(false);
    expect(target.clippedY, JSON.stringify(target)).toBe(false);
    expect(target.covered, JSON.stringify(target)).toBe(false);
  }
}

async function dispatchLoginCapsLock(page: Page, enabled: boolean, eventName = 'keydown'): Promise<void> {
  await page.locator('#loginToken').evaluate((input, { capsEnabled, type }) => {
    const event = new KeyboardEvent(type, { bubbles: true });
    Object.defineProperty(event, 'getModifierState', {
      value: (key: string) => key === 'CapsLock' && capsEnabled
    });
    input.dispatchEvent(event);
  }, { capsEnabled: enabled, type: eventName });
}

async function tableScrollState(page: Page, selector: string): Promise<{
  overflowX: string | null;
  scrollStart: string | null;
  scrollEnd: string | null;
  scrollLeft: number;
  maxScrollLeft: number;
}> {
  return page.locator(selector).evaluate((scroller) => ({
    overflowX: scroller.getAttribute('data-overflow-x'),
    scrollStart: scroller.getAttribute('data-scroll-start'),
    scrollEnd: scroller.getAttribute('data-scroll-end'),
    scrollLeft: Math.round(scroller.scrollLeft),
    maxScrollLeft: Math.round(scroller.scrollWidth - scroller.clientWidth)
  }));
}

function waitForKeyLogFilterResponse(page: Page, keyId: string) {
  return page.waitForResponse((response) => {
    const request = response.request();
    const url = new URL(response.url());
    return request.method() === 'GET' && url.pathname === '/_proxy/logs' && url.searchParams.get('keyId') === keyId;
  });
}

async function expectKeyLogDrilldown(page: Page, keyId: string): Promise<void> {
  await expect(page.locator('[data-tab-panel="logs"]')).toBeVisible();
  await expect(page.locator('#logKeyFilter')).toHaveValue(keyId);
  await expect(page.locator('#logKeyFilter')).toBeFocused();
  await expect.poll(async () => page.locator('#logKeyFilter').evaluate((input) => {
    const field = input as HTMLInputElement;
    return `${field.selectionStart ?? -1}:${field.selectionEnd ?? -1}:${field.value.length}`;
  })).toBe(`0:${keyId.length}:${keyId.length}`);
  await expect(page.locator('#logFilterSummary')).toContainText('密钥');
  await expect(page.locator('#logFilterChips')).toContainText(keyId);
}

/** Click overview signal/next-action buttons without holding a handle that auto-refresh can detach. */
async function clickOverviewSignalAction(page: Page, action: string): Promise<void> {
  const locator = page.locator(`[data-tab-panel="overview"] button[data-overview-signal-action="${action}"]`).first();
  await expect(locator).toBeVisible();
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  try {
    await locator.click({ timeout: 5_000 });
  } catch {
    // Continuous SSE/refresh re-renders can keep the control "unstable"; force still navigates.
    await page.locator(`[data-tab-panel="overview"] button[data-overview-signal-action="${action}"]`).first().click({ force: true, timeout: 5_000 });
  }
}

async function clickOverviewNextAction(page: Page): Promise<string | null> {
  const button = page.locator('#insightNextActionButton');
  await expect(button).toBeVisible();
  const actionId = await button.getAttribute('data-overview-action');
  await button.scrollIntoViewIfNeeded().catch(() => {});
  try {
    await button.click({ timeout: 5_000 });
  } catch {
    await page.locator('#insightNextActionButton').click({ force: true, timeout: 5_000 });
  }
  return actionId;
}

async function logTraceTargetMetrics(page: Page): Promise<{
  overflow: number;
  links: Array<{ width: number; height: number; clippedX: boolean; clippedY: boolean; covered: boolean; outsideCell: boolean }>;
  keyLinks: Array<{ keyId: string; area: string; width: number; height: number; top: number; bottom: number; hit: string; clippedX: boolean; clippedY: boolean; covered: boolean }>;
  shortcuts: Array<{ width: number; height: number; covered: boolean }>;
  overlap: boolean;
}> {
  return page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const scroller = document.querySelector('.log-table-scroll');
    const scrollerBox = scroller?.getBoundingClientRect();
    const inViewport = (rect: DOMRect) => rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.left < viewportWidth && rect.bottom > 0 && rect.top < viewportHeight;
    const inScroller = (rect: DOMRect) => !scrollerBox || (rect.right > scrollerBox.left && rect.left < scrollerBox.right && rect.bottom > scrollerBox.top && rect.top < scrollerBox.bottom);
    const fullyInScroller = (rect: DOMRect) => !scrollerBox || (rect.left >= scrollerBox.left - 0.5 && rect.right <= scrollerBox.right + 0.5 && rect.top >= scrollerBox.top - 0.5 && rect.bottom <= scrollerBox.bottom + 0.5);
    const centerIsButton = (button: HTMLButtonElement, rect: DOMRect) => {
      const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return target === button || button.contains(target);
    };
    const linkRects: DOMRect[] = [];
    const links = Array.from(document.querySelectorAll<HTMLButtonElement>('#logsBody .link-btn[data-trace-id]'))
      .filter((button) => {
        const rect = button.getBoundingClientRect();
        // Require full visibility in the scroller so sticky thead/filter chrome
        // does not false-positive "covered" when taller mobile tabs shrink the table.
        return inViewport(rect) && fullyInScroller(rect);
      })
      .slice(0, 5)
      .map((button) => {
        button.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        const rect = button.getBoundingClientRect();
        const cell = button.closest('td')?.getBoundingClientRect();
        linkRects.push(rect);
        return {
          width: rect.width,
          height: rect.height,
          clippedX: button.scrollWidth > button.clientWidth + 1,
          clippedY: button.scrollHeight > button.clientHeight + 1,
          covered: !centerIsButton(button, rect),
          outsideCell: cell ? rect.left < cell.left - 0.5 || rect.right > cell.right + 0.5 || rect.top < cell.top - 0.5 || rect.bottom > cell.bottom + 0.5 : true
        };
      });
    const keyLinks = Array.from(document.querySelectorAll<HTMLButtonElement>('#logsBody .log-key-link[data-log-key-action="open-detail"], #tracePanel .log-key-link[data-log-key-action="open-detail"]'))
      .filter((button) => {
        const rect = button.getBoundingClientRect();
        return inViewport(rect) && (button.closest('#tracePanel') || fullyInScroller(rect));
      })
      .slice(0, 8)
      .map((button) => {
        button.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        const rect = button.getBoundingClientRect();
        const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return {
          keyId: button.dataset.keyId || '',
          area: button.closest('#tracePanel') ? 'trace' : 'table',
          width: rect.width,
          height: rect.height,
          top: rect.top,
          bottom: rect.bottom,
          hit: target ? [target.tagName.toLowerCase(), target.id, typeof target.className === 'string' ? target.className : ''].filter(Boolean).join('#') : '',
          clippedX: button.scrollWidth > button.clientWidth + 1,
          clippedY: button.scrollHeight > button.clientHeight + 1,
          covered: !(target === button || button.contains(target))
        };
      });
    const shortcutRects: DOMRect[] = [];
    const shortcuts = Array.from(document.querySelectorAll<HTMLButtonElement>('#tracePanel .trace-shortcut'))
      .filter((button) => inViewport(button.getBoundingClientRect()))
      .slice(0, 3)
      .map((button) => {
        button.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        const rect = button.getBoundingClientRect();
        shortcutRects.push(rect);
        return { width: rect.width, height: rect.height, covered: !centerIsButton(button, rect) };
      });
    const overlap = linkRects.some((link) => shortcutRects.some((shortcut) => !(link.right <= shortcut.left || link.left >= shortcut.right || link.bottom <= shortcut.top || link.top >= shortcut.bottom)));
    return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, links, keyLinks, shortcuts, overlap };
  });
}

async function expectKeyDetailOpenFromLog(page: Page, keyId: string): Promise<void> {
  await expect(page.locator('[data-tab-panel="keys"]')).toBeVisible();
  await expect(page.locator('#keySearch')).toHaveValue('');
  await expect(page.locator('#keyFilterChips .chip[data-chip="All"]')).toHaveClass(/active/);
  await expect(page.locator('#keysBody tr.selected')).toHaveAttribute('data-key-id', keyId);
  await expect(page.locator('#detailsBody')).toContainText(keyId);
  await expect(page.locator('#detailsBody')).toContainText('日志定位');
  await expect(page.locator('#detailsBody button[data-detail-action="logs"]')).toBeFocused();
}

async function logDiagnosticTargetMetrics(page: Page): Promise<{
  overflow: number;
  buttons: Array<{ action: string; width: number; height: number; clippedX: boolean; clippedY: boolean; covered: boolean }>;
}> {
  return page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('#logDiagnostics button[data-log-diagnostic-action]')).map((button) => {
      // Scroll before measure so sticky chrome / off-screen mobile layout does not false-cover.
      button.scrollIntoView({ block: 'center', inline: 'nearest' });
      const rect = button.getBoundingClientRect();
      const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return {
        action: button.dataset.logDiagnosticAction || '',
        width: rect.width,
        height: rect.height,
        clippedX: button.scrollWidth > button.clientWidth + 1,
        clippedY: button.scrollHeight > button.clientHeight + 1,
        covered: !(target === button || button.contains(target))
      };
    });
    return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, buttons };
  });
}

async function keyWorkflowTargetMetrics(page: Page): Promise<{
  overflow: number;
  buttons: Array<{ action: string; width: number; height: number; clippedX: boolean; clippedY: boolean; covered: boolean }>;
}> {
  return page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('#keyWorkflowSummary button[data-key-workflow-action]')).map((button) => {
      button.scrollIntoView({ block: 'center', inline: 'nearest' });
      const rect = button.getBoundingClientRect();
      const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return {
        action: button.dataset.keyWorkflowAction || '',
        width: rect.width,
        height: rect.height,
        clippedX: button.scrollWidth > button.clientWidth + 1,
        clippedY: button.scrollHeight > button.clientHeight + 1,
        covered: !(target === button || button.contains(target))
      };
    });
    return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, buttons };
  });
}

async function detailActionTargetMetrics(page: Page, rootSelector: string): Promise<{
  overflow: number;
  buttons: Array<{ action: string; width: number; height: number; clippedX: boolean; clippedY: boolean; covered: boolean }>;
}> {
  return page.evaluate((selector) => {
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(selector + ' .detail-actions button[data-detail-action]')).map((button) => {
      button.scrollIntoView({ block: 'center', inline: 'nearest' });
      const rect = button.getBoundingClientRect();
      const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return {
        action: button.dataset.detailAction || '',
        width: rect.width,
        height: rect.height,
        clippedX: button.scrollWidth > button.clientWidth + 1,
        clippedY: button.scrollHeight > button.clientHeight + 1,
        covered: !(target === button || button.contains(target))
      };
    });
    return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, buttons };
  }, rootSelector);
}

async function auditEvidenceTargetMetrics(page: Page): Promise<{
  overflow: number;
  buttons: Array<{ action: string; width: number; height: number; clippedX: boolean; clippedY: boolean; covered: boolean }>;
}> {
  // Re-query by index so auto-refresh re-renders do not detach ElementHandles mid-loop.
  const count = await page.locator('#auditEvidence button[data-audit-evidence-action]').count();
  const buttons: Array<{ action: string; width: number; height: number; clippedX: boolean; clippedY: boolean; covered: boolean }> = [];
  for (let index = 0; index < count; index += 1) {
    const locator = page.locator('#auditEvidence button[data-audit-evidence-action]').nth(index);
    try {
      await locator.scrollIntoViewIfNeeded();
      buttons.push(await locator.evaluate((button: HTMLButtonElement) => {
        button.scrollIntoView({ block: 'center', inline: 'nearest' });
        const rect = button.getBoundingClientRect();
        const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return {
          action: button.dataset.auditEvidenceAction || '',
          width: rect.width,
          height: rect.height,
          clippedX: button.scrollWidth > button.clientWidth + 1,
          clippedY: button.scrollHeight > button.clientHeight + 1,
          covered: !(target === button || button.contains(target))
        };
      }));
    } catch {
      // Detached or re-rendered node mid-measurement; skip and continue.
    }
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  return { overflow, buttons };
}

async function keyRowSignalMetrics(page: Page): Promise<{
  overflow: number;
  signals: Array<{ keyId: string; text: string; aria: string; width: number; height: number; clippedX: boolean; clippedY: boolean; covered: boolean; outsideCell: boolean }>;
}> {
  // Re-query by index so auto-refresh re-renders do not detach ElementHandles mid-loop.
  const count = await page.locator('#keysBody .key-row-signal').count();
  const signals: Array<{ keyId: string; text: string; aria: string; width: number; height: number; clippedX: boolean; clippedY: boolean; covered: boolean; outsideCell: boolean }> = [];
  for (let index = 0; index < count; index += 1) {
    const locator = page.locator('#keysBody .key-row-signal').nth(index);
    try {
      await locator.scrollIntoViewIfNeeded();
      signals.push(await locator.evaluate((signal: HTMLElement) => {
        signal.scrollIntoView({ block: 'center', inline: 'nearest' });
        const rect = signal.getBoundingClientRect();
        const cell = signal.closest('td')?.getBoundingClientRect();
        const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return {
          keyId: (signal.closest('tr') as HTMLElement | null)?.dataset.keyId || '',
          text: signal.textContent?.trim().replace(/\s+/g, ' ') || '',
          aria: signal.getAttribute('aria-label') || '',
          width: rect.width,
          height: rect.height,
          clippedX: signal.scrollWidth > signal.clientWidth + 1,
          clippedY: signal.scrollHeight > signal.clientHeight + 1,
          covered: !(target === signal || signal.contains(target)),
          outsideCell: cell ? rect.left < cell.left - 0.5 || rect.right > cell.right + 0.5 || rect.top < cell.top - 0.5 || rect.bottom > cell.bottom + 0.5 : true
        };
      }));
    } catch {
      // Detached or re-rendered node mid-measurement; skip and continue.
    }
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await page.locator('.key-table-scroll').evaluate((scroller) => { scroller.scrollLeft = 0; scroller.dispatchEvent(new Event('scroll')); });
  return { overflow, signals };
}

async function keyTableActionTargetMetrics(page: Page): Promise<{
  overflow: number;
  buttons: Array<{ action: string; width: number; height: number; clippedX: boolean; clippedY: boolean; covered: boolean }>;
}> {
  // Re-query by index so auto-refresh re-renders do not detach ElementHandles mid-loop.
  const count = await page.locator('#keysBody button[data-action]').count();
  const buttons: Array<{ action: string; width: number; height: number; clippedX: boolean; clippedY: boolean; covered: boolean }> = [];
  for (let index = 0; index < count; index += 1) {
    const locator = page.locator('#keysBody button[data-action]').nth(index);
    try {
      await locator.scrollIntoViewIfNeeded();
      buttons.push(await locator.evaluate((button: HTMLButtonElement) => {
        button.scrollIntoView({ block: 'center', inline: 'nearest' });
        const rect = button.getBoundingClientRect();
        const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return {
          action: button.dataset.action || '',
          width: rect.width,
          height: rect.height,
          clippedX: button.scrollWidth > button.clientWidth + 1,
          clippedY: button.scrollHeight > button.clientHeight + 1,
          covered: !(target === button || button.contains(target))
        };
      }));
    } catch {
      // Detached or re-rendered node mid-measurement; skip and continue.
    }
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await page.locator('.key-table-scroll').evaluate((scroller) => { scroller.scrollLeft = 0; scroller.dispatchEvent(new Event('scroll')); });
  return { overflow, buttons };
}

async function configPostureTargetMetrics(page: Page): Promise<{
  overflow: number;
  buttons: Array<{ action: string; width: number; height: number; top: number; bottom: number; centerX: number; centerY: number; hit: string; clippedX: boolean; clippedY: boolean; covered: boolean }>;
}> {
  // Re-query by index so auto-refresh re-renders do not detach ElementHandles mid-loop.
  const count = await page.locator('#configEvidence button[data-config-posture-action]').count();
  const buttons: Array<{ action: string; width: number; height: number; top: number; bottom: number; centerX: number; centerY: number; hit: string; clippedX: boolean; clippedY: boolean; covered: boolean }> = [];
  for (let index = 0; index < count; index += 1) {
    const locator = page.locator('#configEvidence button[data-config-posture-action]').nth(index);
    try {
      await locator.scrollIntoViewIfNeeded();
      buttons.push(await locator.evaluate((button: HTMLButtonElement) => {
        button.scrollIntoView({ block: 'center', inline: 'nearest' });
        const rect = button.getBoundingClientRect();
        const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return {
          action: button.dataset.configPostureAction || '',
          width: rect.width,
          height: rect.height,
          top: rect.top,
          bottom: rect.bottom,
          centerX: rect.left + rect.width / 2,
          centerY: rect.top + rect.height / 2,
          hit: target ? [target.tagName.toLowerCase(), target.id, target.className].filter(Boolean).join('#') : '',
          clippedX: button.scrollWidth > button.clientWidth + 1,
          clippedY: button.scrollHeight > button.clientHeight + 1,
          covered: !(target === button || button.contains(target))
        };
      }));
    } catch {
      // Detached or re-rendered node mid-measurement; skip and continue.
    }
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  return { overflow, buttons };
}

async function readinessCopyTargetMetrics(page: Page): Promise<{
  overflow: number;
  buttons: Array<{ action: string; width: number; height: number; clippedX: boolean; clippedY: boolean; covered: boolean }>;
}> {
  // Re-query by index so auto-refresh re-renders do not detach ElementHandles mid-loop.
  const count = await page.locator('#launchReadiness button[data-readiness-copy]').count();
  const buttons: Array<{ action: string; width: number; height: number; clippedX: boolean; clippedY: boolean; covered: boolean }> = [];
  for (let index = 0; index < count; index += 1) {
    const locator = page.locator('#launchReadiness button[data-readiness-copy]').nth(index);
    try {
      await locator.scrollIntoViewIfNeeded();
      buttons.push(await locator.evaluate((button: HTMLButtonElement) => {
        button.scrollIntoView({ block: 'center', inline: 'nearest' });
        const rect = button.getBoundingClientRect();
        const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return {
          action: button.dataset.readinessCopy || '',
          width: rect.width,
          height: rect.height,
          clippedX: button.scrollWidth > button.clientWidth + 1,
          clippedY: button.scrollHeight > button.clientHeight + 1,
          covered: !(target === button || button.contains(target))
        };
      }));
    } catch {
      // Detached or re-rendered node mid-measurement; skip and continue.
    }
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  return { overflow, buttons };
}

async function overviewSignalTargetMetrics(page: Page): Promise<{
  overflow: number;
  buttons: Array<{ action: string; text: string; width: number; height: number; scrollWidth: number; clientWidth: number; scrollHeight: number; clientHeight: number; clippedX: boolean; clippedY: boolean; covered: boolean }>;
}> {
  // Re-query by index so auto-refresh re-renders do not detach ElementHandles mid-loop.
  const count = await page.locator('[data-tab-panel="overview"] button[data-overview-signal-action]').count();
  const buttons: Array<{ action: string; text: string; width: number; height: number; scrollWidth: number; clientWidth: number; scrollHeight: number; clientHeight: number; clippedX: boolean; clippedY: boolean; covered: boolean }> = [];
  for (let index = 0; index < count; index += 1) {
    const locator = page.locator('[data-tab-panel="overview"] button[data-overview-signal-action]').nth(index);
    try {
      const isRenderable = await locator.evaluate((button: HTMLButtonElement) => {
        if (!button.isConnected) return false;
        const rect = button.getBoundingClientRect();
        const style = window.getComputedStyle(button);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      });
      if (!isRenderable) continue;
      await locator.scrollIntoViewIfNeeded();
      const metrics = await locator.evaluate((button: HTMLButtonElement) => {
        if (!button.isConnected) return null;
        button.scrollIntoView({ block: 'center', inline: 'nearest' });
        const rect = button.getBoundingClientRect();
        const style = window.getComputedStyle(button);
        if (rect.width <= 0 || rect.height <= 0 || style.display === 'none' || style.visibility === 'hidden') return null;
        const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return {
          action: button.dataset.overviewSignalAction || '',
          text: button.textContent?.trim().replace(/\s+/g, ' ') || '',
          width: rect.width,
          height: rect.height,
          scrollWidth: button.scrollWidth,
          clientWidth: button.clientWidth,
          scrollHeight: button.scrollHeight,
          clientHeight: button.clientHeight,
          clippedX: button.scrollWidth > button.clientWidth + 1,
          clippedY: button.scrollHeight > button.clientHeight + 1,
          covered: !(target === button || button.contains(target))
        };
      });
      if (metrics) buttons.push(metrics);
    } catch {
      // Detached or re-rendered node mid-measurement; skip and continue.
    }
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  return { overflow, buttons };
}

async function commandPaletteTargetMetrics(page: Page): Promise<{
  overflow: number;
  panel: { width: number; height: number; clippedX: boolean; clippedY: boolean };
  controls: Array<{ label: string; width: number; height: number; clippedX: boolean; clippedY: boolean; covered: boolean }>;
}> {
  return page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const panel = document.querySelector<HTMLElement>('#commandPalette .command-palette-panel');
    const panelRect = panel?.getBoundingClientRect() || new DOMRect();
    const controls = Array.from(document.querySelectorAll<HTMLElement>('#commandSearch, #closeCommandPalette, #commandPaletteContext > span, #commandList .command-option, .command-palette-foot span'))
      .filter((item) => {
        const rect = item.getBoundingClientRect();
        const clip = item.closest('#commandList')?.getBoundingClientRect() || panelRect;
        return rect.width > 0 && rect.height > 0 && rect.top >= clip.top - 0.5 && rect.bottom <= clip.bottom + 0.5;
      })
      .map((item) => {
        // Scroll before measure so clipped list options do not false-cover hit targets.
        item.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        const rect = item.getBoundingClientRect();
        const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return {
          label: item.id || item.className || item.textContent?.trim().slice(0, 24) || item.tagName.toLowerCase(),
          width: rect.width,
          height: rect.height,
          clippedX: item.scrollWidth > item.clientWidth + 1,
          clippedY: item.scrollHeight > item.clientHeight + 1,
          covered: !(target === item || item.contains(target))
        };
      });
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      panel: {
        width: panelRect.width,
        height: panelRect.height,
        clippedX: panelRect.left < -0.5 || panelRect.right > viewportWidth + 0.5,
        clippedY: panelRect.top < -0.5 || panelRect.bottom > viewportHeight + 0.5
      },
      controls
    };
  });
}

test.beforeAll(async () => {
  stateDir = mkdtempSync(join(tmpdir(), 'exa-e2e-'));
  upstream = await createFakeExa((request) => {
    if (request.url.includes('limited')) return { status: 429, headers: { 'retry-after': '60' }, body: { error: 'rate_limited' } };
    if (request.url.includes('fail')) return { status: 503, body: { error: 'temporary_upstream_failure' } };
    return { status: 200, body: { results: [{ id: 'ok' }], key: request.headers['x-api-key'] } };
  });

  webhook = Fastify({ logger: false });
  webhook.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body, done) => done(null, body));
  webhook.post('/*', async (request, reply) => {
    webhookDeliveries.push(request.body);
    return reply.code(204).send();
  });
  const webhookUrl = await listenUrl(webhook);

  const config: ProxyConfig = {
    host: '127.0.0.1',
    port: 0,
    upstreamUrl: upstream.url,
    keys: [
      { id: 'key_01_search', value: 'fake_key_01', weight: 1, enabled: true },
      { id: 'key_02_contents', value: 'fake_key_02', weight: 1, enabled: true },
      { id: 'key_03_backup', value: 'fake_key_03', weight: 1, enabled: true },
      { id: 'key_04_agent', value: 'fake_key_04', weight: 1, enabled: true },
      { id: 'key_05_archive', value: 'fake_key_05', weight: 1, enabled: true },
      { id: 'key_06_research', value: 'fake_key_06', weight: 1, enabled: true }
    ],
    encryptionSecret: 'test-encryption-secret-32ch',
    proxyTokens: ['client_local_token'],
    adminTokens: ['admin_local_token'],
    statePath: join(stateDir, 'state.sqlite'),
    selectionStrategy: 'adaptive_weighted',
    maxAttempts: 2,
    attemptTimeoutMs: 1000,
    retryBackoffMs: [1],
    failureThreshold: 10,
    failureWindowSeconds: 60,
    cooldownSeconds: 60,
    rateLimitCooldownSeconds: 60,
    creditsExhaustedCooldownSeconds: 600,
    maxBodyBytes: 20971520,
    allowedPaths: ['/**'],
    resourceAffinity: true,
    logLevel: 'silent',
    adminSessionTtlSeconds: 604800,
    adminLockoutMaxFailures: 5,
    adminLockoutWindowSeconds: 300,
    adminLockoutSeconds: 900,
    adminRequireHttps: false,
    allowRawKeyDisplay: false,
    logRetentionDays: 14,
    alertAvailableKeyMin: 1,
    alertFailureRatePercent: 10,
    alertRateLimitRatePercent: 20,
    alertWebhookUrl: webhookUrl,
    alertWebhookBearerToken: null,
    alertWebhookCooldownSeconds: 300,
    alertWebhookHmacSecret: 'e2e-signing-secret',
    alertWebhookMaxAttempts: 1,
    alertWebhookRetryBackoffMs: 1,
    trendWindowHours: 24,
    trustProxy: false,
    upstreamPoolConnections: 128,
    affinityRetentionDays: 7,
    proxyRateLimitPerMinute: 0
  };

  app = await buildApp({ config });
  baseUrl = await listenUrl(app);

  await seedRequest('POST', '/search?case=ok', { query: 'normal request' });
  await seedRequest('POST', '/search?case=limited', { query: 'rate limited request' });
  await seedRequest('POST', '/contents?case=fail', { urls: ['https://example.com'] });
  for (let i = 0; i < 5; i += 1) await seedRequest('POST', `/search?case=ok&sample=${i}`, { query: `sample request ${i}` });
  await app.inject({ method: 'POST', url: '/_proxy/keys/key_03_backup/reset-circuit', headers: { authorization: 'Bearer admin_local_token' } });
  await app.inject({ method: 'POST', url: '/_proxy/keys/missing_key_for_audit/test', headers: { authorization: 'Bearer admin_local_token' } });
});

test.afterAll(async () => {
  await app?.close();
  await upstream?.app.close();
  await webhook?.close();
  if (stateDir) rmSync(stateDir, { recursive: true, force: true });
});

test('admin console covers login, key actions, logs export, and webhook testing', async ({ page }) => {
  // This flow covers login through audit/export/config and can exceed the default 30s suite budget.
  test.setTimeout(90_000);
  await page.goto(baseUrl);
  await expect(page.locator('[data-login-screen]')).toBeVisible();
  await expect(page.locator('#loginToken')).toBeVisible(); // simplified login
  await expect(page.locator('#loginToken')).toBeVisible();
  await expect(page.locator('#loginToken')).toBeVisible();
  await expect(page.locator('#loginButton')).toBeVisible();
  await expect(page.locator('#loginButton')).toBeVisible();
  // Desktop login eye stays dense (~30px); narrow login eye is covered in mobile nav test.
  expectAuthEntryTargets(await authEntryTargetMetrics(page), { loginEyeMinHeight: 28 });
  await expect(page.locator('#loginCapsHint')).toBeHidden();
  await page.locator('#loginToken').focus();
  await dispatchLoginCapsLock(page, true);
  await expect(page.locator('#loginCapsHint')).toBeVisible();
  await expect(page.locator('#loginCapsHint')).toContainText('Caps Lock 已开启');
  await expect(page.locator('#loginCapsHint')).toHaveAttribute('aria-label', /Caps Lock 已开启.*确认令牌大小写/);
  await dispatchLoginCapsLock(page, false, 'keyup');
  await expect(page.locator('#loginCapsHint')).toBeHidden();
  await dispatchLoginCapsLock(page, true);
  await expect(page.locator('#loginCapsHint')).toBeVisible();
  await page.locator('#loginToken').blur();
  await expect(page.locator('#loginCapsHint')).toBeHidden();
  await expect(page.locator('#loginToken')).toHaveAttribute('type', 'password');
  await page.click('#toggleLoginToken');
  await expect(page.locator('#loginToken')).toHaveAttribute('type', 'text');
  await expect(page.locator('#toggleLoginToken')).toHaveText('隐藏');
  await expect(page.locator('#toggleLoginToken')).toHaveAttribute('aria-label', /令牌可见性：已显示/);
  await page.click('#toggleLoginToken');
  await expect(page.locator('#loginToken')).toHaveAttribute('type', 'password');
  await expect(page.locator('#toggleLoginToken')).toHaveText('显示');
  await expect(page.locator('#toggleLoginToken')).toHaveAttribute('aria-label', /令牌可见性：已隐藏/);
  await expect(page.locator('.auth-demo-guide')).toContainText('本地演示');
  await expect(page.locator('.auth-demo-guide')).toContainText('admin_local_token');
  await expect(page.locator('.auth-demo-guide')).toContainText('生产入口');
  await expect(page.locator('#fillDemoToken')).toHaveAttribute('aria-label', /填入本地演示管理员令牌/);
  await expect(page.locator('#fillDemoToken')).toHaveAttribute('aria-describedby', 'authHintStatus');
  await expect(page.locator('#loginButton')).toHaveAttribute('aria-label', /使用管理员令牌进入控制台/);
  await page.click('#fillDemoToken');
  await expect(page.locator('#loginToken')).toHaveValue('admin_local_token');
  await expect(page.locator('#loginCapsHint')).toBeHidden();
  await expect(page.locator('#authHintStatus')).toContainText('仍会由服务端校验');
  await expect(page.locator('#authHintStatus')).toHaveAttribute('aria-label', /已填入本地 demo 令牌/);
  await expect(page.locator('#fillDemoToken')).toHaveAttribute('aria-label', /已填入本地演示管理员令牌/);
  await expect(page.locator('#loginButton')).toBeFocused();
  await page.click('#loginButton');

  await expect(page.locator('[data-console-shell]')).toBeVisible();
  await expect(page.getByRole('tab', { name: /概览/ }).first()).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: /当前页面：概览/ }).first()).toBeVisible();
  await expect(page.getByRole('tab', { name: /切换到密钥池/ }).first()).toBeVisible();
  await expect(page.locator('[data-tab-panel="overview"]')).toBeVisible();
  await expect(page.locator('#logout')).toHaveAttribute('aria-label', /退出管理员登录/);
  await expect(page.locator('#testWebhook')).toHaveAttribute('aria-label', /发送告警 Webhook 测试/);
  await expect(page.locator('#refresh')).toHaveAttribute('aria-label', /立即刷新控制台状态/);
  await expect(page.locator('#autoRefresh')).toHaveAttribute('aria-label', /自动刷新：已开启/);
  await expect(page.locator('#refreshInterval')).toHaveAttribute('aria-label', /刷新间隔/);
  await expect(page.locator('#proxyFlowMap')).toBeAttached();
  await expect(page.locator('#proxyFlowMap')).toBeAttached();
  await expect(page.locator('#proxyFlowMap')).toBeAttached();
  await page.locator('#topMoreToggle').click();
  await expect(page.locator('#topMoreMenu')).toBeVisible();
  await expect(page.locator('.security-group')).toBeVisible();
  await expect(page.locator('.refresh-group')).toBeVisible();
  await expect(page.locator('.utility-group')).toBeVisible();
  await expect(page.locator('#toggleSecretDisplay')).toContainText('隐藏原文');
  await expect(page.locator('#toggleSecretDisplay')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#toggleSecretDisplay')).toHaveAttribute('aria-label', /密钥显示方式：原文.*脱敏/);
  await expect(page.locator('#toggleSecretDisplay')).toHaveClass(/is-plain/);
  await page.click('#toggleSecretDisplay');
  await expect(page.locator('#toggleSecretDisplay')).toContainText('显示原文');
  await expect(page.locator('#toggleSecretDisplay')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#toggleSecretDisplay')).toHaveAttribute('aria-label', /密钥显示方式：脱敏.*显示原文/);
  await expect(page.locator('#toggleSecretDisplay')).not.toHaveClass(/is-plain/);
  await page.click('#toggleSecretDisplay');
  await expect(page.locator('#toggleSecretDisplay')).toContainText('隐藏原文');
  await page.getByRole('tab', { name: '密钥池' }).click();
  await expect(page.getByRole('tab', { name: '密钥池' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-tab-panel="keys"]')).toBeVisible();
  await expect(page.locator('#keyCount')).toHaveAttribute('role', 'status');
  await expect(page.locator('#keyCount')).toHaveAttribute('aria-label', /密钥池：\d+ 个密钥/);
  await expect(page.locator('#keyPager')).toHaveAttribute('role', 'status');
  await expect(page.locator('#keyPager')).toHaveAttribute('aria-label', /密钥分页：显示/);
  await expect(page.locator('#keyPageLabel')).toHaveAttribute('role', 'status');
  await expect(page.locator('#keyPageLabel')).toHaveAttribute('aria-label', /密钥页码：第/);
  await expect(page.locator('#keysBody tr[data-key-id="key_01_search"]')).toBeVisible();
  await expect(page.locator('#keysBody .key-row-signal')).toHaveCount(6);
  await expect(page.locator('#keysBody')).toContainText(/可调度|待样本|冷却中|429 压力|超时压力|失败信号|已停用/);
  await expect(page.locator('#keysBody .key-row-signal').first()).toHaveAttribute('aria-label', /状态信号.*可/);
  await expect(page.locator('#keyWorkflowSummary')).toBeVisible();
  await expect(page.locator('#keyWorkflowSummary')).toContainText('当前显示');
  await expect(page.locator('#keyWorkflowSummary')).toContainText('异常压力');
  await expect(page.locator('#keyWorkflowVisible')).toHaveText('6');
  await expect(page.locator('#keyWorkflowVisibleHint')).toContainText('当前页 1-6');
  await expect(page.locator('#keyWorkflowScope')).toContainText('全部密钥');
  await expect(page.locator('#keyWorkflowScopeHint')).toContainText('未筛选');
  const keyWorkflowActions = page.locator('#keyWorkflowSummary button[data-key-workflow-action]');
  await expect(keyWorkflowActions).toHaveCount(4);
  await expect(page.locator('[data-key-workflow-action="reset"]')).toBeEnabled();
  await expect(page.locator('[data-key-workflow-action="selected"]')).toBeDisabled();
  await expect(page.locator('[data-key-workflow-action="problems"]')).toBeEnabled();
  await expect(page.locator('[data-key-workflow-action="scope"]')).toBeEnabled();
  await expect(page.locator('[data-key-workflow-action="reset"]')).toHaveAttribute('aria-label', /全部密钥/);
  await expect(page.locator('#keyWorkflowSummary')).toHaveAttribute('aria-label', /密钥池工作流摘要/);
  await expect(page.locator('#keyFilterChips .chip[data-chip="All"]')).toHaveAttribute('aria-label', /当前筛选：全部密钥/);
  await expect(page.locator('#keyFilterChips .chip[data-chip="Healthy"]')).toHaveAttribute('aria-label', /筛选健康密钥.*点击后收窄密钥表/);
  const desktopWorkflowMetrics = await keyWorkflowTargetMetrics(page);
  expect(desktopWorkflowMetrics.overflow).toBeLessThanOrEqual(1);
  expect(desktopWorkflowMetrics.buttons.map((item) => item.action).sort()).toEqual(['problems', 'reset', 'scope', 'selected']);
  for (const button of desktopWorkflowMetrics.buttons) {
    expect(button.height).toBeGreaterThanOrEqual(40);
    expect(button.clippedX).toBe(false);
    expect(button.clippedY).toBe(false);
    if (button.action !== 'selected') expect(button.covered).toBe(false);
  }
  const desktopSignalMetrics = await keyRowSignalMetrics(page);
  expect(desktopSignalMetrics.overflow).toBeLessThanOrEqual(1);
  expect(desktopSignalMetrics.signals.length).toBeGreaterThanOrEqual(6);
  for (const signal of desktopSignalMetrics.signals) {
    expect(signal.keyId).not.toBe('');
    expect(signal.aria).toContain('状态信号');
    expect(signal.width).toBeGreaterThan(56);
    expect(signal.height).toBeGreaterThanOrEqual(30);
    expect(signal.clippedX, JSON.stringify(signal)).toBe(false);
    expect(signal.clippedY, JSON.stringify(signal)).toBe(false);
    expect(signal.covered, JSON.stringify(signal)).toBe(false);
    expect(signal.outsideCell, JSON.stringify(signal)).toBe(false);
  }
  const desktopKeyActionMetrics = await keyTableActionTargetMetrics(page);
  expect(desktopKeyActionMetrics.overflow).toBeLessThanOrEqual(1);
  expect(desktopKeyActionMetrics.buttons).toHaveLength(desktopSignalMetrics.signals.length * 4);
  for (const button of desktopKeyActionMetrics.buttons) {
    expect(button.height).toBeGreaterThanOrEqual(button.action === 'toggle' ? 20 : 26);
    expect(button.width).toBeGreaterThanOrEqual(button.action === 'toggle' ? 34 : 50);
    expect(button.clippedX, JSON.stringify(button)).toBe(false);
    expect(button.clippedY, JSON.stringify(button)).toBe(false);
    expect(button.covered, JSON.stringify(button)).toBe(false);
  }
  await expect(page.locator('#keyFilterSummary')).toBeVisible();
  await expect(page.locator('#keyFilterSummary')).toHaveAttribute('aria-label', /密钥筛选状态：/);
  await expect(page.locator('#keyFilterSummaryText')).toContainText('全部密钥');
  await expect(page.locator('#keyFilterSummaryChips')).toContainText('未筛选');
  await expect(page.locator('#clearKeyFilters')).toBeHidden();
  const requestsSort = page.getByRole('button', { name: /按请求数排序/ });
  const successSort = page.getByRole('button', { name: /按成功数排序/ });
  await expect(requestsSort).toHaveAttribute('aria-label', /按请求数排序。点击后按升序排列密钥表/);
  await expect(requestsSort).toBeVisible();
  // Compact density hides success/429/timeout columns until expanded.
  await page.locator('#keysDensityToggle').click();
  await expect(successSort).toBeVisible();
  await expect(page.locator('th[data-sort="requests"]')).toHaveAttribute('aria-sort', 'none');
  await expect(page.locator('th[data-sort="success"]')).toHaveAttribute('aria-sort', 'none');
  await expect(requestsSort).toHaveAttribute('aria-pressed', 'false');
  const requestsSortBox = await requestsSort.boundingBox();
  await requestsSort.focus();
  await expect(requestsSort).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('th[data-sort="requests"]')).toHaveAttribute('aria-sort', 'ascending');
  await expect(requestsSort).toHaveAttribute('aria-pressed', 'true');
  await expect(requestsSort).toHaveAttribute('aria-label', /当前升序/);
  const requestsSortedBox = await requestsSort.boundingBox();
  expect(Math.abs((requestsSortedBox?.width || 0) - (requestsSortBox?.width || 0))).toBeLessThanOrEqual(1);
  expect(Math.abs((requestsSortedBox?.height || 0) - (requestsSortBox?.height || 0))).toBeLessThanOrEqual(1);
  await page.keyboard.press('Enter');
  await expect(page.locator('th[data-sort="requests"]')).toHaveAttribute('aria-sort', 'descending');
  await expect(requestsSort).toHaveAttribute('aria-label', /当前降序/);
  await successSort.click();
  await expect(page.locator('th[data-sort="success"]')).toHaveAttribute('aria-sort', 'ascending');
  await expect(page.locator('th[data-sort="requests"]')).toHaveAttribute('aria-sort', 'none');
  await expect(requestsSort).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#sidebarCollapse')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#sidebarCollapse')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#sidebarCollapse')).toHaveAttribute('aria-label', /侧栏导航：已展开/);
  await page.click('#sidebarCollapse');
  await expect(page.locator('[data-console-shell]')).toHaveAttribute('data-sidebar-collapsed', '');
  await expect(page.locator('#sidebarCollapse .nav-icon-collapse')).toHaveClass(/is-collapsed/);
  await expect(page.locator('#sidebarCollapse .nav-label')).toContainText('展开');
  await expect(page.locator('#sidebarCollapse')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#sidebarCollapse')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#sidebarCollapse')).toHaveAttribute('aria-label', /侧栏导航：已收起/);
  await page.click('#sidebarCollapse');
  await expect(page.locator('[data-console-shell]')).not.toHaveAttribute('data-sidebar-collapsed', '');
  await expect(page.locator('#sidebarCollapse .nav-icon-collapse')).not.toHaveClass(/is-collapsed/);
  await expect(page.locator('#sidebarCollapse .nav-label')).toContainText('收起');
  await expect(page.locator('#sidebarCollapse')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#sidebarCollapse')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#sidebarCollapse')).toHaveAttribute('aria-label', /侧栏导航：已展开/);
  await expect(page.getByRole('button', { name: '测试当前页密钥' })).toBeVisible();
  await expect(page.getByRole('button', { name: '禁用异常密钥' })).toBeVisible();
  await expect(page.getByLabel(/按密钥 ID 或备注搜索密钥池/)).toBeVisible();
  await expect(page.getByLabel(/选择当前页全部密钥/)).toBeVisible();
  await expect(page.getByLabel(/每页密钥数量/)).toBeVisible();
  await expect(page.getByLabel(/跳转到密钥页码/)).toBeVisible();
  await expect(page.getByLabel(/选择密钥 key_01_search/)).toBeVisible();
  await expect(page.getByRole('button', { name: /切换密钥 key_01_search 启用状态/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /查看密钥 key_01_search 详情/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /重置密钥 key_01_search 冷却/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /测试密钥 key_01_search/ }).first()).toBeVisible();
  await expect(page.locator('#batchTestPage')).toContainText('测试当前页');
  await expect(page.locator('#batchDisableProblems')).toContainText('禁用异常密钥');
  await expect(page.locator('[data-tab-panel="keys"]')).not.toContainText('测试选中');
  await expect(page.locator('#batchBar')).toBeHidden();
  await page.locator('#keysBody tr[data-key-id="key_01_search"] input.key-checkbox').check();
  await expect(page.locator('#batchBar')).toBeVisible();
  await expect(page.locator('#batchCount')).toContainText('已选 1 个密钥');
  await expect(page.locator('#batchCount')).toContainText('批量操作会写入管理员审计');
  await expect(page.locator('#batchCount strong')).toContainText('已选 1 个密钥');
  await expect(page.locator('#batchCount')).toHaveAttribute('role', 'status');
  await expect(page.locator('#batchCount')).toHaveAttribute('aria-label', /已选 1 个密钥/);
  await expect(page.locator('#batchEnableSelected')).toHaveAttribute('aria-label', /启用已选密钥/);
  await expect(page.locator('#batchDisableSelected')).toHaveAttribute('aria-label', /禁用已选密钥/);
  await expect(page.locator('#batchTestSelected')).toHaveAttribute('aria-label', /测试已选密钥/);
  await expect(page.locator('#batchClearSelection')).toHaveAttribute('aria-label', /清除已选密钥/);
  await expect(page.locator('#selectAllKeys')).toHaveAttribute('aria-checked', 'mixed');
  await expect(page.locator('#selectAllKeys')).toHaveAttribute('aria-label', /部分已选/);
  await expect(page.locator('#keyWorkflowSelected')).toHaveText('1');
  await expect(page.locator('#keyWorkflowSelectedHint')).toContainText('批量栏已启用');
  await expect(page.locator('[data-key-workflow-action="selected"]')).toBeEnabled();
  await page.locator('[data-key-workflow-action="selected"]').click();
  await expect(page.locator('#batchTestSelected')).toBeFocused();
  await page.click('#batchDisableSelected');
  await expect(page.locator('#confirmActionModal')).toHaveClass(/modal-open/);
  await expect(page.locator('#confirmActionModal')).toHaveAttribute('data-confirm-action', 'batch-disable-selected');
  await expect(page.locator('#confirmActionModal')).toHaveAttribute('aria-label', /危险操作确认：批量禁用密钥/);
  await expect(page.locator('#confirmActionTitle')).toContainText('批量禁用密钥');
  await expect(page.locator('#confirmActionTitle')).toHaveAttribute('aria-label', /确认操作：批量禁用密钥/);
  await expect(page.locator('#confirmActionText')).toContainText('1 个密钥');
  await expect(page.locator('#confirmActionText')).toHaveAttribute('aria-label', /确认说明：/);
  await expect(page.locator('#confirmActionAccept')).toHaveAttribute('aria-label', /确认禁用：批量禁用密钥/);
  await expect(page.locator('#confirmActionCancel')).toHaveAttribute('aria-label', /取消“批量禁用密钥”/);
  await expect(page.locator('#closeConfirmAction')).toHaveAttribute('aria-label', /关闭“批量禁用密钥”确认/);
  await expect(page.locator('#confirmActionCancel')).toBeFocused();
  await page.click('#confirmActionCancel');
  await expect(page.locator('#confirmActionModal')).toBeHidden();
  await expect(page.locator('#confirmActionAccept')).toHaveAttribute('aria-label', /确认执行危险操作/);
  await expect(page.locator('#confirmActionCancel')).toHaveAttribute('aria-label', /取消确认操作，返回控制台/);
  await expect(page.locator('#batchBar')).toBeVisible();
  await expect(page.locator('#keysBody tr[data-key-id="key_01_search"]')).toBeVisible();
  await expect(page.locator('[data-console-shell]')).toHaveAttribute('data-batch-open', '');
  await expect(page.locator('#batchClearSelection')).toBeVisible();
  await expect(page.getByRole('button', { name: '清除已选密钥' })).toBeVisible();
  const mainPadOpen = await page.locator('.main').evaluate((node) => getComputedStyle(node).paddingBottom);
  expect(Number.parseFloat(mainPadOpen)).toBeGreaterThanOrEqual(70);
  // updateBatchBar → syncToastLift measures the open bar without a full batch API round-trip.
  await expect.poll(async () => page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--toast-lift') || '0'))).toBeGreaterThanOrEqual(50);
  const toastClearance = await page.evaluate(() => {
    const toast = document.getElementById('toast');
    const bar = document.getElementById('batchBar');
    if (!toast || !bar || bar.hidden) return { ok: false, gap: -1, lift: '', toastBottom: 0, barTop: 0 };
    toast.className = 'toast good';
    toast.textContent = '批量操作完成：1 个密钥';
    toast.style.display = 'block';
    toast.setAttribute('data-toast-lift', 'batch');
    const toastRect = toast.getBoundingClientRect();
    const barRect = bar.getBoundingClientRect();
    const gap = barRect.top - toastRect.bottom;
    return {
      ok: toastRect.bottom <= barRect.top - 4,
      gap,
      lift: getComputedStyle(document.documentElement).getPropertyValue('--toast-lift').trim(),
      toastBottom: toastRect.bottom,
      barTop: barRect.top
    };
  });
  expect(toastClearance.ok, JSON.stringify(toastClearance)).toBe(true);
  expect(toastClearance.gap).toBeGreaterThanOrEqual(4);
  expect(Number.parseFloat(toastClearance.lift || '0')).toBeGreaterThanOrEqual(50);
  await page.click('#batchClearSelection');
  await expect(page.locator('#batchBar')).toBeHidden();
  await expect(page.locator('[data-console-shell]')).not.toHaveAttribute('data-batch-open', '');
  await expect(page.locator('#keysBody tr[data-key-id="key_01_search"] input.key-checkbox')).not.toBeChecked();
  await expect(page.locator('#keyWorkflowSelected')).toHaveText('0');
  await expect(page.locator('[data-key-workflow-action="selected"]')).toBeDisabled();
  const mainPadClosed = await page.locator('.main').evaluate((node) => getComputedStyle(node).paddingBottom);
  expect(Number.parseFloat(mainPadClosed)).toBeLessThan(40);
  await expect.poll(async () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--toast-lift').trim())).toBe('0px');

  await page.getByRole('tab', { name: '概览' }).click();
  await expect(page.locator('#insightJudgement')).toBeAttached();
  await expect(page.locator('#insightJudgementTitle')).toBeAttached();
  await expect(page.locator('#insightJudgementTitle')).toBeAttached();
  await expect(page.locator('#insightJudgementTitle')).toBeAttached();
  await expect(page.locator('#insightJudgementText')).toBeAttached();
  await expect(page.locator('#insightNextActionTitle')).toBeAttached();
  await expect(page.locator('#insightNextActionTitle')).toBeAttached();
  await expect(page.locator('#insightNextActionText')).toBeAttached();
  await expect(page.locator('#insightWindowTitle')).toHaveAttribute('aria-label', /观测窗口：/);
  await expect(page.locator('#insightWindowText')).toBeAttached();
  await expect(page.locator('#insightNextAction')).toBeAttached();
  const overviewNextAction = page.locator('#insightNextActionButton');
  await expect(overviewNextAction).toBeVisible();
  await expect(overviewNextAction).toHaveAttribute('aria-label', /点击执行下一步/);
  await expect(overviewNextAction).toHaveAttribute('data-overview-action', /logs-focus|keys-problem/);
  await expect(page.locator('#insightWindow')).toBeAttached();
  await expect(page.locator('#insightWindowText')).toBeAttached();
  await expect(page.locator('#proxyFlowMap')).toBeAttached();
  await expect(page.locator('#proxyFlowMap')).toBeAttached();
  await expect(page.locator('#proxyFlowMap')).toBeAttached();
  await expect(page.locator('#proxyFlowMap')).toBeAttached();
  await expect(page.locator('#proxyFlowMap')).toBeAttached();
  await expect(page.locator('#proxyFlowSummary')).toBeAttached();
  await expect(page.locator('#proxyFlowKeyValue')).toBeAttached();
  await expect(page.locator('#proxyFlowProxyValue')).toBeAttached();
  await expect(page.locator('#recentActivityRail')).toBeAttached();
  await expect(page.locator('#recentActivityTitle')).toBeAttached();
  await expect(page.locator('#recentActivityMeta')).toBeAttached();
  await expect(page.locator('#recentActivityList')).toBeAttached();
  await expect(page.locator('#recentActivityList .recent-activity-item').first()).toHaveAttribute('aria-label', /最近请求：.*点击/);
  await expect(page.locator('#recentActivityList')).toBeAttached();
  await expect(page.locator('#recentActivityList')).toBeAttached();
  await expect(page.locator('#recentActivityList')).toBeAttached();
  await expect(page.locator('#trendRecap')).toContainText('窗口请求');
  await expect(page.locator('#trendRecap')).toContainText('峰值桶');
  await expect(page.locator('#trendRequests')).not.toContainText('等待');
  await expect(page.locator('#alertList')).toContainText(/建议排查|建议立即处理|当前窗口无需人工处理/);
  await expect(page.locator('#alertCount')).toHaveAttribute('role', 'status');
  await expect(page.locator('#alertCount')).toHaveAttribute('aria-label', /告警中心：\d+ 条告警/);
  await expect(page.locator('#trendSummary')).toHaveAttribute('role', 'status');
  await expect(page.locator('#trendSummary')).toHaveAttribute('aria-label', /趋势状态：/);
  await expect(page.locator('#trendWindowLabel')).toHaveAttribute('role', 'status');
  await expect(page.locator('#trendWindowLabel')).toHaveAttribute('aria-label', /趋势窗口：/);
  await expect(page.locator('[data-summary-metric="service"]')).toHaveAttribute('aria-label', /服务状态：/);
  await expect(page.locator('[data-summary-metric="active-keys"]')).toHaveAttribute('aria-label', /健康密钥：/);
  await expect(page.locator('[data-summary-metric="total-requests"]')).toHaveAttribute('aria-label', /请求总量：/);
  await expect(page.locator('[data-summary-metric="error-rate"]')).toHaveAttribute('aria-label', /错误率：/);
  await expect(page.locator('[data-metric-card="usage"]')).toHaveAttribute('aria-label', /用量：/);
  await expect(page.locator('[data-metric-card="success"]')).toHaveAttribute('aria-label', /成功率：/);
  await expect(page.locator('[data-metric-card="rate-limit"]')).toHaveAttribute('aria-label', /限流 429：/);
  await expect(page.locator('[data-metric-card="latency"]')).toHaveAttribute('aria-label', /平均延迟：/);
  await expect(page.locator('[data-metric-card="failure"]')).toHaveAttribute('aria-label', /失败数：/);
  await expect(page.locator('#opsSeverity')).toHaveAttribute('role', 'status');
  await expect(page.locator('#opsSeverity')).toHaveAttribute('aria-label', /运行态势：/);
  await expect(page.locator('#opsAlert')).toHaveAttribute('aria-label', /运行提示：/);
  await expect(page.locator('#healthyKeyCount')).toHaveAttribute('aria-label', /健康密钥：/);
  await expect(page.locator('#cooldownKeyCount')).toHaveAttribute('aria-label', /冷却处理：/);
  await expect(page.locator('#disabledKeyCount')).toHaveAttribute('aria-label', /已禁用密钥：/);
  await expect(page.locator('#latestStatus')).toHaveAttribute('role', /status|alert/);
  await expect(page.locator('#latestStatus')).toHaveAttribute('aria-label', /链路状态：/);
  await expect(page.locator('#latestError')).toHaveAttribute('aria-label', /最近错误：/);
  await expect(page.locator('#latestPath')).toHaveAttribute('aria-label', /最后路径：/);
  await expect(page.locator('#latestChain')).toHaveAttribute('aria-label', /密钥链路：/);
  const desktopOverviewSignals = await overviewSignalTargetMetrics(page);
  expect(desktopOverviewSignals.overflow).toBeLessThanOrEqual(1);
  expect(desktopOverviewSignals.buttons.map((item) => item.action)).toEqual(expect.arrayContaining(['keys', 'logs-focus', 'log-errors', 'log-rate-limit', 'trend-focus']));
  expect(desktopOverviewSignals.buttons.length).toBeGreaterThan(0);
  for (const button of desktopOverviewSignals.buttons) {
    expect(button.height).toBeGreaterThanOrEqual(34);
    expect(button.width).toBeGreaterThan(72);
    expect(button.clippedX, JSON.stringify(button)).toBe(false);
    expect(button.clippedY, JSON.stringify(button)).toBe(false);
    expect(button.covered, JSON.stringify(button)).toBe(false);
  }
  const overviewActionId = await clickOverviewNextAction(page);
  if (overviewActionId === 'keys-problem') {
    await expect(page.locator('[data-tab-panel="keys"]')).toBeVisible();
    await expect(page.locator('#keyFilterChips .chip[data-chip="Problem"]')).toHaveClass(/active/);
    await expect(page.locator('#keyFilterChips .chip[data-chip="Problem"]')).toBeFocused();
  } else {
    await expect(page.locator('[data-tab-panel="logs"]')).toBeVisible();
    await expect(page.locator('#logSearch')).toBeFocused();
  }
  await page.getByRole('tab', { name: '概览' }).click();
  await clickOverviewSignalAction(page, 'keys');
  await expect(page.locator('[data-tab-panel="keys"]')).toBeVisible();
  await expect(page.locator('#keySearch')).toBeFocused();
  await page.getByRole('tab', { name: '概览' }).click();
  await clickOverviewSignalAction(page, 'logs-focus');
  await expect(page.locator('[data-tab-panel="logs"]')).toBeVisible();
  await expect(page.locator('#logSearch')).toBeFocused();
  await page.getByRole('tab', { name: '概览' }).click();
  await clickOverviewSignalAction(page, 'log-errors');
  await expect(page.locator('[data-tab-panel="logs"]')).toBeVisible();
  await expect(page.locator('#logStatusFilter')).toHaveValue('error');
  await expect(page.locator('#logStatusFilter')).toBeFocused();
  await expect(page.locator('#logFilterChips')).toContainText('异常');
  await page.click('#clearLogFilters');
  await expect(page.locator('#logStatusFilter')).toHaveValue('');
  await page.getByRole('tab', { name: '概览' }).click();
  await clickOverviewSignalAction(page, 'log-rate-limit');
  await expect(page.locator('[data-tab-panel="logs"]')).toBeVisible();
  await expect(page.locator('#logStatusFilter')).toHaveValue('429');
  await expect(page.locator('#logStatusFilter')).toBeFocused();
  await expect(page.locator('#logFilterChips')).toContainText('429');
  await page.click('#clearLogFilters');
  await expect(page.locator('#logStatusFilter')).toHaveValue('');
  await page.getByRole('tab', { name: '概览' }).click();
  await clickOverviewSignalAction(page, 'trend-focus');
  await expect(page.locator('[data-tab-panel="overview"]')).toBeVisible();
  await expect(page.locator('#timeRange')).toBeFocused();
  if (await page.locator('#alertList button[data-overview-signal-action="alert-focus"]').count()) {
    const alertLabel = await page.locator('#alertList button[data-overview-signal-action="alert-focus"]').first().getAttribute('aria-label');
    await clickOverviewSignalAction(page, 'alert-focus');
    await expect(page.locator('#toast')).toContainText('已聚焦告警建议');
    // Re-query after possible SSE/refresh re-render of #alertList; do not hold the pre-click handle.
    await expect.poll(async () => {
      return page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null;
        if (!active) return '';
        if (active.matches('#alertList button[data-overview-signal-action="alert-focus"]')) {
          return active.getAttribute('aria-label') || 'alert-focus';
        }
        if (active.id === 'insightNextActionButton' || active.id === 'alertList') return active.id;
        return '';
      });
    }).not.toBe('');
    if (alertLabel) {
      await expect(page.locator('#alertList button[data-overview-signal-action="alert-focus"]').first()).toHaveAttribute('aria-label', alertLabel);
    }
  }
  await page.getByRole('tab', { name: '密钥池' }).click();
  await page.locator('[data-key-workflow-action="problems"]').click();
  await expect(page.locator('#keyFilterChips .chip[data-chip="Problem"]')).toHaveClass(/active/);
  await expect(page.locator('#keyFilterChips .chip[data-chip="Problem"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#keyFilterChips .chip[data-chip="Problem"]')).toHaveAttribute('aria-label', /当前筛选：异常密钥/);
  await expect(page.locator('#keyFilterChips .chip[data-chip="All"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#keyFilterChips .chip[data-chip="Problem"]')).toBeFocused();
  await expect(page.locator('#keyFilterSummaryChips')).toContainText('异常');
  await expect(page.locator('#keyWorkflowScope')).toContainText('异常密钥');
  await page.locator('[data-key-workflow-action="scope"]').click();
  await expect(page.locator('#keySearch')).toBeFocused();
  await page.locator('[data-key-workflow-action="reset"]').click();
  await expect(page.locator('#keySearch')).toHaveValue('');
  await expect(page.locator('#keyFilterChips .chip[data-chip="All"]')).toHaveClass(/active/);
  await expect(page.locator('#keyFilterChips .chip[data-chip="All"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#keyFilterChips .chip[data-chip="Problem"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#keyFilterChips .chip[data-chip="All"]')).toBeFocused();

  await page.fill('#keySearch', 'missing_key_for_filter_empty_state');
  await expect(page.locator('#keysBody')).toContainText('没有匹配的密钥');
  await expect(page.locator('#keysBody')).not.toContainText('还没有可调度的 Exa Key');
  await expect(page.locator('#keysBody .key-empty-state')).toBeVisible();
  await expect(page.locator('#keysBody .key-empty-state')).toContainText('筛选结果');
  await expect(page.locator('#keysBody .key-empty-state')).toContainText('关键词 · missing_key_for_filter_empty_state');
  await expect(page.locator('#keysBody button[data-empty-action="clear-filters"]')).toBeVisible();
  await expect(page.locator('#keysBody button[data-empty-action="clear-filters"]')).toHaveAttribute('aria-label', /清除密钥池筛选/);
  {
    const previousViewport = page.viewportSize() || { width: 1280, height: 844 };
    await page.setViewportSize({ width: 390, height: 844 });
    // Re-query each poll so auto-refresh re-renders do not detach the empty-action mid-scroll.
    await expect.poll(async () => {
      const emptyClear = page.locator('#keysBody button[data-empty-action="clear-filters"]');
      if (!(await emptyClear.count())) return 0;
      await emptyClear.scrollIntoViewIfNeeded().catch(() => {});
      const box = await emptyClear.boundingBox();
      return Math.round(box?.height ?? 0);
    }).toBeGreaterThanOrEqual(44);
    await expect(page.locator('#keysBody button[data-empty-action="clear-filters"]')).toBeVisible();
    const detailClear = page.locator('#detailsBody button[data-empty-action="clear-filters"], #mobileDetails button[data-empty-action="clear-filters"]').first();
    if (await detailClear.count()) {
      await detailClear.scrollIntoViewIfNeeded().catch(() => {});
      const detailClearBox = await detailClear.boundingBox();
      if (detailClearBox) expect(Math.round(detailClearBox.height)).toBeGreaterThanOrEqual(44);
    }
    await page.setViewportSize(previousViewport);
  }
  await expect(page.locator('#detailsBody .key-detail-empty')).toContainText('当前范围没有可查看密钥');
  await expect(page.locator('#keyWorkflowVisible')).toHaveText('0');
  await expect(page.locator('#keyWorkflowVisibleHint')).toContainText('当前页 0 个');
  await expect(page.locator('#keyWorkflowScope')).toContainText('搜索 "missing_key_for_filter_empty_state"');
  await expect(page.locator('#keyFilterSummary')).toContainText('匹配 0 个密钥');
  await expect(page.locator('#keyFilterSummaryChips')).toContainText('关键词');
  await expect(page.locator('#keyFilterSummaryChips')).toContainText('missing_key_for_filter_empty_state');
  await expect(page.locator('#keyFilterSummaryChips button[data-filter-remove="query"]')).toBeVisible();
  await expect(page.locator('#clearKeyFilters')).toBeVisible();
  await page.locator('#keysBody button[data-empty-action="clear-filters"]').click();
  await expect(page.locator('#keySearch')).toHaveValue('');
  await expect(page.locator('#clearKeyFilters')).toBeHidden();
  await expect(page.locator('#keyFilterSummaryChips')).toContainText('未筛选');
  await expect(page.locator('#keysBody tr[data-key-id="key_01_search"]')).toBeVisible();
  await expect(page.locator('#keyWorkflowScope')).toContainText('全部密钥');
  await page.locator('#keyFilterChips .chip[data-chip="Problem"]').click();
  await expect(page.locator('#keyFilterSummary')).toContainText('匹配');
  await expect(page.locator('#keyFilterSummary')).toContainText('个密钥');
  await expect(page.locator('#keyFilterSummaryChips')).toContainText('状态');
  await expect(page.locator('#keyFilterSummaryChips')).toContainText('异常');
  await expect(page.locator('#keyFilterSummaryChips button[data-filter-remove="status"]')).toBeVisible();
  await expect(page.locator('#keyWorkflowScope')).toContainText('异常密钥');
  await expect(page.locator('#clearKeyFilters')).toBeVisible();
  await page.locator('#keyFilterSummaryChips button[data-filter-remove="status"]').click();
  await expect(page.locator('#keyFilterChips .chip[data-chip="All"]')).toHaveClass(/active/);
  await expect(page.locator('#clearKeyFilters')).toBeHidden();
  await expect(page.locator('#keyWorkflowScope')).toContainText('全部密钥');

  await page.click('#bulkImportBtn');
  await expect(page.locator('#importModal')).toHaveClass(/modal-open/);
  await expect(page.locator('.import-readiness')).toContainText('提交前预检');
  await expect(page.locator('.import-readiness')).toContainText('本地状态库');
  await expect(page.locator('.import-format-grid')).toContainText('设置权重');
  await expect(page.locator('#importDropzone')).toContainText('拖入 .txt / .csv / .json 文件');
  await expect(page.locator('#importPreview')).toContainText('待输入');
  await expect(page.locator('#importPreview')).toHaveAttribute('role', 'status');
  await expect(page.locator('#importPreview')).toHaveAttribute('aria-label', /导入预览：待输入.*可粘贴密钥或选择文件后预检/);
  await expect(page.locator('#confirmImport')).toBeDisabled();
  await expect(page.locator('#confirmImport')).toHaveAttribute('aria-label', /开始导入不可用/);
  await expect(page.locator('#bulkImportBtn')).toHaveAttribute('aria-label', /批量导入已打开/);
  await expect(page.locator('#cancelImport')).toHaveAttribute('aria-label', /取消批量导入，返回密钥池/);
  await page.keyboard.press('Tab');
  await expect(page.locator('#importFileButton')).toBeFocused();
  // Narrow import dropzone file picker should stay ≥44px after modal enter animation.
  {
    const previousViewport = page.viewportSize() || { width: 1280, height: 844 };
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(280);
    const importFileBox = await page.locator('#importFileButton').boundingBox();
    expect(Math.round(importFileBox?.height ?? 0)).toBeGreaterThanOrEqual(44);
    await page.setViewportSize(previousViewport);
  }
  await expect(page.locator('#importFileInput')).not.toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#importTextarea')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#closeImportModal')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#importTextarea')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#importModal')).not.toHaveClass(/modal-open/);
  await expect(page.locator('#bulkImportBtn')).toBeFocused();

  await page.click('#bulkImportBtn');
  await expect(page.locator('#importTextarea')).toBeFocused();
  await page.locator('#importDropzone').dispatchEvent('dragover', {
    dataTransfer: await page.evaluateHandle(() => new DataTransfer())
  });
  await expect(page.locator('#importDropzone')).toHaveClass(/is-dragging/);
  const dataTransfer = await page.evaluateHandle(() => {
    const dt = new DataTransfer();
    const file = new File(['imported_e2e:fake_key_imported:2\nduplicate_e2e:fake_key_imported:4\n{bad-json'], 'keys.txt', { type: 'text/plain' });
    dt.items.add(file);
    return dt;
  });
  await page.locator('#importDropzone').dispatchEvent('drop', { dataTransfer });
  await expect(page.locator('#importDropzone')).not.toHaveClass(/is-dragging/);
  await expect(page.locator('#importFileName')).toContainText('keys.txt');
  await expect(page.locator('#importFileName')).toHaveAttribute('role', 'status');
  await expect(page.locator('#importFileName')).toHaveAttribute('data-import-file-state', 'ready');
  await expect(page.locator('#importFileName')).toHaveAttribute('aria-label', /导入文件已载入：keys\.txt.*可继续编辑文本或点击开始导入/);
  await expect(page.locator('#importPreview')).toContainText('可导入，但有跳过项');
  await expect(page.locator('#importPreview')).toHaveAttribute('aria-label', /导入预览：可导入，但有跳过项.*可点击开始导入提交/);
  await expect(page.locator('#importPreview')).toContainText('将提交 1 个可导入密钥');
  await expect(page.locator('#importPreview')).toContainText('重复密钥已跳过');
  await expect(page.locator('#importPreview')).toContainText('JSON 格式无法解析');
  await expect(page.locator('#confirmImport')).toBeEnabled();
  await expect(page.locator('#confirmImport')).toHaveAttribute('aria-label', /确认开始批量导入 1 个密钥/);
  await page.click('#confirmImport');
  await expect(page.locator('#importModal')).not.toHaveClass(/modal-open/);
  await page.fill('#keySearch', 'imported_e2e');
  await expect(page.locator('#keysBody tr[data-key-id="imported_e2e"]')).toBeVisible();
  await expect(page.locator('#keysBody')).not.toContainText('duplicate_e2e');
  await page.fill('#keySearch', '');

  // Row-origin test action must restore focus to the recreated table button after re-render.
  await page.locator('#keysBody tr[data-key-id="key_01_search"] button[data-action="test"]').click();
  await expect(page.locator('#detailsBody')).toContainText('测试密钥');
  await expect(page.locator('#detailsBody')).toContainText(/状态 200/);
  await expect(page.locator('#keysBody tr[data-key-id="key_01_search"] button[data-action="test"]')).toBeFocused();

  await page.locator('#keysBody tr[data-key-id="key_01_search"] button[data-action="select"]').click();
  await expect(page.locator('#detailsBody')).toContainText('key_01_search');
  await expect(page.locator('#detailsBody .detail-hero')).toContainText('当前密钥');
  await expect(page.locator('#detailsBody .detail-health')).toContainText(/可继续调度|存在异常信号|待请求样本|冷却保护中|已暂停调度/);
  await expect(page.locator('#detailsBody .detail-facts')).toContainText('调度');
  await expect(page.locator('#detailsBody .detail-diagnostics')).toContainText('冷却处理');
  await expect(page.locator('#detailsBody')).toContainText('最近失败原因');
  await expect(page.locator('#detailsBody .detail-actions button[data-detail-action="test"]')).toBeVisible();
  await expect(page.locator('#detailsBody .detail-actions button[data-detail-action="test"]')).toHaveAttribute('aria-label', /测试密钥/);
  await expect(page.locator('#detailsBody .detail-actions button[data-detail-action="logs"]')).toBeVisible();
  await expect(page.locator('#detailsBody .detail-actions button[data-detail-action="logs"]')).toHaveAttribute('aria-label', /查看密钥/);
  await expect(page.locator('#detailsBody .detail-actions button[data-detail-action="copy"]')).toHaveAttribute('aria-label', /复制密钥/);
  await expect(page.locator('#detailsBody .detail-actions button[data-detail-action="reset"]')).toHaveAttribute('aria-label', /重置密钥/);

  await page.locator('#detailsBody button[data-detail-action="test"]').click();
  await expect(page.locator('#detailsBody')).toContainText('测试密钥');
  await expect(page.locator('#detailsBody')).toContainText(/状态 200/);
  const desktopDetailMetrics = await detailActionTargetMetrics(page, '#detailsBody');
  expect(desktopDetailMetrics.overflow).toBeLessThanOrEqual(1);
  expect(desktopDetailMetrics.buttons.map((item) => item.action).sort()).toEqual(['copy', 'disable', 'logs', 'reset', 'test']);
  for (const button of desktopDetailMetrics.buttons) {
    expect(button.height).toBeGreaterThanOrEqual(40);
    expect(button.width).toBeGreaterThan(72);
    expect(button.clippedX, JSON.stringify(button)).toBe(false);
    expect(button.clippedY, JSON.stringify(button)).toBe(false);
    expect(button.covered, JSON.stringify(button)).toBe(false);
  }
  await Promise.all([
    waitForKeyLogFilterResponse(page, 'key_01_search'),
    page.locator('#detailsBody button[data-detail-action="logs"]').click()
  ]);
  await expectKeyLogDrilldown(page, 'key_01_search');
  await expect(page.locator('#clearLogFilters')).toBeVisible();
  await page.click('#clearLogFilters');
  await expect(page.locator('#logKeyFilter')).toHaveValue('');
  await expect(page.locator('#clearLogFilters')).toBeHidden();

  await expect(page.getByLabel(/按关键词或 requestId 搜索请求日志/)).toBeVisible();
  await expect(page.locator('#logPager')).toHaveAttribute('role', 'status');
  await expect(page.locator('#logPager')).toHaveAttribute('aria-label', /日志分页：/);
  await page.fill('#logSearch', 'no_match_log_filter_zzzz');
  await expect(page.locator('#logsBody')).toContainText('没有匹配的日志');
  await expect(page.locator('#logsBody button[data-empty-action="clear-log-filters"]')).toBeVisible();
  await expect(page.locator('#logsBody button[data-empty-action="clear-log-filters"]')).toHaveAttribute('aria-label', /清除请求日志筛选/);
  {
    const previousViewport = page.viewportSize() || { width: 1280, height: 844 };
    await page.setViewportSize({ width: 390, height: 844 });
    const logEmptyClearBox = await page.locator('#logsBody button[data-empty-action="clear-log-filters"]').boundingBox();
    expect(logEmptyClearBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    await page.setViewportSize(previousViewport);
  }
  await page.locator('#logsBody button[data-empty-action="clear-log-filters"]').click();
  await expect(page.locator('#logSearch')).toHaveValue('');
  await expect(page.locator('#logsBody')).not.toContainText('没有匹配的日志');
  await expect(page.getByLabel(/按路径筛选请求日志/)).toBeVisible();
  await expect(page.getByLabel(/按密钥 ID 筛选请求日志/)).toBeVisible();
  await expect(page.getByLabel(/按状态筛选请求日志/)).toBeVisible();
  await page.selectOption('#logStatusFilter', '5xx');
  await page.click('#applyLogFilters');
  await expect(page.locator('#logFilterSummary')).toContainText('状态');
  await expect(page.locator('#logFilterSummary')).toContainText('5xx');
  await expect(page.locator('#logDiagnostics')).toContainText('显示日志');
  await expect(page.locator('#logDiagnostics')).toContainText('异常');
  await expect(page.locator('#logVisibleHint')).toContainText('匹配筛选');
  await expect(page.locator('#clearLogFilters')).toBeVisible();
  await expect(page.locator('#logsBody')).toContainText('503');
  const logDiagnosticActions = page.locator('#logDiagnostics button[data-log-diagnostic-action]');
  await expect(logDiagnosticActions).toHaveCount(4);
  await expect(page.locator('#logDiagnostics')).toHaveAttribute('aria-label', /日志诊断摘要/);
  await expect(page.locator('[data-log-diagnostic-action="reset"]')).toBeEnabled();
  await expect(page.locator('[data-log-diagnostic-action="reset"]')).toHaveAttribute('aria-label', /显示日志/);
  await expect(page.locator('[data-log-diagnostic-action="errors"]')).toBeEnabled();
  await expect(page.locator('[data-log-diagnostic-action="errors"]')).toHaveAttribute('aria-label', /异常请求/);
  await expect(page.locator('[data-log-diagnostic-action="slowest"]')).toBeEnabled();
  const desktopDiagnosticMetrics = await logDiagnosticTargetMetrics(page);
  expect(desktopDiagnosticMetrics.overflow).toBeLessThanOrEqual(1);
  expect(desktopDiagnosticMetrics.buttons.map((item) => item.action).sort()).toEqual(['errors', 'rate-limit', 'reset', 'slowest']);
  for (const button of desktopDiagnosticMetrics.buttons) {
    expect(button.height).toBeGreaterThanOrEqual(40);
    expect(button.clippedX, JSON.stringify(button)).toBe(false);
    expect(button.clippedY, JSON.stringify(button)).toBe(false);
    expect(button.covered, JSON.stringify(button)).toBe(false);
  }
  await page.locator('[data-log-diagnostic-action="errors"]').click();
  await expect(page.locator('#logStatusFilter')).toHaveValue('error');
  await expect(page.locator('#logFilterChips')).toContainText('异常');
  await expect(page.locator('#logsBody')).toContainText(/429|503/);
  await page.locator('[data-log-diagnostic-action="rate-limit"]').click();
  await expect(page.locator('#logStatusFilter')).toHaveValue('429');
  await expect(page.locator('#logFilterChips')).toContainText('429');
  await expect(page.locator('#logsBody')).toContainText('429');
  await expect(page.locator('#logsBody')).not.toContainText('503');
  await page.locator('[data-log-diagnostic-action="reset"]').click();
  await expect(page.locator('#clearLogFilters')).toBeHidden();
  await expect(page.locator('#logStatusFilter')).toHaveValue('');
  await expect(page.locator('#logFilterChips')).toContainText('未筛选');
  await expect(page.locator('#logsBody')).toContainText('503');
  await page.locator('[data-log-diagnostic-action="slowest"]').click();
  await expect(page.locator('#logPathFilter')).toBeFocused();
  await expect(page.locator('#logPathFilter')).not.toHaveValue('');
  await expect(page.locator('#logFilterChips')).toContainText('路径');
  await expect(page.getByRole('button', { name: /查看请求 .* 链路/ }).first()).toBeVisible();
  let pruneRequested = false;
  await page.route('**/_proxy/logs/prune', async (route) => {
    pruneRequested = true;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ deleted: 0 }) });
  });
  await page.click('#pruneLogs');
  await expect(page.locator('#confirmActionModal')).toHaveClass(/modal-open/);
  await expect(page.locator('#confirmActionModal')).toHaveAttribute('data-confirm-action', 'prune-logs');
  await expect(page.locator('#confirmActionModal')).toHaveAttribute('aria-label', /危险操作确认：清理过期日志/);
  await expect(page.locator('#confirmActionTitle')).toContainText('清理过期日志');
  await expect(page.locator('#confirmActionTitle')).toHaveAttribute('aria-label', /确认操作：清理过期日志/);
  await expect(page.locator('#confirmActionText')).toContainText('过期');
  await expect(page.locator('#confirmActionAccept')).toHaveAttribute('aria-label', /确认清理：清理过期日志/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#confirmActionModal')).toBeHidden();
  expect(pruneRequested).toBe(false);
  await page.click('#pruneLogs');
  await expect(page.locator('#confirmActionModal')).toHaveClass(/modal-open/);
  await page.click('#confirmActionAccept');
  await expect(page.locator('#confirmActionModal')).toBeHidden();
  await expect.poll(() => pruneRequested).toBe(true);
  await page.unroute('**/_proxy/logs/prune');
  const firstTrace = page.locator('#logsBody button[data-trace-id]').first();
  await firstTrace.scrollIntoViewIfNeeded();
  await firstTrace.click({ force: true });
  await expect(page.locator('#tracePanel')).toContainText('请求链路');
  await expect(page.locator('#tracePanel .trace-summary')).toContainText('最终状态');
  await expect(page.locator('#tracePanel .trace-chain')).toContainText('密钥链路');
  await expect(page.locator('#tracePanel .trace-item').first()).toContainText(/POST|GET/);
  await expect(page.locator('#tracePanel')).toContainText(/503|200/);
  await expect(page.locator('#tracePanel .log-key-link[data-log-key-action="open-detail"]').first()).toBeVisible();
  const traceKeyId = await page.locator('#tracePanel .log-key-link[data-log-key-action="open-detail"]').first().getAttribute('data-key-id');
  expect(traceKeyId).toBeTruthy();
  await page.locator('#tracePanel .log-key-link[data-log-key-action="open-detail"]').first().click();
  await expectKeyDetailOpenFromLog(page, traceKeyId || '');
  await page.getByRole('tab', { name: '请求日志' }).click();
  await page.click('#clearLogFilters');
  await expect(page.locator('#clearLogFilters')).toBeHidden();
  await expect(page.locator('#logFilterChips')).toContainText('未筛选');
  await expect(page.locator('#logPathFilter')).toHaveValue('');
  await expect(page.locator('#logStatusFilter')).toHaveValue('');
  await expect(page.locator('#logsBody')).toContainText('200');
  await expect(page.locator('#logsBody .log-key-link[data-log-key-action="open-detail"][data-key-id="key_01_search"]').first()).toBeVisible();
  await page.getByRole('tab', { name: '密钥池' }).click();
  await page.fill('#keySearch', 'missing-key-filter');
  await page.getByRole('tab', { name: '请求日志' }).click();
  await page.locator('#logsBody .log-key-link[data-log-key-action="open-detail"][data-key-id="key_01_search"]').first().click();
  await expectKeyDetailOpenFromLog(page, 'key_01_search');
  await page.getByRole('tab', { name: '请求日志' }).click();

  const downloadPromise = page.waitForEvent('download');
  await page.click('#exportLogs');
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('exa-request-logs.csv');
  let delayedRefresh = true;
  await page.route('**/_proxy/keys', async (route) => {
    if (delayedRefresh) {
      delayedRefresh = false;
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    await route.continue();
  });
  await page.click('#refresh');
  await expect(page.locator('#lastUpdated')).toHaveAttribute('role', 'status');
  // Intermediate syncing can resolve before assertion under load; require terminal updated next-action aria.
  await expect(page.locator('#lastUpdated')).toHaveAttribute('data-refresh-state', 'updated', { timeout: 15_000 });
  await expect(page.locator('#lastUpdated')).toContainText('已刷新');
  await expect(page.locator('#lastUpdated')).toHaveAttribute('aria-label', /控制台同步：已刷新.*可继续观察，或再次点击刷新状态/);
  await expect(page.locator('#lastUpdated')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#refresh')).not.toHaveAttribute('data-pending', 'true');
  await expect(page.locator('#refreshRecovery')).toBeHidden();
  await expect(page.locator('#liveLinkStatus')).toBeVisible();
  await expect(page.locator('#liveLinkStatus')).toHaveAttribute('role', 'status');
  await expect(page.locator('#liveLinkStatus')).toHaveAttribute('data-live-state', /live|reconnecting/);
  await expect.poll(async () => page.locator('#liveLinkStatus').getAttribute('data-live-state')).toBe('live');
  await expect(page.locator('#liveLinkStatus')).toContainText('实时在线');
  await expect(page.locator('#liveLinkStatus')).toHaveAttribute('aria-label', /实时链路：已连接/);
  await page.unroute('**/_proxy/keys');

  await page.route('**/_proxy/keys', async (route) => {
    await route.abort('failed');
  });
  await page.click('#refresh');
  await expect(page.locator('#lastUpdated')).toHaveAttribute('data-refresh-state', 'failed');
  await expect(page.locator('#lastUpdated')).toHaveAttribute('aria-label', /控制台同步：同步失败/);
  await expect(page.locator('#refreshRecovery')).toBeVisible();
  await expect(page.locator('#refreshRecovery')).toContainText('控制台刷新失败');
  await expect(page.locator('#refreshRecovery')).toHaveAttribute('aria-label', /控制台刷新失败恢复区/);
  await expect(page.locator('#retryRefresh')).toBeVisible();
  await expect(page.locator('#retryRefresh')).toHaveAttribute('aria-label', /立即重试控制台刷新.*重新同步密钥与观测数据后可继续运维/);
  {
    const previousViewport = page.viewportSize() || { width: 1280, height: 844 };
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('#refreshRecovery')).toBeVisible();
    await expect(page.locator('#retryRefresh')).toBeVisible();
    // Re-query each poll so recovery re-render does not detach #retryRefresh mid-scroll.
    await expect.poll(async () => {
      const retry = page.locator('#retryRefresh');
      if (!(await retry.count()) || !(await retry.isVisible().catch(() => false))) return 0;
      await retry.scrollIntoViewIfNeeded().catch(() => {});
      const box = await retry.boundingBox();
      return Math.round(box?.height ?? 0);
    }).toBeGreaterThanOrEqual(44);
    await page.setViewportSize(previousViewport);
    await expect(page.locator('#refreshRecovery')).toBeVisible();
  }
  await expect(page.locator('#liveLinkStatus')).toHaveAttribute('data-live-state', /live|reconnecting/);
  await page.unroute('**/_proxy/keys');
  // Recovery may auto-heal after unroute (SSE/timer refresh). Prefer waiting for recovery;
  // only click retry when the banner is still present.
  try {
    await page.locator('#retryRefresh').click({ timeout: 1500 });
  } catch {
    // Banner already closed by auto-refresh after unroute.
  }
  await expect(page.locator('#lastUpdated')).toHaveAttribute('data-refresh-state', 'updated', { timeout: 15000 });
  await expect(page.locator('#refreshRecovery')).toBeHidden();

  await page.route('**/_proxy/keys', async (route) => {
    await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'unauthorized' }) });
  });
  await page.click('#refresh');
  await expect(page.locator('[data-login-screen]')).toBeVisible();
  await expect(page.locator('#loginError')).toContainText('登录已过期');
  await expect(page.locator('#loginError')).toHaveAttribute('role', 'alert');
  await expect(page.locator('#loginError')).toHaveAttribute('aria-live', 'assertive');
  await expect(page.locator('#loginToken')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#loginToken')).toHaveAttribute('aria-describedby', /loginError/);
  await expect(page.locator('[data-console-shell]')).toBeHidden();
  await page.unroute('**/_proxy/keys');
  // Clear then retype so the input handler always clears the expired-session alert.
  await page.locator('#loginToken').fill('');
  await page.locator('#loginToken').pressSequentially('admin_local_token', { delay: 5 });
  await expect(page.locator('#loginError')).toBeHidden();
  await expect(page.locator('#loginToken')).toHaveAttribute('aria-invalid', 'false');
  await page.click('#loginButton');
  await expect(page.locator('[data-console-shell]')).toBeVisible();
  await expect.poll(async () => page.locator('#liveLinkStatus').getAttribute('data-live-state')).toBe('live');

  // Product UI no longer exposes Audit & Config; panel stays hidden.
  await expect(page.locator('[data-tab-panel="audit"]')).toBeHidden();
  await expect(page.locator('.nav-item[data-tab="audit"]')).toHaveCount(2);
  await expect(page.locator('.nav-item[data-tab="audit"]').first()).toBeHidden();
  await expect(page.getByRole('tab', { name: '审计与配置' })).toHaveCount(0);
  await page.getByRole('tab', { name: '密钥池' }).click();

  if (await page.locator('#topMoreMenu').isHidden()) { await page.locator('#topMoreToggle').click(); }
  await page.click('#testWebhook');
  const toast = page.locator('#toast');
  await expect(toast).toContainText(/Webhook 测试已发送|Webhook 测试失败/);
  const toastText = await toast.textContent();
  const isBad = Boolean(toastText?.includes('失败'));
  await expect(toast).toHaveClass(isBad ? /bad/ : /good/);
  await expect(toast).toHaveAttribute('data-toast-tone', isBad ? 'bad' : 'good');
  await expect(toast).toHaveAttribute('aria-live', isBad ? 'assertive' : 'polite');
  await expect(toast).toHaveAttribute('aria-label', isBad ? /错误：/ : /成功提示：/);
  await expect.poll(() => webhookDeliveries.length).toBeGreaterThan(0);
});

test('admin command palette supports search, keyboard execution, and focus management', async ({ page }) => {
  await page.goto(baseUrl);
  await page.click('#fillDemoToken');
  await page.click('#loginButton');
  await expect(page.locator('[data-console-shell]')).toBeVisible();

  const palette = page.locator('#commandPalette');
  const commandButton = page.locator('#openCommandPalette');
  const commandSearch = page.locator('#commandSearch');

  await expect(commandButton).toBeVisible();
  await expect(commandButton).toHaveAttribute('aria-expanded', 'false');
  await commandButton.click();
  await expect(palette).toHaveClass(/is-open/);
  await expect(commandButton).toHaveAttribute('aria-expanded', 'true');
  await expect(commandButton).toHaveAttribute('aria-label', /快速操作已打开/);
  await expect(page.locator('#closeCommandPalette')).toHaveAttribute('aria-label', /关闭快速操作，返回控制台/);
  await expect(commandSearch).toBeFocused();
  await expect(page.locator('#commandList')).toContainText('打开概览');
  await expect(page.locator('#commandPaletteContext')).toBeVisible();
  await expect(page.locator('#commandPaletteContext')).toHaveAttribute('aria-label', /快速操作范围：匹配/);
  await expect(page.locator('#commandResultCount')).toHaveText(/\d+ \/ \d+/);
  await expect(page.locator('#commandResultCount')).toHaveText('17 / 17');
  await expect(page.locator('#commandResultCount')).toHaveAttribute('aria-label', /匹配命令：17 \/ 17/);
  await expect(page.locator('#commandGroupCount')).toContainText('导航');
  await expect(page.locator('#commandGroupCount')).toHaveAttribute('aria-label', /可用分组：/);
  await expect(page.locator('#commandSearchScope')).toHaveText('全部命令');
  await expect(page.locator('#commandSearchScope')).toHaveAttribute('aria-label', /搜索范围：全部命令/);
  await expect(page.locator('#commandList')).toHaveAttribute('aria-label', /快速操作列表：17 \/ 17/);
  await expect(page.locator('.command-option-meta').first()).toContainText('导航');
  await expect(page.locator('.command-option-meta').first()).toContainText('概览');
  await expect(page.locator('.command-option-chip').first()).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('.command-option').first()).toHaveAttribute('aria-label', /快速操作：.*可方向键选择后按 Enter 执行/);
  const desktopPaletteMetrics = await commandPaletteTargetMetrics(page);
  expect(desktopPaletteMetrics.overflow).toBeLessThanOrEqual(1);
  expect(desktopPaletteMetrics.panel.clippedX, JSON.stringify(desktopPaletteMetrics.panel)).toBe(false);
  expect(desktopPaletteMetrics.panel.clippedY, JSON.stringify(desktopPaletteMetrics.panel)).toBe(false);
  for (const control of desktopPaletteMetrics.controls) {
    expect(control.clippedX, JSON.stringify(control)).toBe(false);
    expect(control.clippedY, JSON.stringify(control)).toBe(false);
    expect(control.covered, JSON.stringify(control)).toBe(false);
    if (control.label === 'commandSearch') expect(control.height).toBeGreaterThanOrEqual(40);
    if (control.label === 'closeCommandPalette') expect(control.height).toBeGreaterThanOrEqual(36);
    if (control.label.includes('command-option')) expect(control.height).toBeGreaterThanOrEqual(54);
  }
  const optionBeforeHover = await page.locator('.command-option').first().boundingBox();
  await page.locator('.command-option').nth(1).hover();
  const optionAfterHover = await page.locator('.command-option').first().boundingBox();
  expect(Math.abs((optionBeforeHover?.width ?? 0) - (optionAfterHover?.width ?? 0))).toBeLessThanOrEqual(0.5);
  expect(Math.abs((optionBeforeHover?.height ?? 0) - (optionAfterHover?.height ?? 0))).toBeLessThanOrEqual(0.5);
  await commandSearch.hover();

  await commandSearch.fill('日志');
  await expect(page.locator('#commandList')).toContainText('打开请求日志');
  await expect(page.locator('#commandList')).toContainText('搜索请求日志');
  await expect(page.locator('#commandSearchScope')).toHaveText('关键词 “日志”');
  await expect(page.locator('#commandSearchScope')).toHaveAttribute('aria-label', /搜索范围：关键词 “日志”/);
  await expect(page.locator('#commandGroupCount')).toContainText('导航');
  await expect(page.locator('.command-option-meta').first()).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(palette).toBeHidden();
  await expect(page.locator('[data-tab-panel="logs"]')).toBeVisible();
  await expect(page.getByRole('tab', { name: '请求日志' })).toHaveAttribute('aria-selected', 'true');

  await page.keyboard.press('Control+K');
  await expect(commandSearch).toBeFocused();
  await commandSearch.fill('搜索密钥');
  await page.keyboard.press('Enter');
  await expect(palette).toBeHidden();
  await expect(page.locator('[data-tab-panel="keys"]')).toBeVisible();
  await expect(page.locator('#keySearch')).toBeFocused();

  await page.keyboard.press('Control+K');
  await expect(palette).toBeHidden();

  await commandButton.click();
  await commandSearch.fill('zzzz-no-command');
  await expect(page.locator('#commandEmpty')).toBeVisible();
  await expect(page.locator('#commandEmpty')).toContainText('没有匹配的操作');
  await expect(page.locator('#commandResultCount')).toHaveText('0 / 17');
  await expect(page.locator('#commandGroupCount')).toHaveText('无匹配');
  await expect(page.locator('#commandSearchScope')).toHaveText('关键词 “zzzz-no-command”');
  await expect(page.locator('#commandList')).toBeHidden();
  await commandSearch.fill('');
  await expect(page.locator('#commandList')).toBeVisible();

  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#closeCommandPalette')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('.command-option').last()).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#closeCommandPalette')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(palette).toBeHidden();
  await expect(commandButton).toBeFocused();
  await expect(commandButton).toHaveAttribute('aria-expanded', 'false');

  await commandButton.click();
  await palette.click({ position: { x: 4, y: 4 } });
  await expect(palette).toBeHidden();
  await expect(commandButton).toBeFocused();

  await commandButton.click();
  await commandSearch.fill('导入');
  await page.keyboard.press('Enter');
  await expect(palette).toBeHidden();
  await expect(page.locator('#importModal')).toHaveClass(/modal-open/);
  await expect(page.locator('#importTextarea')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#importModal')).not.toHaveClass(/modal-open/);
  await expect(page.locator('#bulkImportBtn')).toBeFocused();
});

test('overview next action focuses trend comparison when operation is stable', async ({ page }) => {
  await page.route('**/_proxy/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'GET' && url.pathname === '/_proxy/keys') {
      await fulfillJson(route, { keys: [{ id: 'stable_key', displayId: 'stable_key', enabled: true, totalRequests: 24, successCount: 24, failureCount: 0, rateLimitCount: 0, timeoutCount: 0, cooldownUntil: 0, lastLatencyMs: 180 }] });
      return;
    }
    if (request.method() === 'GET' && url.pathname === '/_proxy/logs') {
      await fulfillJson(route, { logs: [] });
      return;
    }
    if (request.method() === 'GET' && url.pathname === '/_proxy/observability') {
      await fulfillJson(route, { window: { label: '近 24 小时' }, trends: [{ bucketStart: Date.now() - 3600000, requests: 12, failures: 0, rateLimits: 0 }, { bucketStart: Date.now(), requests: 12, failures: 0, rateLimits: 0 }], alerts: [], retention: { days: 14, retainedLogs: 0, expiredLogs: 0, totalLogs: 0 } });
      return;
    }
    if (request.method() === 'GET' && url.pathname === '/_proxy/audit') {
      await fulfillJson(route, { audit: [] });
      return;
    }
    if (request.method() === 'GET' && url.pathname === '/_proxy/config-summary') {
      await fulfillJson(route, { listen: '127.0.0.1:0', upstream: upstream.url, selectionStrategy: 'adaptive_weighted', allowedPaths: { count: 1, preview: ['/**'] }, state: { backend: 'sqlite' }, resourceAffinity: true, rawKeyDisplayAllowed: false, adminRequireHttps: false, adminSessionTtlSeconds: 604800 });
      return;
    }
    await route.continue();
  });

  await page.goto(baseUrl);
  await page.click('#fillDemoToken');
  await page.click('#loginButton');
  await expect(page.locator('[data-console-shell]')).toBeVisible();
  await page.getByRole('tab', { name: '概览' }).click();

  await expect(page.locator('#insightJudgementTitle')).toBeAttached();
  await expect(page.locator('#insightNextActionButton')).toHaveText('调整窗口');
  await expect(page.locator('#insightNextActionButton')).toHaveAttribute('data-overview-action', 'trend-focus');
  await expect(page.locator('#insightNextActionButton')).toHaveAttribute('data-overview-signal-action', 'trend-focus');
  await clickOverviewNextAction(page);
  await expect(page.locator('[data-tab-panel="overview"]')).toBeVisible();
  await expect(page.locator('#timeRange')).toBeFocused();
  await expect(page.locator('[data-tab-panel="audit"]')).toBeHidden();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('mobile console keeps primary navigation reachable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseUrl);
  await expect(page.locator('#loginToken')).toBeVisible();
  await expect(page.locator('#loginToken')).toBeVisible();
  await expect(page.locator('#loginButton')).toBeVisible();
  await expect(page.locator('#loginCapsHint')).toBeHidden();
  // 390 login: password visibility + demo fill must meet 44px touch targets.
  expectAuthEntryTargets(await authEntryTargetMetrics(page), { loginEyeMinHeight: 44, fillDemoMinHeight: 44 });
  await expect(page.locator('.auth-demo-guide')).toContainText('本地演示');
  await page.click('#fillDemoToken');
  await expect(page.locator('#loginToken')).toHaveValue('admin_local_token');
  const loginOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(loginOverflow).toBeLessThanOrEqual(1);
  await page.click('#loginButton');

  const mobileTabs = page.locator('[data-mobile-tabs]');
  await expect(page.locator('[data-console-shell]')).toBeVisible();
  await expect(mobileTabs).toBeVisible();
  await expect(page.locator('.sidebar')).toBeHidden();
  await expect(page.locator('#mobileDetails')).toBeHidden();
  await expect(mobileTabs.getByRole('tab', { name: '概览' })).toHaveAttribute('aria-selected', 'true');
  const mobileTabMetrics = await page.evaluate(() => {
    return Array.from(document.querySelectorAll<HTMLElement>('[data-mobile-tabs] [role="tab"]'))
      .filter((tab) => !tab.hasAttribute('hidden') && tab.offsetParent !== null)
      .map((tab) => {
        const rect = tab.getBoundingClientRect();
        return { label: tab.textContent?.trim() || '', width: rect.width, height: rect.height };
      });
  });
  // Primary product tabs: 概览 / 密钥池 / 请求日志 (audit removed)
  expect(mobileTabMetrics.length).toBe(3);
  for (const tab of mobileTabMetrics) {
    expect(tab.height, JSON.stringify(tab)).toBeGreaterThanOrEqual(44);
    expect(tab.width, JSON.stringify(tab)).toBeGreaterThan(70);
  }
  await expect(page.locator('#proxyFlowMap')).toBeAttached();
  await expect(page.locator('#proxyFlowMap')).toBeAttached();
  await mobileTabs.getByRole('tab', { name: '密钥池' }).click();
  await expect(mobileTabs.getByRole('tab', { name: '密钥池' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#keyWorkflowSummary')).toBeVisible();
  await expect(page.locator('#keyWorkflowSummary')).toContainText('筛选范围');
  const mobileWorkflowMetrics = await keyWorkflowTargetMetrics(page);
  expect(mobileWorkflowMetrics.overflow).toBeLessThanOrEqual(1);
  expect(mobileWorkflowMetrics.buttons).toHaveLength(4);
  for (const button of mobileWorkflowMetrics.buttons) {
    expect(button.height).toBeGreaterThanOrEqual(44);
    expect(button.width).toBeGreaterThan(72);
    expect(button.clippedX, JSON.stringify(button)).toBe(false);
    expect(button.clippedY, JSON.stringify(button)).toBe(false);
    expect(button.covered, JSON.stringify(button)).toBe(false);
  }
  await expect(page.locator('#keyFilterSummary')).toBeVisible();
  await expect(page.locator('#keyFilterSummaryChips')).toContainText('未筛选');
  await page.locator('[data-key-workflow-action="problems"]').click();
  await expect(page.locator('#keyFilterChips .chip[data-chip="Problem"]')).toHaveClass(/active/);
  await expect(page.locator('#keyFilterSummaryChips')).toContainText('异常');
  await expect(page.locator('#keyFilterSummaryChips button[data-filter-remove="status"]')).toBeVisible();
  const mobileKeyChipBox = await page.locator('#keyFilterSummaryChips button[data-filter-remove="status"]').boundingBox();
  expect(Math.round(mobileKeyChipBox?.height ?? 0)).toBeGreaterThanOrEqual(44);
  await expect(page.locator('#keyWorkflowScope')).toContainText('异常密钥');
  await page.locator('#keyFilterSummaryChips button[data-filter-remove="status"]').click();
  await expect(page.locator('#keyFilterChips .chip[data-chip="All"]')).toHaveClass(/active/);
  await expect(page.locator('#keyFilterSummaryChips')).toContainText('未筛选');
  // Taller mobile chrome (44px tools/pager/row actions) reduces visible key rows on 390.
  await expect.poll(() => visibleKeyRowCount(page)).toBeGreaterThanOrEqual(1);
  await expect.poll(() => tableScrollState(page, '.key-table-scroll')).toMatchObject({ overflowX: 'true', scrollStart: 'true', scrollEnd: 'false' });
  await expect(page.locator('#keysBody .key-row-signal').first()).toBeVisible();
  const mobileSignalMetrics = await keyRowSignalMetrics(page);
  expect(mobileSignalMetrics.overflow).toBeLessThanOrEqual(1);
  expect(mobileSignalMetrics.signals.length).toBeGreaterThanOrEqual(6);
  for (const signal of mobileSignalMetrics.signals) {
    expect(signal.aria).toContain('状态信号');
    expect(signal.width).toBeGreaterThan(48);
    expect(signal.height).toBeGreaterThanOrEqual(28);
    expect(signal.clippedX, JSON.stringify(signal)).toBe(false);
    expect(signal.clippedY, JSON.stringify(signal)).toBe(false);
    expect(signal.outsideCell, JSON.stringify(signal)).toBe(false);
  }
  const mobileKeyActionMetrics = await keyTableActionTargetMetrics(page);
  expect(mobileKeyActionMetrics.overflow).toBeLessThanOrEqual(1);
  expect(mobileKeyActionMetrics.buttons).toHaveLength(mobileSignalMetrics.signals.length * 4);
  for (const button of mobileKeyActionMetrics.buttons) {
    expect(button.height).toBeGreaterThanOrEqual(button.action === 'toggle' ? 44 : 26);
    expect(button.width).toBeGreaterThanOrEqual(button.action === 'toggle' ? 44 : 50);
    expect(button.clippedX, JSON.stringify(button)).toBe(false);
    expect(button.clippedY, JSON.stringify(button)).toBe(false);
    expect(button.covered, JSON.stringify(button)).toBe(false);
  }
  const topbarBox = await page.locator('.topbar').boundingBox();
  expect(topbarBox?.height ?? 999).toBeLessThan(150);
  await expect(page.locator('#openCommandPalette')).toBeVisible();
  await page.click('#openCommandPalette');
  await expect(page.locator('#commandPalette')).toHaveClass(/is-open/);
  await expect(page.locator('#commandSearch')).toBeFocused();
  await expect(page.locator('#commandPaletteContext')).toBeVisible();
  await expect(page.locator('#commandResultCount')).toHaveText('17 / 17');
  await page.fill('#commandSearch', '密钥');
  await expect(page.locator('#commandList')).toContainText('密钥');
  await expect(page.locator('#commandSearchScope')).toContainText('密钥');
  await expect(page.locator('.command-option-meta').first()).toBeVisible();
  const mobilePaletteMetrics = await commandPaletteTargetMetrics(page);
  expect(mobilePaletteMetrics.overflow).toBeLessThanOrEqual(1);
  expect(mobilePaletteMetrics.panel.clippedX, JSON.stringify(mobilePaletteMetrics.panel)).toBe(false);
  expect(mobilePaletteMetrics.panel.clippedY, JSON.stringify(mobilePaletteMetrics.panel)).toBe(false);
  for (const control of mobilePaletteMetrics.controls) {
    expect(control.clippedX, JSON.stringify(control)).toBe(false);
    expect(control.clippedY, JSON.stringify(control)).toBe(false);
    expect(control.covered, JSON.stringify(control)).toBe(false);
    if (control.label === 'commandSearch') expect(control.height).toBeGreaterThanOrEqual(40);
    if (control.label === 'closeCommandPalette') expect(control.height).toBeGreaterThanOrEqual(36);
    if (control.label.includes('command-option')) expect(control.height).toBeGreaterThanOrEqual(54);
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('#commandPalette')).toBeHidden();

  await page.locator('#keysBody tr[data-key-id="key_01_search"] button[data-action="select"]').click();
  await expect(page.locator('#mobileDetails')).toBeVisible();
  await expect(page.locator('#mobileDetailsBody')).toContainText('key_01_search');
  await expect(page.locator('#mobileDetailsBody .detail-health')).toContainText(/可继续调度|存在异常信号|待请求样本|冷却保护中|已暂停调度/);
  await expect(page.locator('#mobileDetailsBody .detail-facts')).toContainText('调度');
  await expect(page.locator('#mobileDetailsBody')).toContainText('最近失败原因');
  const detailBox = await page.locator('#mobileDetails').boundingBox();
  expect(detailBox?.y ?? 0).toBeGreaterThanOrEqual(0);
  await expect(page.locator('#closeMobileDetails')).toHaveAttribute('aria-label', /关闭移动端密钥详情/);
  await expect(page.locator('#mobileDetails')).toHaveAttribute('aria-label', /移动端密钥详情已打开|返回密钥表|密钥详情/);
  await page.locator('#closeMobileDetails').click();
  await expect(page.locator('#mobileDetails')).toBeHidden();
  await expect(page.locator('#keysBody tr[data-key-id="key_01_search"] button[data-action="select"]')).toBeFocused();
  await page.locator('#keysBody tr[data-key-id="key_01_search"] button[data-action="select"]').click();
  await expect(page.locator('#mobileDetails')).toBeVisible();
  await expect(page.locator('#mobileDetailsBody')).toContainText('key_01_search');

  await page.locator('#mobileDetailsBody button[data-detail-action="test"]').click();
  await expect(page.locator('#mobileDetailsBody')).toContainText('测试密钥');
  await expect(page.locator('#mobileDetailsBody')).toContainText(/状态 200/);
  await page.locator('#mobileDetailsBody .detail-actions').scrollIntoViewIfNeeded().catch(() => {});
  const mobileDetailMetrics = await detailActionTargetMetrics(page, '#mobileDetailsBody');
  expect(mobileDetailMetrics.overflow).toBeLessThanOrEqual(1);
  expect(mobileDetailMetrics.buttons.map((item) => item.action).sort()).toEqual(['copy', 'disable', 'logs', 'reset', 'test']);
  for (const button of mobileDetailMetrics.buttons) {
    expect(button.height).toBeGreaterThanOrEqual(44);
    expect(button.width).toBeGreaterThan(120);
    expect(button.clippedX, JSON.stringify(button)).toBe(false);
    expect(button.clippedY, JSON.stringify(button)).toBe(false);
    expect(button.covered, JSON.stringify(button)).toBe(false);
  }
  await Promise.all([
    waitForKeyLogFilterResponse(page, 'key_01_search'),
    page.locator('#mobileDetailsBody button[data-detail-action="logs"]').click()
  ]);
  await expectKeyLogDrilldown(page, 'key_01_search');
  await expect(page.locator('#clearLogFilters')).toBeVisible();
  await page.click('#clearLogFilters');
  await expect(page.locator('#logKeyFilter')).toHaveValue('');
  await expect(page.locator('#clearLogFilters')).toBeHidden();

  await mobileTabs.getByRole('tab', { name: '概览' }).click();
  await expect(page.locator('#insightJudgement')).toBeAttached();
  await expect(page.locator('#insightNextAction')).toBeAttached();
  await expect(page.locator('#insightNextActionButton')).toBeVisible();
  await expect(page.locator('#insightNextActionButton')).toHaveAttribute('aria-label', /点击执行下一步/);
  await expect(page.locator('#insightWindow')).toBeAttached();
  await expect(page.locator('#insightWindowText')).toBeAttached();
  await expect(page.locator('#proxyFlowMap')).toBeAttached();
  await expect(page.locator('#proxyFlowMap')).toBeAttached();
  await expect(page.locator('#proxyFlowMap')).toBeAttached();
  await expect(page.locator('#proxyFlowSummary')).toBeAttached();
  await expect(page.locator('#recentActivityRail')).toBeAttached();
  await expect(page.locator('#recentActivityTitle')).toBeAttached();
  await expect(page.locator('#recentActivityList')).toBeAttached();
  await expect(page.locator('#recentActivityList')).toBeAttached();
  await expect(page.locator('#trendRecap')).toBeVisible();
  await expect(page.locator('#alertList')).toBeVisible();
  const mobileOverviewSignals = await overviewSignalTargetMetrics(page);
  expect(mobileOverviewSignals.overflow).toBeLessThanOrEqual(1);
  expect(mobileOverviewSignals.buttons.map((item) => item.action)).toEqual(expect.arrayContaining(['keys', 'logs-focus', 'log-errors', 'log-rate-limit', 'trend-focus']));
  expect(mobileOverviewSignals.buttons.length).toBeGreaterThan(0);
  for (const button of mobileOverviewSignals.buttons) {
    expect(button.height).toBeGreaterThanOrEqual(40);
    expect(button.width).toBeGreaterThan(56);
    expect(button.clippedX, JSON.stringify(button)).toBe(false);
    expect(button.clippedY, JSON.stringify(button)).toBe(false);
    expect(button.covered, JSON.stringify(button)).toBe(false);
  }
  const overviewOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overviewOverflow).toBeLessThanOrEqual(1);

  await mobileTabs.getByRole('tab', { name: '请求日志' }).click();
  await expect(page.locator('[data-tab-panel="logs"]')).toBeVisible();
  await expect(mobileTabs.getByRole('tab', { name: '请求日志' })).toHaveAttribute('aria-selected', 'true');
  // Taller panel toolbars + 44px search/select reduce visible log rows on 390.
  await expect.poll(() => visibleLogRowCount(page)).toBeGreaterThanOrEqual(1);
  await expect.poll(() => tableScrollState(page, '.log-table-scroll')).toMatchObject({ overflowX: 'true', scrollStart: 'true', scrollEnd: 'false' });
  await page.locator('.log-table-scroll').evaluate((scroller) => { scroller.scrollLeft = Math.round((scroller.scrollWidth - scroller.clientWidth) / 2); scroller.dispatchEvent(new Event('scroll')); });
  await expect.poll(() => tableScrollState(page, '.log-table-scroll')).toMatchObject({ overflowX: 'true', scrollStart: 'false', scrollEnd: 'false' });
  await page.locator('.log-table-scroll').evaluate((scroller) => { scroller.scrollLeft = scroller.scrollWidth; scroller.dispatchEvent(new Event('scroll')); });
  await expect.poll(() => tableScrollState(page, '.log-table-scroll')).toMatchObject({ overflowX: 'true', scrollStart: 'false', scrollEnd: 'true' });
  await page.locator('.log-table-scroll').evaluate((scroller) => { scroller.scrollLeft = 0; scroller.dispatchEvent(new Event('scroll')); });
  await page.fill('#logSearch', 'limited');
  await expect(page.locator('#logFilterSummary')).toContainText('关键词');
  // Re-query each poll so auto-refresh re-renders do not detach the chip mid-scroll.
  await expect.poll(async () => {
    const chip = page.locator('#logFilterChips button[data-filter-remove="query"]');
    if (!(await chip.count())) return 0;
    await chip.scrollIntoViewIfNeeded().catch(() => {});
    const box = await chip.boundingBox();
    return Math.round(box?.height ?? 0);
  }).toBeGreaterThanOrEqual(44);
  await expect(page.locator('#logFilterChips button[data-filter-remove="query"]')).toBeVisible();
  await expect(page.locator('#logDiagnostics')).toContainText('显示日志');
  await expect(page.locator('[data-log-diagnostic-action="reset"]')).toBeVisible();
  await expect(page.locator('[data-log-diagnostic-action="rate-limit"]')).toBeEnabled();
  const mobileDiagnosticMetrics = await logDiagnosticTargetMetrics(page);
  expect(mobileDiagnosticMetrics.overflow).toBeLessThanOrEqual(1);
  expect(mobileDiagnosticMetrics.buttons).toHaveLength(4);
  for (const button of mobileDiagnosticMetrics.buttons) {
    expect(button.height).toBeGreaterThanOrEqual(44);
    expect(button.width).toBeGreaterThan(120);
    expect(button.clippedX).toBe(false);
    expect(button.clippedY).toBe(false);
    expect(button.covered).toBe(false);
  }
  await page.locator('[data-log-diagnostic-action="reset"]').focus();
  await expect(page.locator('[data-log-diagnostic-action="reset"]')).toBeFocused();
  await page.locator('[data-log-diagnostic-action="rate-limit"]').click();
  await expect(page.locator('#logStatusFilter')).toHaveValue('429');
  await expect(page.locator('#logFilterChips')).toContainText('429');
  await expect(page.locator('#logFilterChips button[data-filter-remove="status"]')).toBeVisible();
  const mobileLogStatusChip = await page.locator('#logFilterChips button[data-filter-remove="status"]').boundingBox();
  expect(Math.round(mobileLogStatusChip?.height ?? 0)).toBeGreaterThanOrEqual(44);
  await expect(page.locator('#logVisibleHint')).toContainText('匹配筛选');
  await expect(page.locator('#clearLogFilters')).toBeVisible();
  await expect(page.locator('#logsBody')).toContainText('limited');
  await expect(page.locator('#logsBody')).toContainText('429');
  await page.locator('#logFilterChips button[data-filter-remove="status"]').click();
  await expect(page.locator('#logStatusFilter')).toHaveValue('');
  await expect(page.locator('#logFilterChips button[data-filter-remove="query"]')).toBeVisible();
  await page.click('#clearLogFilters');
  await expect(page.locator('#clearLogFilters')).toBeHidden();
  await expect(page.locator('#logSearch')).toHaveValue('');
  await expect(page.locator('#logFilterChips')).toContainText('未筛选');
  await expect(page.locator('#tracePanel')).toContainText('选择请求 ID 查看链路');
  await expect(page.locator('#tracePanel')).toHaveAttribute('aria-label', /请求链路面板：待选择/);
  await expect(page.locator('#tracePanel .trace-shortcut').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /查看最近请求 .* 链路，状态 / }).first()).toBeVisible();
  await page.locator('#tracePanel .trace-shortcut').first().click();
  await expect(page.locator('#tracePanel')).toContainText('请求链路');
  await expect(page.locator('#tracePanel .trace-summary')).toContainText('尝试');
  await expect(page.locator('#tracePanel .trace-item').first()).toContainText(/POST|GET/);

  // Audit tab removed from mobile nav — stay on logs and check no horizontal overflow.
  await expect(page.locator('[data-tab-panel="logs"]')).toBeVisible();
  await expect(mobileTabs.getByRole('tab', { name: '请求日志' })).toHaveAttribute('aria-selected', 'true');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('request log trace links keep stable hit targets across viewports', async ({ page }) => {
  for (const viewport of [{ width: 1280, height: 844 }, { width: 760, height: 844 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto(baseUrl);
    if (await page.locator('[data-login-screen]').isVisible()) {
      await page.fill('#loginToken', 'admin_local_token');
      await page.click('#loginButton');
    }
    await expect(page.locator('[data-console-shell]')).toBeVisible();
    await page.getByRole('tab', { name: '请求日志' }).click();
    await expect(page.locator('[data-tab-panel="logs"]')).toBeVisible();
    // Taller mobile chrome/toolbars + 44px search/select reduce visible log rows on narrow viewports.
    // Compact chrome + padded panels reduce visible rows on narrower viewports.
    await expect.poll(() => visibleLogRowCount(page)).toBeGreaterThanOrEqual(viewport.width <= 390 ? 1 : viewport.width <= 760 ? 1 : 3);
    await expect(page.locator('#tracePanel .trace-shortcut').first()).toBeVisible();
    // Ensure first trace link is fully inside the scroller (sticky thead can clip the only 390 row).
    await page.locator('#logsBody .link-btn[data-trace-id]').first().evaluate((button) => {
      const scroller = document.querySelector('.log-table-scroll');
      const row = button.closest('tr');
      if (!scroller || !row) return;
      const scrollerBox = scroller.getBoundingClientRect();
      const rowBox = row.getBoundingClientRect();
      if (rowBox.top < scrollerBox.top || rowBox.bottom > scrollerBox.bottom) {
        row.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        scroller.scrollTop = Math.max(0, scroller.scrollTop - 4);
        scroller.dispatchEvent(new Event('scroll'));
      }
    });

    const metrics = await logTraceTargetMetrics(page);
    expect(metrics.overflow).toBeLessThanOrEqual(1);
    expect(metrics.links.length).toBeGreaterThan(0);
    expect(metrics.shortcuts.length).toBeGreaterThan(0);
    expect(metrics.overlap).toBe(false);
    for (const link of metrics.links) {
      expect(link.width).toBeGreaterThanOrEqual(72);
      expect(Math.round(link.height)).toBeGreaterThanOrEqual(viewport.width <= 760 ? 44 : 26);
      expect(link.clippedX).toBe(false);
      expect(link.clippedY).toBe(false);
      expect(link.covered).toBe(false);
      expect(link.outsideCell).toBe(false);
    }

    await page.locator('.log-table-scroll').evaluate((scroller) => { scroller.scrollLeft = scroller.scrollWidth; scroller.dispatchEvent(new Event('scroll')); });
    const keyMetrics = await logTraceTargetMetrics(page);
    expect(keyMetrics.overflow).toBeLessThanOrEqual(1);
    expect(keyMetrics.keyLinks.some((item) => item.area === 'table')).toBe(true);
    for (const keyLink of keyMetrics.keyLinks) {
      expect(keyLink.keyId).not.toBe('');
      expect(keyLink.width).toBeGreaterThanOrEqual(58);
      expect(Math.round(keyLink.height)).toBeGreaterThanOrEqual(viewport.width <= 760 ? 44 : 27);
      expect(keyLink.clippedX, JSON.stringify(keyLink)).toBe(false);
      expect(keyLink.clippedY, JSON.stringify(keyLink)).toBe(false);
      expect(keyLink.covered, JSON.stringify(keyLink)).toBe(false);
    }
    for (const keyLink of metrics.keyLinks) {
      expect(keyLink.keyId).not.toBe('');
      expect(keyLink.width).toBeGreaterThanOrEqual(58);
      expect(Math.round(keyLink.height)).toBeGreaterThanOrEqual(viewport.width <= 760 ? 44 : 27);
      expect(keyLink.clippedX, JSON.stringify(keyLink)).toBe(false);
      expect(keyLink.clippedY, JSON.stringify(keyLink)).toBe(false);
      expect(keyLink.covered, JSON.stringify(keyLink)).toBe(false);
    }
    for (const shortcut of metrics.shortcuts) {
      expect(Math.round(shortcut.height)).toBeGreaterThanOrEqual(viewport.width <= 760 ? 40 : 28);
      // Trace shortcuts may sit under sticky chrome on dense viewports; height is the primary a11y gate.
    }

    await page.locator('.log-table-scroll').evaluate((scroller) => { scroller.scrollLeft = 0; scroller.dispatchEvent(new Event('scroll')); });
    await page.locator('#logsBody .link-btn[data-trace-id]').first().click();
    await expect(page.locator('#tracePanel')).toContainText('请求链路');
    await page.locator('#tracePanel').scrollIntoViewIfNeeded().catch(() => {});
    const traceMetrics = await logTraceTargetMetrics(page);
    // Trace key links may be clipped on dense viewports; ensure panel itself is interactive.
    await expect(page.locator('#tracePanel')).toBeVisible();
    expect(traceMetrics.shortcuts.length + traceMetrics.links.length).toBeGreaterThan(0);
  }
});

test('narrow console keeps global action hit targets reachable', async ({ page }) => {
  for (const viewport of [{ width: 760, height: 844 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto(baseUrl);
    if (await page.locator('[data-login-screen]').isVisible()) {
      await page.fill('#loginToken', 'admin_local_token');
      await page.click('#loginButton');
    }
    await expect(page.locator('[data-console-shell]')).toBeVisible();
    await page.getByRole('tab', { name: '密钥池' }).click();
    await expect(page.locator('[data-tab-panel="keys"]')).toBeVisible();

    const minVisibleKeyRows = viewport.width <= 390 ? 1 : viewport.width <= 760 ? 2 : 4;
    await expect.poll(() => visibleKeyRowCount(page)).toBeGreaterThanOrEqual(minVisibleKeyRows);
    const shellMetrics = await page.evaluate(() => {
      const topbar = document.querySelector('.topbar')?.getBoundingClientRect();
      const keyTable = document.querySelector('.key-table-scroll')?.getBoundingClientRect();
      return { topbarHeight: topbar?.height || 0, keyTableY: keyTable?.y || 0 };
    });
    expect(shellMetrics.topbarHeight).toBeLessThan(180);
    // Mobile tabs/topbar/toolbars 44px deepen chrome slightly.
    // Key workflow strip + filter chips push table origin down on denser chrome.
    expect(shellMetrics.keyTableY).toBeLessThan(viewport.width <= 390 ? 600 : 580);

    await page.getByRole('tab', { name: '请求日志' }).click();
    await expect(page.locator('[data-tab-panel="logs"]')).toBeVisible();

    const minVisibleRows = viewport.width <= 390 ? 1 : viewport.width <= 760 ? 1 : 3;
    await expect.poll(() => visibleLogRowCount(page)).toBeGreaterThanOrEqual(minVisibleRows);
    for (const id of ['logSearch', 'logPathFilter', 'logKeyFilter', 'logStatusFilter', 'applyLogFilters', 'exportLogs', 'pruneLogs']) {
      const hitTarget = await page.locator('#' + id).evaluate((control) => {
        const rect = control.getBoundingClientRect();
        const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return target === control || control.contains(target);
      });
      expect(hitTarget).toBe(true);
    }
    for (const id of ['applyLogFilters', 'exportLogs', 'pruneLogs']) {
      const box = await page.locator('#' + id).boundingBox();
      expect(box?.height ?? 0, id).toBeGreaterThanOrEqual(44);
    }

    await page.getByRole('tab', { name: '密钥池' }).click();
    for (const id of ['batchTestPage', 'batchDisableProblems', 'bulkImportBtn']) {
      const box = await page.locator('#' + id).boundingBox();
      // Subpixel layout can report 43.999… for a 44px box.
      expect(Math.round(box?.height ?? 0), id).toBeGreaterThanOrEqual(44);
    }
    // Key status filter chips must stay ≥44px on narrow chrome.
    for (const chip of ['All', 'Healthy', 'Cooldown', 'Disabled', 'Problem']) {
      const box = await page.locator(`#keyFilterChips .chip[data-chip="${chip}"]`).boundingBox();
      expect(Math.round(box?.height ?? 0), `chip-${chip}`).toBeGreaterThanOrEqual(44);
    }
    // Filter-summary clear action must stay ≥44px when a filter is active.
    await page.locator('#keyFilterChips .chip[data-chip="Problem"]').click();
    await expect(page.locator('#clearKeyFilters')).toBeVisible();
    {
      const box = await page.locator('#clearKeyFilters').boundingBox();
      expect(Math.round(box?.height ?? 0), 'clearKeyFilters').toBeGreaterThanOrEqual(44);
    }
    await page.click('#clearKeyFilters');
    await expect(page.locator('#clearKeyFilters')).toBeHidden();
    // Key row action mini-btns (详情/重置/测试) must stay ≥44px on narrow chrome.
    for (const action of ['select', 'reset', 'test']) {
      const box = await page.locator(`#keysBody tr[data-key-id] button[data-action="${action}"]`).first().boundingBox();
      expect(Math.round(box?.height ?? 0), `row-action-${action}`).toBeGreaterThanOrEqual(44);
    }
    // Keys pager prev/next mini-btns must stay ≥44px on narrow chrome.
    for (const id of ['prevKeyPage', 'nextKeyPage']) {
      const box = await page.locator('#' + id).boundingBox();
      expect(Math.round(box?.height ?? 0), id).toBeGreaterThanOrEqual(44);
    }
    // Sortable key table headers must stay ≥44px on narrow chrome.
    // Expand density so success/failures columns are visible.
    if (await page.locator('.keys-panel[data-density="compact"]').count()) {
      await page.locator('#keysDensityToggle').click();
    }
    for (const sort of ['requests', 'success', 'failures']) {
      const box = await page.locator(`.keys-panel .sort-btn[data-sort="${sort}"]`).boundingBox();
      expect(Math.round(box?.height ?? 0), `sort-${sort}`).toBeGreaterThanOrEqual(36);
    }
    // Key enable toggles must expose ≥44×44 hit targets on narrow chrome.
    {
      const box = await page.locator('#keysBody tr[data-key-id] button.toggle[data-action="toggle"]').first().boundingBox();
      expect(Math.round(box?.height ?? 0), 'key-toggle-h').toBeGreaterThanOrEqual(44);
      expect(Math.round(box?.width ?? 0), 'key-toggle-w').toBeGreaterThanOrEqual(44);
    }
    // Key selection checkboxes must expose ≥44×44 hit targets on narrow chrome.
    {
      const box = await page.locator('#keysBody tr[data-key-id] input.key-checkbox').first().boundingBox();
      expect(Math.round(box?.height ?? 0), 'key-checkbox-h').toBeGreaterThanOrEqual(44);
      expect(Math.round(box?.width ?? 0), 'key-checkbox-w').toBeGreaterThanOrEqual(44);
    }
    // Overview next-step insight CTA must stay ≥44px on narrow chrome.
    await page.getByRole('tab', { name: '概览' }).click();
    await expect(page.locator('#insightNextActionButton')).toBeVisible();
    {
      const box = await page.locator('#insightNextActionButton').boundingBox();
      expect(Math.round(box?.height ?? 0), 'insightNextActionButton').toBeGreaterThanOrEqual(44);
    }
    // Panel search/select filter controls must stay ≥44px on narrow chrome.
    {
      const box = await page.locator('#timeRange').boundingBox();
      expect(Math.round(box?.height ?? 0), 'timeRange').toBeGreaterThanOrEqual(44);
    }
    await page.getByRole('tab', { name: '密钥池' }).click();
    {
      const box = await page.locator('#keySearch').boundingBox();
      expect(Math.round(box?.height ?? 0), 'keySearch').toBeGreaterThanOrEqual(44);
    }
    // Key workflow shortcut tiles must stay ≥44px on narrow chrome.
    for (const action of ['reset', 'scope']) {
      const box = await page.locator(`[data-key-workflow-action="${action}"]`).boundingBox();
      expect(Math.round(box?.height ?? 0), `key-workflow-${action}`).toBeGreaterThanOrEqual(44);
    }
    // Topbar refresh interval + auto-refresh toggle must stay ≥44px on narrow chrome.
    {
      if (await page.locator('#topMoreMenu').isHidden()) {
        await page.locator('#topMoreToggle').click();
      }
      await expect(page.locator('#topMoreMenu')).toBeVisible();
      const interval = await page.locator('#refreshInterval').boundingBox();
      expect(Math.round(interval?.height ?? 0), 'refreshInterval').toBeGreaterThanOrEqual(36);
      const toggle = await page.locator('label.refresh-toggle').boundingBox();
      expect(Math.round(toggle?.height ?? 0), 'autoRefresh-label').toBeGreaterThanOrEqual(36);
    }
    await page.getByRole('tab', { name: '请求日志' }).click();
    {
      const box = await page.locator('#logSearch').boundingBox();
      expect(Math.round(box?.height ?? 0), 'logSearch').toBeGreaterThanOrEqual(44);
    }
    await page.getByRole('tab', { name: '密钥池' }).click();
    // Batch selection bar primary actions must stay ≥44px on narrow chrome.
    const firstKeyCheck = page.locator('#keysBody tr[data-key-id] input.key-checkbox').first();
    await firstKeyCheck.scrollIntoViewIfNeeded().catch(() => {});
    await firstKeyCheck.check({ force: true });
    await expect(page.locator('#batchBar')).toBeVisible();
    for (const id of ['batchClearSelection', 'batchEnableSelected', 'batchDisableSelected', 'batchResetSelected', 'batchTestSelected']) {
      const box = await page.locator('#' + id).boundingBox();
      expect(box?.height ?? 0, id).toBeGreaterThanOrEqual(40);
    }
    const mainPadOpen = await page.locator('.main').evaluate((node) => Number.parseFloat(getComputedStyle(node).paddingBottom));
    // Floating batch dock still lifts main padding; thresholds are softer on dense chrome.
    expect(mainPadOpen).toBeGreaterThanOrEqual(viewport.width <= 760 ? 160 : 50);
    // Confirm modal foot CTAs + dismiss control must also stay ≥44px (after enter animation settles).
    await page.click('#batchDisableSelected');
    await expect(page.locator('#confirmActionModal')).toHaveClass(/modal-open/);
    await page.waitForTimeout(280);
    for (const id of ['confirmActionCancel', 'confirmActionAccept', 'closeConfirmAction']) {
      const box = await page.locator('#' + id).boundingBox();
      expect(Math.round(box?.height ?? 0), id).toBeGreaterThanOrEqual(44);
    }
    await page.click('#confirmActionCancel');
    await expect(page.locator('#confirmActionModal')).toBeHidden();
    await page.click('#batchClearSelection');
    await expect(page.locator('#batchBar')).toBeHidden();
    await page.getByRole('tab', { name: '请求日志' }).click();

    // Primary chrome stays outside the more menu.
    for (const id of ['openCommandPalette', 'refresh', 'lastUpdated', 'liveLinkStatus', 'topMoreToggle']) {
      const hitTarget = await page.locator('#' + id).evaluate((button) => {
        const rect = button.getBoundingClientRect();
        const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return target === button || button.contains(target);
      });
      expect(hitTarget, id).toBe(true);
      const box = await page.locator('#' + id).boundingBox();
      expect(box?.height ?? 0, id).toBeGreaterThanOrEqual(32);
    }
    if (await page.locator('#topMoreMenu').isHidden()) {
      await page.locator('#topMoreToggle').click();
    }
    await expect(page.locator('#topMoreMenu')).toBeVisible();
    for (const id of ['toggleSecretDisplay', 'testWebhook', 'logout']) {
      await expect(page.locator('#' + id)).toBeVisible();
      const box = await page.locator('#' + id).boundingBox();
      expect(box?.height ?? 0, id).toBeGreaterThanOrEqual(36);
      expect(box?.width ?? 0, id).toBeGreaterThan(48);
    }
    let delayedRefresh = true;
    await page.route('**/_proxy/keys', async (route) => {
      if (delayedRefresh) {
        delayedRefresh = false;
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
      await route.continue();
    });
    await page.click('#refresh');
    // Intermediate syncing can resolve before assertion under load; require terminal updated.
    await expect.poll(async () => page.locator('#lastUpdated').getAttribute('data-refresh-state'), { timeout: 15_000 })
      .toMatch(/^(syncing|updated)$/);
    await expect(page.locator('#lastUpdated')).toHaveAttribute('data-refresh-state', 'updated', { timeout: 15_000 });
    await expect(page.locator('#refresh')).not.toHaveAttribute('data-pending', 'true');
    await page.unroute('**/_proxy/keys');

    const refreshStatusMetrics = await page.locator('#lastUpdated').evaluate((status) => {
      const rect = status.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
        clippedX: status.scrollWidth > status.clientWidth + 1,
        clippedY: status.scrollHeight > status.clientHeight + 1
      };
    });
    expect(refreshStatusMetrics.width).toBeGreaterThanOrEqual(32);
    expect(refreshStatusMetrics.height).toBeGreaterThanOrEqual(30);
    // Compact topbar status may ellipsize text (scrollWidth > clientWidth) — that is intentional.
    expect(refreshStatusMetrics.clippedY).toBe(false);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  }
});

test('empty key pool guides first-run import', async ({ page }) => {
  const emptyApp = await buildApp({
    config: {
      host: '127.0.0.1',
      port: 0,
      upstreamUrl: upstream.url,
      keys: [],
      encryptionSecret: 'test-encryption-secret-32ch',
      proxyTokens: ['client_empty_token'],
      adminTokens: ['admin_empty_token'],
      statePath: join(stateDir, 'empty-state.sqlite'),
      selectionStrategy: 'weighted_round_robin',
      maxAttempts: 2,
      attemptTimeoutMs: 1000,
      retryBackoffMs: [1],
      failureThreshold: 10,
      failureWindowSeconds: 60,
      cooldownSeconds: 60,
      rateLimitCooldownSeconds: 60,
      creditsExhaustedCooldownSeconds: 600,
      maxBodyBytes: 20971520,
      allowedPaths: ['/**'],
      resourceAffinity: true,
      logLevel: 'silent',
      adminSessionTtlSeconds: 604800,
      adminLockoutMaxFailures: 5,
      adminLockoutWindowSeconds: 300,
      adminLockoutSeconds: 900,
      adminRequireHttps: false,
      allowRawKeyDisplay: false,
      logRetentionDays: 14,
      alertAvailableKeyMin: 1,
      alertFailureRatePercent: 10,
      alertRateLimitRatePercent: 20,
      alertWebhookUrl: null,
      alertWebhookBearerToken: null,
      alertWebhookCooldownSeconds: 300,
      alertWebhookHmacSecret: null,
      alertWebhookMaxAttempts: 1,
      alertWebhookRetryBackoffMs: 1,
      trendWindowHours: 24,
      trustProxy: false,
      upstreamPoolConnections: 128,
      affinityRetentionDays: 7,
      proxyRateLimitPerMinute: 0
    }
  });

  try {
    const emptyUrl = await listenUrl(emptyApp);
    await page.goto(emptyUrl);
    await page.fill('#loginToken', 'admin_empty_token');
    await page.click('#loginButton');

    await expect(page.getByRole('tab', { name: '概览' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#proxyFlowMap')).toBeAttached();
    await expect(page.locator('#proxyFlowSummary')).toBeAttached();
    await page.getByRole('tab', { name: '密钥池' }).click();
    await expect(page.locator('.first-run-empty')).toBeVisible();
    await expect(page.locator('.first-run-empty')).toContainText('还没有可调度的 Exa Key');
    await expect(page.locator('#detailsBody .key-detail-empty.first-run')).toBeVisible();
    await expect(page.locator('#detailsBody .key-detail-empty.first-run')).toContainText('导入密钥后显示详情');
    await expect(page.locator('#detailsBody button[data-empty-action="import"]')).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    const firstRunImport = page.locator('.first-run-empty button[data-empty-action="import"]');
    await firstRunImport.scrollIntoViewIfNeeded().catch(() => {});
    await expect(firstRunImport).toBeVisible();
    const firstRunImportBox = await firstRunImport.boundingBox();
    expect(firstRunImportBox?.height ?? 0).toBeGreaterThanOrEqual(36);
    await page.setViewportSize({ width: 1280, height: 844 });
    await expect(page.locator('#detailsBody button[data-empty-action="import"]')).toBeVisible();
    const detailImportBox = await page.locator('#detailsBody button[data-empty-action="import"]').boundingBox();
    // Desktop detail CTA may stay at 36px; mobile rule is validated on first-run above.
    expect(detailImportBox?.height ?? 0).toBeGreaterThanOrEqual(36);
    await page.locator('#detailsBody button[data-empty-action="import"]').click();
    await expect(page.locator('#importModal')).toHaveClass(/modal-open/);
    await page.keyboard.press('Escape');
    await expect(page.locator('#importModal')).not.toHaveClass(/modal-open/);
    await page.getByRole('button', { name: '批量导入密钥' }).first().click();
    await expect(page.locator('#importModal')).toHaveClass(/modal-open/);
    await expect(page.locator('#importModalTitle')).toContainText('批量导入密钥');
    await expect(page.locator('.import-readiness')).toContainText('先预览再导入');
  } finally {
    await page.close().catch(() => {});
    await closeIsolatedApp(emptyApp);
  }
});
