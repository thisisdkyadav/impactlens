# ImpactLens

An end-to-end implementation of **PS 02 · Cloudinary: AI-Powered Impact & Sustainability Media Platform**.

ImpactLens connects field photos and videos to projects, capture dates, places, observable changes, human review decisions, and source-backed reports. The application is a working React interface and Express API with persistent SQLite storage—not a static dashboard.

## Run it

Requires **Node.js 24+** and npm. Source lives at `C:\Users\DK YADAV\code\Codex\impactlens`.

```powershell
cd 'C:\Users\DK YADAV\code\Codex\impactlens'
Copy-Item .env.example .env
npm ci
npm run dev
```

Open **http://127.0.0.1:5173**. Use `127.0.0.1` consistently rather than mixing it with `localhost`.

Demo administrator:

```text
Email:    admin@impactlens.local
Password: ImpactLens!2026
```

For the built application:

```powershell
npm run build
npm start
```

Open **http://127.0.0.1:4000**. Demo mode accepts both the configured development origin and this local production origin. For a live installation set `APP_ORIGIN` to its exact public URL.

No service credentials are required for the local demo. It seeds three projects and nine clearly labeled stock-image records. You can create projects, upload your own media, review records, make local image crops, compare evidence manually, create reports, export PDFs/CSV/JSON, and add team members. Data persists across restarts in `data/impactlens.sqlite` and `data/uploads/`.

## What is implemented

| Problem-statement goal                     | Working implementation                                                                                                                                                            |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Analyze and organize photos and videos     | Image/video upload; Cloudinary storage; background vision analysis; tags, activities, signals, uncertainty, project suggestions; durable job queue                                |
| Organize by project, location and timeline | Projects, uploader-supplied capture date/location/phase, chronological library and capture-month dashboard; combined filters                                                      |
| Compare before and after                   | Same-project, chronological pair validation; draggable image split; side-by-side video playback; qualitative AI comparison; saved observations linked to originals                |
| Generate reports and campaign content      | Approved-evidence report builder; cited source snapshots; reviewer-supplied measurements; visual PDF with source links; publish gate; square/story/landscape campaign derivatives |
| AI metadata and semantic discovery         | Structured vision response validation, text embeddings over visual descriptions and metadata, cosine similarity combined with keywords, keyword fallback, pagination              |
| Trace original assets and transformations  | Original upload SHA-256, Cloudinary public ID / asset ID / version, original delivery URL, derivative transformation records, review history, hash-linked audit chain             |
| Complete product                           | Authentication, editor/reviewer/admin roles, persistence, validation, failure handling, exports, responsive UI, integration tests, Docker configuration and documentation         |

## Use the full workflow

1. **Create a project.** Give it a purpose, focus area and field location.
2. **Upload evidence.** Choose JPEG, PNG, WebP, MP4 or WebM; enter a capture date, location, project phase and field notes; confirm permission. Batch uploads run sequentially, up to 20 files, 25 MB each. File content signatures are checked. Exact duplicate bytes in one project are rejected.
3. **Watch processing.** Jobs move from queued to running to completed, or retry with backoff. The final failure appears in Activity. Three total attempts are allowed. Interrupted running jobs are recovered at startup.
4. **Inspect the record.** Open its original source and analysis. The UI distinguishes live vision AI, metadata-only results, and illustrative demo records. Reviewers add a note and approve, reject, or reopen the evidence.
5. **Search.** Combine project, media type, phase, review and capture-date filters. Keyword search works without credentials. With live AI configured, select AI semantic search and press Search; results combine embedding similarity and keyword matching. Semantic API requests are explicit, not triggered on every polling refresh.
6. **Compare change.** Select a baseline and a later record from the same project. Inspect alignment with the image slider or video playback. Analyze and save the pair. AI reports observable differences and limits; it does not invent impact measurements.
7. **Prepare campaign assets.** Open an approved uploaded asset, select Campaign studio and create a square, story or landscape variant. Cloudinary applies live transformations; local images use Sharp. Transformation parameters and source references are recorded.
8. **Create a report.** Select approved evidence from one project. Optionally enter measurements, units, a method and a supporting real evidence record. Save a draft, read the visual report, inspect its citations and download the PDF.
9. **Publish internally.** A reviewer can mark a report published only if all included evidence remains approved and no illustrative demo assets are included. Publishing changes workspace status; it does not create a public URL or send the report to anyone.
10. **Export or audit.** Download CSV/JSON evidence datasets or inspect the audit trail and chain verification.

