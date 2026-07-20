# SIFT v0.12.0

Version 0.12.0 makes SIFT easier to use whether you want it to create a new idea or evaluate one you already have.

## Bring your own idea

- Adds a first-class flow for uploading, pasting, or writing an existing idea.
- Reads selectable text from PDF, TXT, Markdown, JSON, CSV, and YAML files locally on the device.
- Optionally uses the connected model to organize imported material into SIFT's idea structure without inventing evidence.
- Keeps the original file and transient extracted text out of saved projects, exports, and the evidence ledger.
- Carries the imported idea into the same research, screening, decision, and build-ready workflow as generated ideas.

## More dependable idea generation

- Honors the number of ideas requested and clearly identifies ideas added by the latest run.
- Excludes near-duplicates and ideas already saved in the project before applying the requested count.
- Uses a compact recovery request after a slow Idea Forge run, followed by at most one bounded completion attempt.
- Adds no partial slate when SIFT cannot produce the full number of distinct ideas requested.
- Preserves accurate timeout and provider error messages without exposing credentials or raw model responses.

## Validation

- Expands coverage for idea counts, timeout recovery, local document parsing, privacy boundaries, and atomic idea saving.
- Validates the deterministic application suite, Python intelligence worker, TypeScript, linting, and desktop/web production builds.

Windows and macOS packages are currently unsigned. Verify downloads with `SHA256SUMS.txt` from the release before bypassing operating-system warnings.
