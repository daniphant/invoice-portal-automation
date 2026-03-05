import {
  type ErrorCode,
  type ExecutionMode,
  type InvoiceRequest,
  ExecutorError,
  normalizeRequest,
  resolveMode,
} from './cli';
import { BrowserFlowError, PortalBrowser } from './portal/browser';

type SuccessResult = {
  ok: true;
  mode: ExecutionMode;
  dryRun: boolean;
  hours: string;
  description: string;
  submittedAt: string;
  screenshotPath?: string;
  currentUrl?: string;
};

type FailureResult = {
  ok: false;
  errorCode: ErrorCode;
  message: string;
  screenshotPath?: string;
  currentUrl?: string;
};

const readStdin = async (): Promise<string> => {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString('utf8').trim();
};

const main = async () => {
  const browser = new PortalBrowser();
  let screenshotPath: string | undefined;
  let currentUrl: string | undefined;

  try {
    const mode = resolveMode(process.argv);
    const input = await readStdin();
    if (!input) {
      throw new ExecutorError('INVALID_INPUT', 'Expected JSON payload on stdin.');
    }

    const request = normalizeRequest(JSON.parse(input) as InvoiceRequest);

    await browser.launch();
    await browser.login();
    const success = mode === 'edit'
      ? await browser.editInvoice(request)
      : await (async () => {
          await browser.ensureNoDuplicateInvoice(request);
          return browser.createInvoice(request);
        })();

    screenshotPath = await browser.captureFinalScreenshot(success.dryRun ? 'dry-run' : 'success');
    currentUrl = browser.getCurrentUrl();

    const result: SuccessResult = {
      ok: true,
      mode,
      dryRun: success.dryRun,
      hours: request.hours,
      description: request.description,
      submittedAt: new Date().toISOString(),
      screenshotPath,
      currentUrl,
    };

    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = 0;
    return;
  } catch (error) {
    if (browser.hasPage()) {
      screenshotPath = await browser.captureFinalScreenshot('failure');
      currentUrl = browser.getCurrentUrl();
    }

    const failure: FailureResult = error instanceof ExecutorError || error instanceof BrowserFlowError
      ? {
          ok: false,
          errorCode: error.code,
          message: error.message,
          screenshotPath,
          currentUrl,
        }
      : {
          ok: false,
          errorCode: 'UNEXPECTED_ERROR',
          message: error instanceof Error ? error.message : 'Unexpected executor failure.',
          screenshotPath,
          currentUrl,
        };

    process.stdout.write(`${JSON.stringify(failure)}\n`);
    process.exitCode = 1;
    return;
  } finally {
    await browser.close();
  }
};

main();
