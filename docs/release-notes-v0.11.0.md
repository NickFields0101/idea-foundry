# SIFT v0.11.0

Version 0.11.0 delivers the complete Create-to-Build handoff, clearer AI failure recovery, and a quieter SIFT interface.

## Create to build

- One primary action now generates and critiques ideas, selects the strongest candidate, researches public context when available, runs the deterministic thesis screen, calculates the decision, and prepares a route-aware build brief.
- The result offers **Start building** or **Not now**. Signing, spending, leasing, and deployment still require explicit approval.
- Xahau, Evernode, hybrid, and conventional routes receive distinct build handoffs without treating public research as customer validation.

## More reliable AI runs

- Recoverable Python worker stops, timeouts, malformed model output, and schema failures now use one bounded fallback generator instead of ending with a generic stopped message.
- Authentication, credit, rate-limit, and model-rejection errors retain safe error codes and show a specific corrective message.
- The Python intelligence worker remains advisory; TypeScript validation and deterministic scoring remain authoritative.

## Simpler interface and packaging

- Appearance and the single **Clear local data** action now live only in Settings.
- Removed the saved-status label, sidebar data-controls drawer, redundant landing disclaimer, and the extra start menu.
- Product branding now appears simply as **SIFT** while Xahau and Evernode remain available as functional technology routes.
- The portable Windows download is now `SIFT.exe`; the versioned Windows installer remains available for normal installation.
- Removed unused ChatGPT sign-in and database starter scaffolding from the source repository.

## Distribution notes

Windows and macOS packages are currently unsigned. Verify downloads with `SHA256SUMS.txt` from the release before bypassing operating-system warnings.
