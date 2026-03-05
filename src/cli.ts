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

export type CliOptions = {
  hours?: string;
  description?: string;
  dryRun?: boolean;
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
  const firstPositional = argv
    .slice(2)
    .find((argument, index, allArguments) => {
      if (argument.startsWith('--')) {
        return false;
      }

      const previousArgument = allArguments[index - 1];
      return previousArgument !== '--hours' && previousArgument !== '--description';
    });

  const mode = firstPositional;
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

export const parseCliOptions = (argv: string[]): CliOptions => {
  const options: CliOptions = {};
  const args = argv.slice(2).filter((argument) => argument !== 'create' && argument !== 'edit');

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (argument === '--hours' || argument === '--description') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) {
        throw new ExecutorError('INVALID_INPUT', `Missing value for ${argument}.`);
      }

      if (argument === '--hours') {
        options.hours = value;
      } else {
        options.description = value;
      }

      index += 1;
      continue;
    }

    throw new ExecutorError('INVALID_INPUT', `Unknown argument: ${argument}`);
  }

  return options;
};

export const resolveRequestPayload = (
  cliOptions: CliOptions,
  stdinPayload?: InvoiceRequest,
): InvoiceRequest => {
  const payload: Partial<InvoiceRequest> = stdinPayload && typeof stdinPayload === 'object'
    ? { ...stdinPayload }
    : {};

  if (cliOptions.hours !== undefined) {
    payload.hours = cliOptions.hours;
  }

  if (cliOptions.description !== undefined) {
    payload.description = cliOptions.description;
  }

  if (cliOptions.dryRun !== undefined) {
    payload.dryRun = cliOptions.dryRun;
  }

  if (Object.keys(payload).length === 0) {
    throw new ExecutorError(
      'INVALID_INPUT',
      'Provide invoice input through JSON stdin or --hours/--description flags.',
    );
  }

  return payload as InvoiceRequest;
};
