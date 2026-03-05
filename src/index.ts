import { BrowserFlowError, PortalBrowser } from './portal/browser';

type ErrorCode =
  | 'INVALID_INPUT'
  | 'LOGIN_FAILED'
  | 'NAVIGATION_FAILED'
  | 'DUPLICATE_DETECTED'
  | 'INVOICE_NOT_FOUND'
  | 'SUBMISSION_FAILED'
  | 'UNEXPECTED_ERROR';

type ExecutionMode = 'create' | 'edit';

interface InvoiceRequest {
  hours: number | string;
  description: string;
  dryRun?: boolean;
}

interface NormalizedInvoiceRequest {
  hours: string;
  description: string;
  dryRun: boolean;
}

interface SuccessResult {
  ok: true;
  mode: ExecutionMode;
  dryRun: boolean;
  hours: string;
  description: string;
  submittedAt: string;
  screenshotPath?: string;
  currentUrl?: string;
}

interface FailureResult {
  ok: false;
  errorCode: ErrorCode;
  message: string;
  screenshotPath?: string;
  currentUrl?: string;
}

class ExecutorError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ExecutorError';
  }
}

function formatDecimalHours(raw: number): string {
  if (!Number.isFinite(raw) || raw <= 0) {
    throw new ExecutorError('INVALID_INPUT', 'Hours must be a positive number.');
  }

  const totalMinutes = Math.round(raw * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function normalizeHours(raw: number | string): string {
  if (typeof raw === 'number') {
    return formatDecimalHours(raw);
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    throw new ExecutorError('INVALID_INPUT', 'Hours are required.');
  }

  const hhmmMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmmMatch) {
    const hours = Number(hhmmMatch[1]);
    const minutes = Number(hhmmMatch[2]);

    if (minutes >= 60 || hours < 0 || (hours === 0 && minutes === 0)) {
      throw new ExecutorError('INVALID_INPUT', 'Hours must be greater than zero.');
    }

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  const numericHours = Number(trimmed);
  if (!Number.isNaN(numericHours)) {
    return formatDecimalHours(numericHours);
  }

  throw new ExecutorError(
    'INVALID_INPUT',
    'Hours must be a number like 8 or 8.5, or a string like 08:30.',
  );
}

function normalizeRequest(payload: InvoiceRequest): NormalizedInvoiceRequest {
  if (!payload || typeof payload !== 'object') {
    throw new ExecutorError('INVALID_INPUT', 'Input must be a JSON object.');
  }

  if (typeof payload.description !== 'string' || !payload.description.trim()) {
    throw new ExecutorError('INVALID_INPUT', 'Description is required.');
  }

  return {
    hours: normalizeHours(payload.hours),
    description: payload.description.trim(),
    dryRun: payload.dryRun === true,
  };
}

function resolveMode(argv: string[]): ExecutionMode {
  const mode = argv[2];
  if (!mode || mode === 'create') {
    return 'create';
  }

  if (mode === 'edit') {
    return 'edit';
  }

  throw new ExecutorError(
    'INVALID_INPUT',
    'Unknown execution mode. Use the default create mode or pass "edit".',
  );
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString('utf8').trim();
}

async function main() {
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
}

main();
