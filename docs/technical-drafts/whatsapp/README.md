# WhatsApp technical drafts

These files are archived implementation drafts from the WhatsApp scheduling/webhook exploration.

They are intentionally kept outside the active backend source tree because some snippets were written as generic examples and do not match the current Prisma schema exactly.

Current production-aligned code lives in:
- `backend/backend/src/legacy/whatsapp.js`
- `backend/backend/src/comms/whatsapp/`
- `backend/backend/tests/whatsapp.test.js`

Before promoting anything from this folder into runtime code, compare field names with `backend/backend/schema.prisma` and run backend tests.