## Enable real Cloudinary and AI

### Cloudinary

Create a Cloudinary account / product environment and obtain the cloud name, API key and API secret from its console. Put them in the server `.env`:

```dotenv
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

Restart the server. New uploads use the Cloudinary Node SDK with `resource_type: auto`, a unique project/asset public ID, tags and project context. The secret stays server-side. Cloudinary receives the original media and returns the delivery URL, asset identity, version and dimensions; videos also return duration. Optimized thumbnails and sampled video frames are generated through Cloudinary transformations.

Existing local/demo records are not silently migrated. Upload new real media to exercise the Cloudinary path. The configured status means credentials are present, not that account access has been independently checked.

The current live uploader uses standard public Cloudinary delivery URLs. Upload only media approved for this delivery model. For confidential deployments, implement authenticated Cloudinary delivery with short-lived signed URLs, access control and the corresponding server-side vision/PDF fetch path before using sensitive field media.

### Vision and semantic search

```dotenv
OPENAI_API_KEY=your_api_key
OPENAI_VISION_MODEL=gpt-4.1-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

The model names are configurable defaults, not a claim about the latest models. Use a vision-capable Chat Completions model supporting JSON mode, and an embeddings model supporting the requested 512 dimensions. Model access depends on your account.

Images are normalized before local vision analysis. Cloudinary videos supply frames near 0%, 50% and 90% of the duration. This is a sampled-frame analysis; it does not process every frame, audio, or speech.

The vision response is validated with Zod. It includes `summary`, `tags`, `activities`, `signals`, `uncertainty`, `suggestedProject`, and subjective `confidence`. Embeddings index the resulting descriptions plus metadata. These are text embeddings of visual descriptions, not direct multimodal image embeddings. Embedding failure preserves the successful vision result and enables keyword search; reanalysis can rebuild the index.

Without the key, analysis honestly reports that vision was not performed and indexes uploader metadata. It never fabricates a visual analysis. Demo records remain illustrative even when a key is present.

### Switch to live mode

```dotenv
DEMO_MODE=false
ADMIN_EMAIL=you@example.org
ADMIN_PASSWORD=a_unique_long_password
APP_ORIGIN=http://127.0.0.1:4000
```

Cloudinary credentials and a custom administrator password are required in live mode. For HTTPS set `SECURE_COOKIES=true` and configure the exact HTTPS `APP_ORIGIN`.

The administrator is created only on first initialization. Changing `ADMIN_PASSWORD` later does not overwrite an existing account. For a fresh live installation use a new empty `DATA_DIR`, or migrate users explicitly. Seeded demo records in an existing database remain labeled demo and cannot support published reports. Back up existing data before any migration.

## Architecture

```text
React + TypeScript + Vite
   │ same-origin API, HTTP-only session + CSRF
   ▼
Express API ── role checks ── validation ── SQLite
   │                                      │
   ├── upload SHA-256 / exact dedup         ├── projects / assets / reviews
   ├── Cloudinary SDK or local disk         ├── durable processing jobs
   ├── Cloudinary / Sharp derivatives      ├── comparison / report snapshots
   └── visual PDF / CSV / JSON export      └── transformations / audit chain
                  │
             Job worker
                  ├── image normalization / video frame URLs
                  ├── OpenAI vision → validated visual metadata
                  └── text embeddings → hybrid search
```

The implementation is a **single shared workspace**, with three roles. Editors collect media and create comparisons / campaign variants. Reviewers approve evidence and create or publish reports. Administrators perform both and create team accounts. Multi-organization isolation is not implemented.

The worker is an intentionally simple single-process durable queue. It is appropriate for a local demonstration or small single-instance deployment. See [the architecture document](docs/ARCHITECTURE.md) for scaling decisions and extension points.

## Verification

```powershell
npm run check
npm audit
```

