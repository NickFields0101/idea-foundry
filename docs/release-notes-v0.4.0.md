# Idea Foundry v0.4.0

Version 0.4.0 makes the desktop app faster to understand, much easier to connect to OpenRouter, and able to assist with evaluation and evidence preparation while preserving the locked deterministic scoring engine.

## What changed

- Added live OpenRouter model typeahead. Enter a name, version, or partial canonical ID—such as `4.8` or `opus.4.8`—and Idea Foundry queries OpenRouter automatically, ranks the response, and shows the best matches in a keyboard-accessible dropdown.
- Added punctuation-tolerant model matching, so dots, hyphens, underscores, and slashes behave naturally without hard-coded model names.
- Simplified the primary workflow to **Home → Ideas → Evaluate → Evidence → Decision**.
- Moved personalization, AI connection, and import/export tools into a compact **Settings & data** drawer.
- Reworked the start screen, idea-generation controls, candidate cards, profile editor, and model setup around progressive disclosure and plain-language actions.
- Combined model saving and connection testing into one **Save & connect** action.
- Added an optional desktop **Draft evaluation** workflow for connected local or cloud models. It proposes merits and rationales for unanswered claims plus gate recommendations, but applies nothing until the user approves it. Gate proposals are applied one at a time.
- Added an optional desktop **Organize evidence** workflow. It converts pasted source material into reviewable artifact proposals and locally confirms that every proposed excerpt appears in the supplied text.
- Added one-click undo for approved AI-assisted evaluation and evidence changes.
- Added the new Idea Foundry logo, application icon, and transparent mark to the web interface and native Windows/macOS build resources.
- Preserved manual model-ID entry and full-catalog browsing as advanced fallbacks.

## Integrity and security

- The scoring rubric, 51 claims, caps, floors, and gates are unchanged.
- Evidence dated after the review cutoff is rejected and excluded, and expiry dates can no longer predate the observation.
- Invalid, duplicated, expired, future-dated, or incompletely reviewed evidence contributes zero. Typed caps and floors now require one artifact to satisfy both the required grade and evidence type.
- Reprocessing the same source reuses its source family, while duplicate excerpts are rejected instead of being counted as new evidence.
- AI output remains a staged draft. It never supplies rubric weights, totals, final scores, or advancement decisions, and it cannot change the deterministic calculator.
- The AI cannot verify its own evidence. E2 or higher requires an explicit human verification action, a reviewer name, and a conflict disclosure before approval.
- The full pasted evidence source is not persisted. Approved artifacts retain only the accepted excerpt, a source fingerprint, and model provenance for auditability.
- OpenRouter remains pinned to `https://openrouter.ai/api/v1`; typeahead text is URL-encoded and API keys remain header-only.
- Other remote compatible endpoints must use HTTPS, and saved API keys are bound to both their provider and exact endpoint.
- Credentials remain protected by the operating system and are excluded from projects, exports, and browser storage.
- Ollama and LM Studio keep prompts on the local model server. OpenRouter and other remote compatible providers receive the operation-specific idea, review, or pasted evidence context only when the user invokes that assistant.

## Downloads

- Windows 64-bit installer and portable executable
- macOS 12+ DMG and ZIP for Apple silicon (`arm64`)
- macOS 12+ DMG and ZIP for Intel (`x64`)
- `SHA256SUMS.txt` for release verification

The Windows and macOS packages are currently unsigned. Verify the checksum before opening them. Windows may show an **Unknown publisher** warning, and macOS may require right-clicking the app and choosing **Open**.
