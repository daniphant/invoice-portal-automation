# Invoice Portal Automation

Headless Playwright executor for creating or editing invoice entries in a private web portal.

This repository is intentionally narrow:

- OpenClaw handles scheduling, ClickUp API lookups, Telegram messaging, and user confirmation.
- This repository accepts normalized invoice input, runs the browser flow, and returns structured JSON on `stdout`.

## Requirements

- Node.js 20+
- npm
- Valid ClickUp API and portal credentials in `.env`

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from `.env.example` and fill in the ClickUp and portal credentials:

```bash
CLICKUP_API_TOKEN=your_clickup_api_token
CLICKUP_TEAM_ID=your_clickup_team_id
CLICKUP_USER_ID=your_clickup_user_id

PORTAL_EMAIL=user@example.com
PORTAL_PASSWORD=supersecret
PORTAL_BASE_URL=https://example.com/

HEADLESS=true
LOG_LEVEL=info
ARTIFACTS_DIR=./artifacts
ACTION_TIMEOUT_MS=10000
NAVIGATION_TIMEOUT_MS=30000
```

## OpenClaw

OpenClaw should treat this repository as an executor, not as the orchestration layer.

OpenClaw is expected to:

- query ClickUp through the API,
- use the ClickUp My Work API to collect the user’s active items,
- summarize relevant work,
- ask the user on Telegram whether to create or edit,
- confirm the final hours and description,
- invoke this repository with the final payload.

### Preferred invocation

OpenClaw should use JSON on `stdin`:

```bash
echo '{"hours":8,"description":"Confirmed invoice text","dryRun":false}' | npm run invoice
```

For edit mode:

```bash
echo '{"hours":8,"description":"Adjusted invoice text","dryRun":false}' | npm run invoice:edit
```

## Humans

Humans can use either JSON `stdin` or direct CLI flags.

### Human-friendly CLI flags

Create a new invoice entry for today:

```bash
npm run invoice -- --hours 8 --description "Confirmed invoice text"
```

Edit today’s existing invoice entry:

```bash
npm run invoice:edit -- --hours 8 --description "Adjusted invoice text"
```

Preview the browser flow without submitting:

```bash
npm run invoice -- --hours 8 --description "Preview only" --dry-run
```

### JSON input still works

```bash
echo '{"hours":8,"description":"Confirmed invoice text"}' | npm run invoice
```

### Input precedence

If both JSON `stdin` and CLI flags are provided, the executor merges them and CLI flags win. This lets a human or agent start from a JSON payload and override only one field at the command line.

## Input Shape

The normalized request shape is:

```json
{
  "hours": 8,
  "description": "Confirmed invoice text",
  "dryRun": false
}
```

`dryRun` is optional. When `true`, the browser flow stops before the final create or save click, but still captures a final screenshot.

## Output

The executor prints a single JSON object to `stdout`.

Success example:

```json
{
  "ok": true,
  "mode": "create",
  "dryRun": false,
  "hours": "08:00",
  "description": "Confirmed invoice text",
  "submittedAt": "2026-03-05T18:00:00.000Z",
  "screenshotPath": "artifacts/invoice-success-2026-03-05T18-00-00-000Z.png",
  "currentUrl": "https://example.com/invoices/view/..."
}
```

Failure example:

```json
{
  "ok": false,
  "errorCode": "INVOICE_NOT_FOUND",
  "message": "No record found for 3/5/2026 to edit.",
  "screenshotPath": "artifacts/invoice-failure-2026-03-05T18-00-00-000Z.png",
  "currentUrl": "https://example.com/invoices"
}
```

## Error Codes

- `INVALID_INPUT`
- `LOGIN_FAILED`
- `NAVIGATION_FAILED`
- `DUPLICATE_DETECTED`
- `INVOICE_NOT_FOUND`
- `SUBMISSION_FAILED`

## Tests

Run the unit test suite:

```bash
npm test
```

Build the executor:

```bash
npm run build
```

## OpenClaw Skills

Example OpenClaw skills live in:

- `skills/openclaw-create-invoice`
- `skills/openclaw-edit-invoice`

These show how an agent can gather ClickUp context, confirm with the user on Telegram, and invoke this executor in create or edit mode.
