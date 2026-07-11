# Idea Foundry v0.4.1

Version 0.4.1 adds an optional guided Quick Run and fixes AI connection state after local data is cleared.

## What changed

- Added **Quick Run** to the welcome screen and Home. One button starts a guided path through idea generation, evaluation, evidence, gates, and the deterministic decision.
- Quick Run generates four editable hypotheses when needed, then pauses for the user to choose the direction.
- The connected model can draft unanswered merits, organize source text, and refresh gate recommendations against the current evidence.
- Gate-only refreshes cannot rewrite existing claim ratings.
- Already-reviewed projects resume at the Evidence checkpoint instead of skipping it.
- Added **Clear project**, which keeps the saved AI connection, and **Clear everything**, which also forgets the provider, model, and protected API key.
- Fixed provider switching after a clear or reload. Returning to a previously saved provider restores its saved model and recognizes its protected key only at the exact saved endpoint.
- Late model loads, searches, saves, and Quick Run responses can no longer overwrite a newer user choice.

## Human control and privacy

- Quick Run applies nothing automatically. Idea choice, merit ratings, evidence records, and gates still require explicit user approval.
- Evidence-free results remain provisional, and AI never calculates or chooses the deterministic outcome.
- Exact excerpt matching, evidence ceilings, reviewer verification, conflict disclosure, dates, contradiction handling, and all other validators remain enforced.
- Cloud-model steps disclose their data boundary and confirm before sending the selected idea, review notes, or stored evidence excerpts.
- A local-data clear immediately blocks connector saves and AI work until the protected configuration has been removed.
- The scoring rubric, 51 claims, weights, caps, floors, and gates are unchanged.

## Downloads

- Windows 64-bit installer and portable executable
- macOS 12+ DMG and ZIP for Apple silicon (`arm64`)
- macOS 12+ DMG and ZIP for Intel (`x64`)
- `SHA256SUMS.txt` for release verification

The Windows and macOS packages are currently unsigned. Verify the checksum before opening them. Windows may show an **Unknown publisher** warning, and macOS may require right-clicking the app and choosing **Open**.
