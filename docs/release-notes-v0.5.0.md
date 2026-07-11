# Idea Foundry v0.5.0

Version 0.5.0 adds an optional research-based Big Five profile and an AI one-click outcome preview while preserving the locked, local review engine.

## What changed

- Added the public-domain **Johnson (2014) IPIP-NEO-120** as an optional profile-building path. The 120-item assessment typically takes 15–20 minutes and reports five broad domains plus 30 facets.
- Assessment results use 0–100 response-scale positions, not population percentiles, and are labeled for self-reflection and idea personalization—not diagnosis, hiring, or other consequential decisions.
- Added **AI one-click preview**. A connected model can generate ideas when needed and propose values for unanswered claims and unresolved gates; a local profile-priority formula selects among saved exploration estimates when the user has not already chosen an idea.
- The locked local engine calculates those proposals in an isolated review copy and displays a clearly provisional outcome. The model does not calculate or control the deterministic formula.
- Kept **Guided review** as an alternative for users who want to move through and approve each checkpoint themselves.
- Fixed the Quick Run progress connector so lines no longer cross step labels or markers.

## Integrity and privacy

- A one-click preview never mutates the live review, overwrites existing human decisions, fabricates or verifies evidence, or turns an evidence-free result into an official decision.
- If the review route is unresolved, the preview may derive it from the chosen idea’s declared Xahau/Evernode route. The preview shows that provenance, and the derived route exists only in the isolated copy.
- The scoring rubric, 51 claims, weights, caps, floors, evidence validator, and gates are unchanged. Personality results affect idea personalization, not deterministic review scores.
- Unfinished questionnaire answers exist only in the current session's `sessionStorage`. Raw answers are not saved to the project, included in exports, or sent to an LLM as profile context.
- Only the derived assessment result is saved locally after the user applies it. Exact derived scores are included in connected-model prompts only when the user explicitly opts in; a cloud provider receives them only under that opt-in.
- Cloud Quick Run confirms before sending its operation-specific context. Ollama and LM Studio continue to run on the local machine.

## Downloads

- Windows 64-bit installer and portable executable
- macOS 12+ DMG and ZIP for Apple silicon (`arm64`)
- macOS 12+ DMG and ZIP for Intel (`x64`)
- `SHA256SUMS.txt` for release verification

The Windows and macOS packages are currently unsigned. Verify the checksum before opening them. Windows may show an **Unknown publisher** warning, and macOS may require right-clicking the app and choosing **Open**.
