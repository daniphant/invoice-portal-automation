# Invoice Portal Automation

## Goal

This repository is a narrow executor for invoice creation and invoice editing inside a private web portal.

OpenClaw owns the schedule, ClickUp API access, Telegram conversation, and confirmation flow. This repository only receives confirmed invoice input, opens the portal in Playwright headless mode, and performs the requested browser action.

## Ownership Boundary

### OpenClaw owns

- Schedule and reminders
- ClickUp task lookup through the API
- Telegram conversation and confirmation
- Choosing whether to create or edit
- Sending the final JSON payload to this executor

### This repository owns

- Loading portal credentials from `.env`
- Logging into the portal with Playwright
- Creating a new invoice entry
- Editing the existing invoice entry for today
- Duplicate checks before create
- Returning machine-readable JSON
- Saving a final screenshot on success, failure, and dry-run

## Runtime Contract

The executor reads JSON from `stdin`.

```json
{
  "hours": 8,
  "description": "Invoice description confirmed by the user",
  "dryRun": false
}
```

The same payload shape is used in both modes:

- `npm run invoice` creates a new invoice entry for today.
- `npm run invoice:edit` updates the existing invoice entry for today.

`dryRun` is optional. When `true`, the executor logs in, validates navigation, fills the form, captures the final screenshot, and stops before the final submit/save click.

### Invocation examples

```bash
echo '{"hours":8,"description":"Confirmed invoice text"}' | npm run invoice
```

```bash
echo '{"hours":8,"description":"Adjusted invoice text","dryRun":true}' | npm run invoice:edit
```

## Output Contract

The executor prints a single JSON object to `stdout`.

### Success

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

### Failure

```json
{
  "ok": false,
  "errorCode": "INVOICE_NOT_FOUND",
  "message": "No record found for 3/5/2026 to edit.",
  "screenshotPath": "artifacts/invoice-failure-2026-03-05T18-00-00-000Z.png",
  "currentUrl": "https://example.com/invoices"
}
```

Expected error codes:

- `INVALID_INPUT`
- `LOGIN_FAILED`
- `NAVIGATION_FAILED`
- `DUPLICATE_DETECTED`
- `INVOICE_NOT_FOUND`
- `SUBMISSION_FAILED`

## Environment Variables

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

## Implementation Notes

- The executor currently targets one known private portal and relies on stable role-and-label based Playwright locators.
- Selector names in the code are intentionally generic and grouped behind neutral constants.
- The edit mode assumes the current payload has no explicit date field, so it edits the existing invoice for the current day only.
- This repository does not expose or document vendor-specific details beyond what is required to run locally.

## OpenClaw Flow

1. OpenClaw runs on its own schedule.
2. OpenClaw queries the ClickUp My Work API for active or in-progress tasks.
3. OpenClaw asks the user on Telegram whether to create or edit today’s invoice and lets the user adjust the description or hours.
4. OpenClaw pipes the final JSON payload into the appropriate command in this repository.
5. This repository runs the browser flow and returns structured JSON for OpenClaw to relay back.
