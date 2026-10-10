# Notification Design

Uses the existing, already-provisioned `/usr/local/bin/nexus-alert <type> "<message>"` client (Unix-socket delivery to the existing Discord alert service). This project does **not** create, modify, or restart that service, and never handles the webhook URL directly.

`nexus-alert` accepts exactly these types (enforced by the script itself):

| Type | Trigger |
|---|---|
| `owner_action` | A gate needs an owner decision: credential/connection, hiring approval, host-level action NEXUS cannot take. |
| `security` | A security/privacy boundary issue: unexpected secret exposure path, failed isolation test, suspicious dependency. |
| `quota` | AI provider quota/rate limit exhausted after bounded retries. |
| `blocked` | A worker is stalled / CI or review has failed repeatedly (2+ equivalent attempts) with no path forward without a decision. |
| `milestone` | A workstream (P0–P8 phase, or bootstrap gate B0–B5) completes. |
| `ready` | Release candidate is tagged and packaged — `READY FOR ARGUS/OWNER ADAPTER REVIEW`. |

Rules:

- Event-driven only — alerts fire from actual state transitions (CI result, review verdict, hire approval, quota error), never from a timed polling loop.
- One message per event; de-duplicate repeats of the same event.
- Never include secrets, tokens, or full prompts — short human summary + project/repo + Paperclip issue link only.
- `nexus-alert milestone "..."` was verified working end-to-end in NEX-2 (owner confirmed Discord delivery).
