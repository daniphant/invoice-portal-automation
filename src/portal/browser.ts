import { mkdir } from 'fs/promises';
import { join } from 'path';
import { Browser, Locator, Page, chromium } from 'playwright';
import { CONFIG } from '../config';

type ErrorCode =
  | 'LOGIN_FAILED'
  | 'NAVIGATION_FAILED'
  | 'DUPLICATE_DETECTED'
  | 'INVOICE_NOT_FOUND'
  | 'SUBMISSION_FAILED';

interface InvoiceRequest {
  hours: string;
  description: string;
  dryRun: boolean;
}

interface ExecutionResult {
  dryRun: boolean;
}

export class BrowserFlowError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BrowserFlowError';
  }
}

const ROUTES = {
  home: '/dashboard',
  records: '/invoices',
  createRecord: '/invoices/create',
  login: '/login',
} as const;

const LABELS = {
  authEmail: ['Email', 'address'].join(' '),
  authPassword: 'Password',
  authSubmit: ['Sign', 'in'].join(' '),
  entryHours: ['Worked', 'Hours'].join(' '),
  entryRate: ['Rate', '(R$)'].join(' '),
  entryNotes: 'Describe the service provided...',
  recordsHeading: 'Invoices',
  createHeading: ['Create', 'Invoice'].join(' '),
  editHeading: ['Edit', 'Invoice'].join(' '),
} as const;

const ACTION_MATCHERS = {
  create: /Create Invoice/i,
  save: /Save Invoice/i,
} as const;

export class PortalBrowser {
  private browser?: Browser;
  private page?: Page;

  async launch(): Promise<void> {
    this.browser = await chromium.launch({
      headless: CONFIG.headless,
    });

    this.page = await this.browser.newPage();
    this.page.setDefaultNavigationTimeout(CONFIG.navigationTimeoutMs);
    this.page.setDefaultTimeout(CONFIG.actionTimeoutMs);
  }

  hasPage(): boolean {
    return Boolean(this.page);
  }

  getCurrentUrl(): string | undefined {
    return this.page?.url();
  }

  async login(): Promise<void> {
    const page = this.getPage();

    await page.goto(this.buildUrl(ROUTES.login), {
      waitUntil: 'domcontentloaded',
    });

    try {
      await page.getByRole('textbox', { name: LABELS.authEmail }).fill(CONFIG.portal.email);
      await page.getByRole('textbox', { name: LABELS.authPassword }).fill(CONFIG.portal.password);

      await Promise.all([
        page.waitForURL(`**${ROUTES.home}`),
        page.getByRole('button', { name: LABELS.authSubmit }).click(),
      ]);
    } catch (error) {
      throw new BrowserFlowError(
        'LOGIN_FAILED',
        error instanceof Error ? error.message : 'Unable to sign in to the target portal.',
      );
    }
  }

  async ensureNoDuplicateInvoice(request: InvoiceRequest): Promise<void> {
    const page = this.getPage();
    await page.goto(this.buildUrl(ROUTES.records), {
      waitUntil: 'domcontentloaded',
    });

    await page.getByRole('heading', { name: LABELS.recordsHeading }).waitFor();

    const rows = page.locator('table tbody tr');
    const rowCount = await rows.count();
    const today = this.formatTodayForUi();

    for (let index = 0; index < rowCount; index += 1) {
      const row = rows.nth(index);
      const text = (await row.textContent())?.replace(/\s+/g, ' ').trim() || '';

      if (!text.includes(today)) {
        break;
      }

      const hoursMatch = text.match(/(\d{2}:\d{2}) Hours/i);
      if (hoursMatch?.[1] !== request.hours) {
        continue;
      }

      const recordUrl = await this.openRecordFromRow(row);
      const duplicate = await this.invoiceMatches(request);

      if (duplicate) {
        throw new BrowserFlowError(
          'DUPLICATE_DETECTED',
          `Found an existing record for ${today} with the same hours and description at ${recordUrl}.`,
        );
      }

      await page.goto(this.buildUrl(ROUTES.records), {
        waitUntil: 'domcontentloaded',
      });
    }
  }

