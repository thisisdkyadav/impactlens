# API reference

Base URL: `http://127.0.0.1:4000/api`. The Vite development server proxies `/api` and `/media` to this address.

## Authentication and request protection

`POST /auth/login` accepts `{ "email": "...", "password": "..." }`. A successful response sets an HTTP-only, SameSite=Strict session cookie and returns `{ user, csrf }`. Sessions last 12 hours. Session tokens are random and only their SHA-256 hashes are stored in SQLite; passwords use salted scrypt hashes.

Every state-changing authenticated request must include `X-CSRF-Token: <csrf>` and the session cookie. Browser write origins must match `APP_ORIGIN`; the loopback production URL is also allowed in demo mode. `GET /auth/me` retrieves the user and CSRF token; `POST /auth/logout` revokes the session.

Only `/health` and `/auth/login` are public. `/media/*` requires the same authenticated session. API rate limiting allows 240 requests/minute/IP, and login allows 20 attempts/15 minutes/IP. For deployments behind a proxy, configure trusted proxy behavior according to the specific proxy and preserve the actual client IP; do not blindly trust arbitrary forwarded headers.

## Routes

| Method | Path                      | Access         | Purpose                                                    |
| ------ | ------------------------- | -------------- | ---------------------------------------------------------- |
| GET    | `/health`                 | Public         | Service liveness                                           |
| POST   | `/auth/login`             | Public         | Establish session                                          |
| GET    | `/auth/me`                | Member         | Current user / CSRF token                                  |
| POST   | `/auth/logout`            | Member         | Revoke session                                             |
| GET    | `/settings`               | Member         | Nonsecret configuration / capability flags                 |
| GET    | `/dashboard`              | Member         | Totals, monthly evidence, projects, recent records         |
| GET    | `/projects`               | Member         | Projects and evidence counts                               |
| POST   | `/projects`               | Editor/admin   | Create project                                             |
| GET    | `/assets`                 | Member         | Search and filter evidence                                 |
| POST   | `/assets`                 | Editor/admin   | Multipart media upload                                     |
| GET    | `/assets/:id`             | Member         | Analysis, context, original identity, history, derivatives |
| PATCH  | `/assets/:id/review`      | Reviewer/admin | Approve/reject/reopen with a required note                 |
| POST   | `/assets/:id/reanalyze`   | Editor/admin   | Reset review and queue analysis                            |
| POST   | `/assets/:id/derivatives` | Editor/admin   | Campaign variant from approved evidence                    |
| GET    | `/jobs`                   | Member         | Latest 100 processing jobs                                 |
| GET    | `/comparisons`            | Member         | Saved evidence pairs / analysis                            |
| POST   | `/comparisons`            | Editor/admin   | Validate and analyze a chronological pair                  |
| GET    | `/reports`                | Member         | Report snapshots                                           |
| POST   | `/reports`                | Reviewer/admin | Create draft from approved evidence                        |
| GET    | `/reports/:id/pdf`        | Member         | Visual PDF download                                        |
| POST   | `/reports/:id/publish`    | Reviewer/admin | Mark valid real-evidence report published internally       |
| GET    | `/export`                 | Member         | CSV or JSON evidence export                                |
| GET    | `/audit`                  | Member         | Latest 200 events and full chain verification              |
| GET    | `/users`                  | Admin          | Workspace members without password hashes                  |
| POST   | `/users`                  | Admin          | Create editor/reviewer account                             |

## Project creation

```json
{
  "name": "Riverbank restoration",
  "description": "Document the restoration of the northern riverbank.",
  "location": "Delhi, India",
  "category": "Water & ecosystems"
}
```

Returns the persisted project with a UUID. Names require 3–100 characters; purpose requires 10–2,000 characters.

## Upload

`POST /assets` uses multipart form data:

| Field        | Type        | Validation                                              |
| ------------ | ----------- | ------------------------------------------------------- |
| `file`       | Binary      | JPEG/PNG/WebP/MP4/WebM; matching magic bytes; max 25 MB |
| `projectId`  | UUID        | Existing project                                        |
| `title`      | String      | 3–160 trimmed characters                                |
| `capturedAt` | Date string | Real calendar date, YYYY-MM-DD; no future dates         |
| `location`   | String      | 2–200 trimmed characters                                |
| `phase`      | Enum        | `before`, `during`, `after`                             |
| `notes`      | String      | Optional; max 3,000 characters                          |
| `consent`    | String      | Must be `true`                                          |

