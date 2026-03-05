export type ErrorCode =
  | 'INVALID_INPUT'
  | 'LOGIN_FAILED'
  | 'NAVIGATION_FAILED'
  | 'DUPLICATE_DETECTED'
  | 'INVOICE_NOT_FOUND'
  | 'SUBMISSION_FAILED'
  | 'UNEXPECTED_ERROR';

export type ExecutionMode = 'create' | 'edit';

export type InvoiceRequest = {
  hours: number | string;
  description: string;
  dryRun?: boolean;
};

export type NormalizedInvoiceRequest = {
  hours: string;
  description: string;
  dryRun: boolean;
};

export class ExecutorError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ExecutorError';
  }
}

export const formatDecimalHours = (raw: number): string => {
  if (!Number.isFinite(raw) || raw <= 0) {
    throw new ExecutorError('INVALID_INPUT', 'Hours must be a positive number.');
  }

  const totalMinutes = Math.round(raw * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

export const normalizeHours = (raw: number | string): string => {
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
};

export const normalizeRequest = (payload: InvoiceRequest): NormalizedInvoiceRequest => {
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
};

export const resolveMode = (argv: string[]): ExecutionMode => {
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
};