  async createInvoice(request: InvoiceRequest): Promise<ExecutionResult> {
    const page = this.getPage();
    await page.goto(this.buildUrl(ROUTES.createRecord), {
      waitUntil: 'domcontentloaded',
    });

    try {
      await page.getByRole('heading', { name: LABELS.createHeading }).waitFor();
      await page.getByRole('textbox', { name: LABELS.entryRate }).waitFor();

      await page.getByRole('textbox', { name: LABELS.entryHours }).fill(request.hours);
      await page.getByRole('textbox', { name: LABELS.entryNotes }).fill(request.description);

      if (request.dryRun) {
        return { dryRun: true };
      }

      await page.getByRole('button', { name: ACTION_MATCHERS.create }).click();

      await Promise.race([
        page.waitForURL(/\/invoices\/view\//),
        page.waitForURL(`**${ROUTES.records}`),
        page.waitForSelector(`text=${LABELS.editHeading}`),
      ]);

      return { dryRun: false };
    } catch (error) {
      throw new BrowserFlowError(
        'SUBMISSION_FAILED',
        error instanceof Error ? error.message : 'Unable to create a record in the target portal.',
      );
    }
  }

  async editInvoice(request: InvoiceRequest): Promise<ExecutionResult> {
    const page = this.getPage();
    const recordUrl = await this.openInvoiceForToday();

    try {
      await page.getByRole('heading', { name: LABELS.editHeading }).waitFor();
      await page.getByRole('textbox', { name: LABELS.entryHours }).fill(request.hours);
      await page.getByRole('textbox', { name: LABELS.entryNotes }).fill(request.description);

      if (request.dryRun) {
        return { dryRun: true };
      }

      await page.getByRole('button', { name: ACTION_MATCHERS.save }).click();

      await Promise.race([
        page.waitForURL(recordUrl),
        page.waitForSelector(`text=${LABELS.editHeading}`),
      ]);

      return { dryRun: false };
    } catch (error) {
      throw new BrowserFlowError(
        'SUBMISSION_FAILED',
        error instanceof Error ? error.message : 'Unable to update a record in the target portal.',
      );
    }
  }

  async captureFinalScreenshot(state: 'dry-run' | 'failure' | 'success'): Promise<string | undefined> {
    if (!this.page) {
      return undefined;
    }

    await mkdir(CONFIG.artifactsDir, { recursive: true });
    const fileName = `invoice-${state}-${this.timestampForFileName()}.png`;
    const outputPath = join(CONFIG.artifactsDir, fileName);

    await this.page.screenshot({
      fullPage: true,
      path: outputPath,
      scale: 'css',
      type: 'png',
    });

    return outputPath;
  }

  async close(): Promise<void> {
    await this.browser?.close();
  }

  private async openRecordFromRow(row: Locator): Promise<string> {
    const page = this.getPage();
    const viewLink = row.locator('a[href*="/invoices/view/"]').first();
    const href = await viewLink.getAttribute('href');

    if (!href) {
      throw new BrowserFlowError('NAVIGATION_FAILED', 'Unable to locate detail link for an existing record.');
    }

    await Promise.all([
      page.waitForURL(/\/invoices\/view\//),
      viewLink.click(),
    ]);

    return this.buildUrl(href);
  }

  private async openInvoiceForToday(): Promise<string> {
    const page = this.getPage();
    await page.goto(this.buildUrl(ROUTES.records), {
      waitUntil: 'domcontentloaded',
    });

    await page.getByRole('heading', { name: LABELS.recordsHeading }).waitFor();

    const rows = page.locator('table tbody tr');
    const rowCount = await rows.count();
    const today = this.formatTodayForUi();

    for (let index = 0; index < rowCount; index += 1) {
      const row = rows.nth(index);
      const text = (await row.textContent())?.replace(/\s+/g, ' ').trim() || '';

      if (!text.includes(today)) {
        break;
      }

      return this.openRecordFromRow(row);
    }

    throw new BrowserFlowError('INVOICE_NOT_FOUND', `No record found for ${today} to edit.`);
  }

  private async invoiceMatches(request: InvoiceRequest): Promise<boolean> {
    const page = this.getPage();

    const description = await page.getByRole('textbox', { name: LABELS.entryNotes }).inputValue();
    const hours = await page.getByRole('textbox', { name: LABELS.entryHours }).inputValue();

    return this.normalizeText(description) === this.normalizeText(request.description)
      && this.normalizeText(hours) === this.normalizeText(request.hours);
  }

  private buildUrl(pathname: string): string {
    return new URL(pathname, CONFIG.portal.baseUrl).toString();
  }

  private formatTodayForUi(): string {
    return new Intl.DateTimeFormat('en-US', {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date());
  }

  private getPage(): Page {
    if (!this.page) {
      throw new BrowserFlowError('NAVIGATION_FAILED', 'Browser page is not initialized.');
    }

    return this.page;
  }

  private normalizeText(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
  }

  private timestampForFileName(): string {
    return new Date().toISOString().replace(/[:.]/g, '-');
  }
}

if (require.main === module) {
  (async () => {
    const browser = new PortalBrowser();
    await browser.launch();
    await browser.login();
    await browser.captureFinalScreenshot('success');
    await browser.close();
  })();
}
