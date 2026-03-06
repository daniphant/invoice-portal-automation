---
name: openclaw-create-invoice
description: Use this skill when OpenClaw should create a new invoice entry by summarizing current ClickUp work through the ClickUp API, confirming hours and description with the user on Telegram, and invoking this repository in create mode.
---

# OpenClaw Create Invoice

Use this skill when the agent should create a new invoice entry for the current day.

## Workflow

1. Query the ClickUp My Work API for the user’s relevant in-progress work.
2. Draft a concise Telegram message that:
   - says it is time to emit the invoice,
   - lists the most relevant in-progress tasks,
   - proposes a default hour count and description,
   - invites the user to approve or rewrite the description.
3. Wait for explicit confirmation from the user.
4. Build the executor payload:

```json
{
  "hours": 8,
  "description": "Confirmed description",
  "dryRun": false
}
```

5. Run:

```bash
echo '{"hours":8,"description":"Confirmed description","dryRun":false}' | npm run invoice
```

6. Parse the JSON result from stdout and send a follow-up Telegram message with:
   - success or failure,
   - the final description,
   - the screenshot path when present.

## Rules

- Never invent task details when the ClickUp API returned no relevant tasks.
- If the user edits the description or hours, use the user’s wording verbatim unless they ask for help rewriting it.
- Prefer `dryRun: true` only when the user asks for validation without submission.
- Treat non-zero exit results as authoritative and relay the returned `errorCode`.
