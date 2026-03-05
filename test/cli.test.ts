import { describe, expect, it } from 'vitest';
import {
  ExecutorError,
  formatDecimalHours,
  normalizeHours,
  normalizeRequest,
  parseCliOptions,
  resolveRequestPayload,
  resolveMode,
} from '../src/cli';

describe('formatDecimalHours', () => {
  it('formats whole hours into HH:MM', () => {
    expect(formatDecimalHours(8)).toBe('08:00');
  });

  it('formats decimal hours into HH:MM', () => {
    expect(formatDecimalHours(8.5)).toBe('08:30');
  });

  it('rejects non-positive values', () => {
    expect(() => formatDecimalHours(0)).toThrowError(ExecutorError);
  });
});

describe('normalizeHours', () => {
  it('accepts numeric strings', () => {
    expect(normalizeHours('8')).toBe('08:00');
  });

  it('accepts HH:MM strings', () => {
    expect(normalizeHours('8:15')).toBe('08:15');
  });

  it('rejects invalid minute values', () => {
    expect(() => normalizeHours('8:60')).toThrowError(ExecutorError);
  });
});

describe('normalizeRequest', () => {
  it('normalizes the payload for execution', () => {
    expect(normalizeRequest({
      hours: '8',
      description: '  Confirmed work item  ',
      dryRun: true,
    })).toEqual({
      hours: '08:00',
      description: 'Confirmed work item',
      dryRun: true,
    });
  });

  it('rejects a missing description', () => {
    expect(() => normalizeRequest({
      hours: '8',
      description: '   ',
    })).toThrowError(ExecutorError);
  });
});

describe('resolveMode', () => {
  it('defaults to create mode', () => {
    expect(resolveMode(['node', 'dist/index.js'])).toBe('create');
  });

  it('accepts edit mode', () => {
    expect(resolveMode(['node', 'dist/index.js', 'edit'])).toBe('edit');
  });

  it('rejects unknown modes', () => {
    expect(() => resolveMode(['node', 'dist/index.js', 'unknown'])).toThrowError(ExecutorError);
  });
});

describe('parseCliOptions', () => {
  it('parses human-friendly flags', () => {
    expect(parseCliOptions([
      'node',
      'dist/index.js',
      '--hours',
      '8.5',
      '--description',
      'Human entry',
      '--dry-run',
    ])).toEqual({
      hours: '8.5',
      description: 'Human entry',
      dryRun: true,
    });
  });

  it('ignores the positional execution mode', () => {
    expect(parseCliOptions([
      'node',
      'dist/index.js',
      'edit',
      '--hours',
      '8',
      '--description',
      'Updated entry',
    ])).toEqual({
      hours: '8',
      description: 'Updated entry',
    });
  });

  it('rejects a missing flag value', () => {
    expect(() => parseCliOptions([
      'node',
      'dist/index.js',
      '--hours',
    ])).toThrowError(ExecutorError);
  });
});

describe('resolveRequestPayload', () => {
  it('accepts stdin-only payloads', () => {
    expect(resolveRequestPayload({}, {
      hours: '8',
      description: 'stdin payload',
    })).toEqual({
      hours: '8',
      description: 'stdin payload',
    });
  });

  it('accepts cli-only payloads', () => {
    expect(resolveRequestPayload({
      hours: '8',
      description: 'cli payload',
      dryRun: true,
    })).toEqual({
      hours: '8',
      description: 'cli payload',
      dryRun: true,
    });
  });

  it('lets cli flags override stdin values', () => {
    expect(resolveRequestPayload({
      description: 'cli payload',
    }, {
      hours: '8',
      description: 'stdin payload',
      dryRun: false,
    })).toEqual({
      hours: '8',
      description: 'cli payload',
      dryRun: false,
    });
  });

  it('rejects missing input from both sources', () => {
    expect(() => resolveRequestPayload({})).toThrowError(ExecutorError);
  });
});
