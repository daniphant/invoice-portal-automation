import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../.env') });

const requiredVars = ['PORTAL_EMAIL', 'PORTAL_PASSWORD'];
const missing = requiredVars.filter((variableName) => !process.env[variableName]);

if (missing.length > 0) {
  console.error(`Missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}

export const CONFIG = {
  portal: {
    email: process.env.PORTAL_EMAIL!,
    password: process.env.PORTAL_PASSWORD!,
    baseUrl: process.env.PORTAL_BASE_URL || 'https://example.com/',
  },
  headless: process.env.HEADLESS !== 'false',
  logLevel: process.env.LOG_LEVEL || 'info',
  artifactsDir: resolve(__dirname, '..', process.env.ARTIFACTS_DIR || 'artifacts'),
  actionTimeoutMs: Number(process.env.ACTION_TIMEOUT_MS || '10000'),
  navigationTimeoutMs: Number(process.env.NAVIGATION_TIMEOUT_MS || '30000'),
} as const;