One API request contains one file; the browser sequences batch uploads. A SHA-256 duplicate in the same project returns 409 with `existingId`. Successful upload returns 201 with the queued record. Source identity is computed from the original upload bytes before storage or transformation.

## Evidence search

`GET /assets?project=<uuid>&kind=image&review=approved&phase=after&from=2026-01-01&to=2026-09-30&q=river&mode=keyword&page=1`

All parameters are optional. Each page contains up to 24 records. Date filters refer to capture dates, not upload dates. `kind` is `image|video`; `review` is `pending|approved|rejected`; `mode` is `keyword|semantic`.

```json
{
  "assets": [],
  "total": 0,
  "page": 1,
  "pages": 1,
  "searchMode": "keyword"
}
```

With live credentials and semantic mode, the query is embedded and hybrid-ranked. Provider failure returns keyword results with `searchMode: keyword-fallback`; no key produces ordinary keyword results. The score is a ranking number, not calibrated evidence confidence. Vectors produced with a different embedding model are excluded from similarity scoring; reanalyze after model changes.

## Review

```json
{
  "review": "approved",
  "note": "Original source and field context reviewed; seasonal differences remain."
}
```

Only ready records can be reviewed. The note is required (5–2,000 trimmed characters). Reanalysis immediately clears approval and the old review note; previous decisions remain in audit history.

## Comparison

```json
{ "beforeId": "<baseline-uuid>", "afterId": "<followup-uuid>" }
```

The two ready records must be different, belong to one project, and have strictly increasing capture dates. Results include `summary`, `changes`, `limitations`, `comparable`, `provider` and source UUIDs. No live AI / demo media produces a manual-inspection pair without fabricated changes. Video AI comparison requires Cloudinary frame extraction.

## Campaign variant

```json
{ "preset": "square" }
```

Presets: `square` (1080×1080), `story` (1080×1920), `landscape` (1600×900). The source must be approved. Each derivative returns its own UUID, URL, exact transformation parameters and original `asset_id`. Local image output is a JPEG; live output uses Cloudinary delivery transformations. Derivatives remain presentation assets and are not inserted as original evidence.

## Report generation

```json
{
  "projectId": "<project-uuid>",
  "title": "Riverbank restoration · field report",
  "assetIds": ["<evidence-uuid>"],
  "metrics": [
    {
      "label": "Collected waste",
      "value": 120,
      "unit": "kg",
      "evidenceId": "<evidence-uuid>",
      "method": "Field scale record checked against the collection log."
    }
  ]
}
```

Choose 1–100 approved, ready assets from the chosen project. Metrics are optional (maximum 20). Numeric values must be finite and nonnegative; measurement method requires at least 10 characters. Every metric must cite a selected real evidence record; illustrative demo records cannot support measurements.

The returned draft stores a snapshot of project context, source evidence, qualitative analysis, associated saved comparisons, reviewer measurements, disclaimers and the audit-chain head at generation. `E-<first-eight-UUID-characters>` references are human-readable labels; the full UUID and original hash remain in each evidence record.

PDF exports include visual previews when accessible, metadata, review notes, links to original source assets, original hashes, comparison observations, measurement methods and limitations. PDF generation still works when a remote preview is unavailable.

Publishing is an internal workflow state. It requires that the current source records remain approved and ready and rejects any demo media. No external message, public page, or permission change occurs.

## Team member creation

```json
{
  "name": "Field reviewer",
  "email": "reviewer@example.org",
  "password": "a-unique-password-at-least-12-characters",
  "role": "reviewer"
}
```

Only an administrator can create a member. New accounts are `editor` or `reviewer`; administrator accounts are bootstrapped on first database initialization. Creation does not send an email invitation.

## Errors

Errors return `{ "error": "Readable explanation" }`:

- **400** invalid input, malformed chronology, upload size/type, invalid capture date.
- **401** no session, expired session, invalid credentials.
- **403** role, origin or CSRF restriction.
- **404** unknown record or route.
- **409** duplicate media, unfinished processing, unapproved campaign source.
- **415** media bytes do not match the declared supported type.
- **422** report evidence/measurement restrictions or unsupported video operation.
- **429** API/login rate limit.
- **502** synchronous AI service failure during comparison; background failures appear on the processing job.
- **500** unexpected server failure; detailed service message is retained in server logs without returning server secrets.
