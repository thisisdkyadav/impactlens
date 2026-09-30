# Validation record

Validated locally on Windows with Node.js 24.19.0 on 30 September 2026.

## Automated results

- Production build: passed, including TypeScript checking.
- Integration tests: **28 passed, 0 failed**.
- Source formatting check: passed.
- Installed dependency audit after upgrading Sharp: **0 known vulnerabilities** reported by npm.
- Real PDF generation: checked PDF signature and embedded image objects.
- Real local campaign image: decoded output and checked 1080 × 1080 dimensions.
- Concurrent duplicate uploads: checked one successful source, one conflict, and temporary-file cleanup.

## Chrome UI checks

- Administrator sign-in and authenticated workspace loading.
- Evidence library and project filtering.
- Original evidence detail, provider labels, limits and review notes.
- Approval of two explicitly illustrative demo records.
- Draft report creation from those approved records, visual preview and evidence citations.
- Chronological baseline/follow-up selection and saved manual comparison.
- Desktop dashboard and phone-width responsive layout; no horizontal page overflow at the tested phone width.

The local demo workspace retains the two reviewed demo records, one illustrative draft report and one saved manual comparison as examples of the verified UI workflow. The source distribution does not include workspace data or credentials.

## Verification boundaries

Cloudinary and OpenAI credentials were not supplied. Live Cloudinary upload, external transformations and billable vision/embedding calls were not run against real accounts. OpenAI request shapes and failure/retry behavior were verified with mocked responses. The app runs in clearly labeled local demo mode and switches to configured live integrations when credentials are added.

Docker and the GitHub Actions workflow are supplied but were not executed in this Windows validation run. Reports publish internally; public hosting is not performed.