The integration suite exercises authentication and logout, CSRF/origin checks, role permissions, uploads and magic bytes, authenticated media MIME, invalid dates and missing consent, SHA-256 deduplication, background processing, review decisions, keyword filtering and exports, actual image derivatives, comparison chronology/project validation, report source snapshots, PDF bytes, manual metrics, demo publication restrictions, stale approvals, queue recovery, retry exhaustion and append-only audit integrity.

AI request contracts and rate-limit failures are mocked in the automated suite. They incur no API costs and are not live provider verification. Real Cloudinary upload and billable OpenAI calls require your credentials and should be tested with an approved small photo and video after configuration.

## Deploy a single instance

Use a persistent disk; this application is not compatible with an ephemeral serverless filesystem. Build and serve the SPA from Express, expose it through HTTPS, and preserve both the SQLite file and original local files.

```powershell
docker compose up --build -d
```

The supplied container binds its API to `0.0.0.0`, but Compose publishes it to the host loopback address. Use a reverse proxy when exposing it remotely. The named volume persists `/app/data`. Do not commit `.env` or user media. Docker was supplied as a deployment option; local validation uses Node directly.

Back up SQLite using a consistent SQLite backup procedure or stop the application before copying `data/`; copy local media together with the database. A running WAL database should not be backed up by copying only the main `.sqlite` file. Run one application instance against this volume. Do not mount the same database into multiple workers.

## Evidence integrity and practical limits

- A file hash establishes byte identity, not whether the image is authentic or the event happened at the stated site. Human approval is a review decision, not forensic verification.
- Location, capture date and consent are uploader assertions. The AI does not infer exact location or verify field measurements.
- Visual differences do not prove causation, carbon reduction, acreage, biodiversity, or tree counts. Quantitative report values are explicitly supplied by reviewers with a stated measurement method and evidence reference.
- The audit is append-only at the application/database-trigger level and hash-linked. A database administrator can replace the database or drop triggers. Independent tamper evidence requires externally anchoring the chain head or using immutable external logs.
- Video analysis samples three frames. Local demo video uploads support storage and playback; Cloudinary is required for automatic video frames and live video derivatives.
- Original Cloudinary URLs are public in this version. Local media require an authenticated workspace session.
- Local thumbnails currently serve the original image; live Cloudinary thumbnails are optimized. Large datasets should add precomputed local thumbnails and background indexing.
- Semantic ranking scans stored vectors in memory. Move vectors to a dedicated index and move jobs to a distributed queue for large deployments.
- There is no email invitation, password-reset flow, offline upload queue, multilingual OCR pipeline, public report sharing, automatic GPS verification or calibrated impact estimation. These are future production extensions, not features claimed by this implementation.

## Project files

```text
src/               React app, pages, forms, styles, typed API client
server/config.js   Environment configuration and live-mode guards
server/db.js       SQLite schema, sessions, password hashing, audit chain
server/seed.js     Clearly labeled demo projects and illustrative stock media
server/media.js    Cloudinary uploads, video frames, local crops, derivatives
server/ai.js       Vision, embeddings, schema validation, comparisons
server/worker.js   Durable processing, retries, restart recovery
server/reports.js  Evidence snapshots, visual PDF, safe CSV encoding
server/index.js    Routes, authentication, authorization, uploads, SPA server
tests/             End-to-end API integration and service contract tests
docs/              Architecture, API reference, demo walkthrough
Dockerfile         Production build and single-instance runtime
compose.yaml       Local container deployment with a persistent volume
```

## Reference documentation

- [Cloudinary Node image and video upload](https://cloudinary.com/documentation/node_image_and_video_upload)
- [Cloudinary video transformations](https://cloudinary.com/documentation/video_manipulation_and_delivery)
- [OpenAI image and vision guide](https://developers.openai.com/api/docs/guides/images-vision)
- [OpenAI embeddings guide](https://developers.openai.com/api/docs/guides/embeddings)
- [API reference](docs/API.md)
- [Architecture and data model](docs/ARCHITECTURE.md)
- [Hackathon demo walkthrough](docs/DEMO.md)

Illustrative seed photography is served from Unsplash. Those records are examples for the interface; no actual association with the named demo projects is claimed.
