---
name: openclaw-edit-invoice
description: Use this skill when OpenClaw should revise an existing invoice entry for today by confirming replacement hours and description with the user on Telegram and invoking this repository in edit mode.
---

# OpenClaw Edit Invoice

Use this skill when the agent should update today’s existing invoice entry.

## Workflow

1. Ask the user whether the existing invoice should be edited instead of creating a new one.
2. Confirm the replacement hour count and replacement description.
3. Build the executor payload:

```json
{
  "hours": 8,
  "description": "Updated description",
  "dryRun": false
}
```

4. Run:

```bash
echo '{"hours":8,"description":"Updated description","dryRun":false}' | npm run invoice:edit
```

5. Parse stdout JSON and report the outcome back to Telegram.

## Rules

- This mode edits the invoice for the current day only.
- If the executor returns `INVOICE_NOT_FOUND`, tell the user there is no invoice for today to update and offer create mode instead.
- Prefer `dryRun: true` when the user wants to preview the update flow without saving.
- Treat the executor response as the source of truth for success, failure, and screenshot location.
