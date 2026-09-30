# Demo walkthrough

## A credential-free demonstration (about 5 minutes)

**Opening (30 seconds).** Sign in and show the overview. Explain that the three projects and nine photographs are clearly labeled illustrative examples. Show capture-month counts and pending human reviews.

**Organize evidence (45 seconds).** Open the library, select River revival, filter before/after phases and search a tag such as river or vegetation. Open an asset and show project, user-supplied location/date and original source link. Explain that location and dates are not automatically verified.

**Review and trace (45 seconds).** Enter a note such as "Illustrative stock photograph reviewed for demonstration only; not actual field evidence." Approve it. Open Original & provenance and inspect the source identifier and review event. Explain the difference between a media hash, a human approval and authenticity verification.

**Compare moments (45 seconds).** Choose the March baseline and April follow-up within River revival. Drag the before/after split. Save the manual comparison. Explain that stock photos are not a matched field survey and that the demo does not fabricate measured change.

**Create a visual report (60 seconds).** Approve both demo records with appropriate notes. Create a draft report using them. Read the source citations and limitations, then download the PDF. Explain that demo-containing drafts cannot be published as actual project impact.

**Upload your own sample (60 seconds).** Upload an approved photo with a capture date, location and notes. Watch its queue entry and metadata-only result. Approve it, then create a square campaign crop and show the exact transformation and source reference. The crop is a real generated file; it does not replace the original.

**Close (30 seconds).** Show the verified audit chain, exports and team roles. Explain where Cloudinary and live vision are activated.

## A live-credential demonstration

1. Configure Cloudinary and OpenAI in `.env`; restart the API.
2. Create a real project and use two permitted, properly matched survey photos with distinct dates. Use a small permitted video if showing frame analysis.
3. Upload the baseline and follow-up. Show the returned Cloudinary public ID, asset ID/version, original SHA-256 and optimized preview.
4. Wait for analysis. Explain tags, visible signals and uncertainty; show that subjective AI confidence is not an authenticity score.
5. Try semantic search with a concept present in the generated description but not the filename.
6. Review both originals. Save a qualitative comparison and discuss alignment and seasonal limitations.
7. Produce a campaign derivative; show its Cloudinary transformation URL and recorded provenance.
8. Create a report. Add a numerical measurement only if you have an actual supporting field record and can state the collection method. No quantity is automatically invented.
9. Download the visual PDF and publish internally. Explain that publication is a workflow state, not a public website.

## What to emphasize to judges

- **Cloudinary is part of the core pipeline:** storage, optimized media delivery, video-frame sampling, campaign crops and asset/version traceability.
- **AI results are inspectable:** each result is attached to an original, labeled by provider, and includes uncertainty.
- **Impact claims have an approval boundary:** only human-approved evidence supports reports; demo media cannot support measurements or publication.
- **The product survives restarts:** uploads, processing state, reports, reviews and history persist.
- **The system fails visibly:** service errors retry, terminal failure appears in the queue, and users can reanalyze.
- **No greenwashing by fabricated metrics:** observations are qualitative, and quantitative outcomes require reviewer-supplied field records.

## Practical preparation

Have the server running and the demo login ready. For live demonstrations test account permissions, credits, network access, models and Cloudinary transformations ahead of time. Use consented media that may be publicly delivered in Cloudinary. Keep fallback demo mode available; do not present demo tags or stock photography as actual live AI or field evidence.
