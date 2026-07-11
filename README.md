# Idea Foundry — Xahau + Evernode

Idea Foundry is a local-first, optional-AI idea-generation and evidence-review workspace for Xahau and Evernode projects. It moves a founder from a broad search profile to falsifiable candidates, helps organize a review, then calculates stage readiness with a locked 51-claim rubric.

No account or ChatGPT sign-in is required in the desktop edition.

## Download and install on Windows

Download the latest files from [GitHub Releases](https://github.com/NickFields0101/idea-foundry/releases/latest).

- **Installer:** download `Idea-Foundry-Setup-0.4.1-x64.exe`, double-click it, choose an install folder, and launch Idea Foundry from the desktop or Start menu.
- **Portable:** download `Idea-Foundry-Portable-0.4.1-x64.exe` and double-click it. It runs without installing anything.

No app account, wallet, ChatGPT sign-in, or AI connection is required. The app works immediately with manual ideas and the starter slate. Connecting Ollama, LM Studio, OpenRouter, or another compatible model is optional. Choosing OpenRouter requires the user's own OpenRouter account, API key, and credits.

Version `0.4.1` is not yet code-signed, so Windows SmartScreen may display an **Unknown publisher** warning. Verify the download against `SHA256SUMS.txt` on the release page before choosing **More info** and **Run anyway**. Organizations distributing the app broadly should code-sign future builds.

## Download and install on macOS

Download the latest DMG from [GitHub Releases](https://github.com/NickFields0101/idea-foundry/releases/latest). Choose `arm64` for Apple silicon Macs or `x64` for Intel Macs running macOS 12 Monterey or newer, open the DMG, and drag Idea Foundry into Applications. ZIP packages are also provided for manual deployment.

The current macOS packages are unsigned and not notarized. Verify `SHA256SUMS.txt`, then right-click Idea Foundry and choose **Open** if Gatekeeper warns about an unidentified developer. Future broad distribution should use an Apple Developer ID certificate and notarization. See [macOS distribution](docs/macos-distribution.md) for build, architecture, signing, and release details.

The app deliberately separates two questions:

- **What should I explore?** An optional private profile and connected LLM help generate and rank hypotheses by personal fit, opportunity signal, protocol affordance, and experimentability.
- **What does the evidence support?** A deterministic engine calculates merit, evidence-adjusted value, confidence, coverage, caps, critical floors, and gates. Neither the profile nor the LLM can change these results.

## Desktop edition

The packaged desktop app runs locally and supports:

- Ollama on `http://127.0.0.1:11434`
- LM Studio on `http://127.0.0.1:1234/v1`
- OpenRouter on the locked `https://openrouter.ai/api/v1` endpoint with a user-supplied API key
- A user-selected OpenAI-compatible HTTPS endpoint, or an HTTP loopback endpoint on the same computer
- API credentials encrypted through the operating system

The renderer has no direct network authority. A narrow, isolated desktop bridge handles configuration, connection testing, model discovery, idea generation, and the optional review assistants. Local providers are restricted to loopback addresses.

To connect a model:

1. Start Ollama or the LM Studio local server, obtain an OpenRouter API key, or obtain the base URL for another compatible endpoint.
2. Open **Settings & data → AI model** in the desktop navigation.
3. Choose OpenRouter, Ollama, LM Studio, or an OpenAI-compatible endpoint.
4. Paste an API key when required. OpenRouter always requires one.
5. Start typing in **Find a model**. OpenRouter searches live as you type, so a query such as `4.8` immediately shows matching canonical model names and IDs exposed by OpenRouter. Local providers filter their reported catalog the same way.
6. Choose a result and select **Save & connect**.
7. Open **Ideas** and select **Generate ideas**.

Every generated item is marked as an editable AI draft. It cannot write claims, evidence, grades, gates, caps, scores, or advancement results.

## Optional AI-assisted review

The two review assistants are available only in the desktop edition with a connected model. They work with local Ollama or LM Studio models and with cloud OpenRouter or OpenAI-compatible providers.

- **Draft evaluation:** the model proposes merits and rationales for unanswered claims and can recommend gate outcomes. It applies nothing automatically, never supplies rubric weights, totals, or final scores, and cannot bypass validation. You choose which claim drafts to apply; gate proposals are reviewed and applied one at a time.
- **Organize evidence:** paste the actual source material you already have, such as interview notes, test results, or a research excerpt. The model turns it into reviewable artifact proposals, and Idea Foundry locally confirms that every quoted excerpt exists in the pasted source before it can be approved. The model cannot create proof or verify its own output.
- **Human control:** evidence at E2 or above still requires an explicit human verification action, reviewer name, and conflict disclosure. Applied changes have one-click undo.
- **Local project data:** the full pasted source is not persisted. An approved artifact keeps only its excerpt, source fingerprint, and AI provenance so the review remains auditable.

If you choose a cloud provider, the relevant idea, review context, or pasted evidence source is sent to that provider for the requested operation. Use Ollama or LM Studio when the material must remain on the device.

## Optional Quick Run

Select **Quick Run** on the welcome screen or Home to start the full workflow with one button. It generates a four-idea slate when needed, pauses for the user to choose the direction, drafts unanswered merit ratings, opens the evidence organizer, refreshes gate recommendations against the current evidence, and then opens the deterministic decision.

Quick Run automates preparation, not approval. It never chooses an idea, applies a merit rating, accepts an evidence record, resolves a gate, or changes the final outcome without a user action. Evidence-free reviews remain explicitly provisional. When a cloud model is connected, Quick Run confirms before it sends a project, notes, or stored evidence excerpts; local Ollama and LM Studio flows stay on the computer.

## Use the framework

1. Select **Start a project**, **Personalize my ideas**, or **I already have an idea**.
2. Generate ideas with a connected model, add your own, try the examples, or copy the prompt into any LLM.
3. Choose one idea. Optional 0–100 exploration estimates only order the idea list; they are not validated scores.
4. Open **Evaluate**, choose the target stage and archetype, and assess all 51 atomic claims with merit from 0–5. In the desktop app, you may ask the connected model to draft unanswered claim merits and gate recommendations, then approve only the useful proposals.
5. Open **Evidence**, attach proof manually or use the desktop evidence organizer with pasted source text, and assign E0–E4. The validator checks type ceilings, dates, verification, claim links, duplicates, and counterevidence.
6. Resolve the eight non-compensable gates.
7. Open **Decision** to read the four separate outputs and every active cap, floor, validation error, and blocker.
8. Use **Settings & data → Import & export** for a reproducible JSON packet or claim-level CSV.

## Scoring integrity

- Framework: `v3`
- Engine: `v3-powershell-parity/1.0.2`
- Canonical claims: `51`
- Archetype weights: exactly `100` for Application, Enterprise, Protocol/Infrastructure, and Marketplace/DePIN
- Rubric manifest SHA-256: `fa940feea694ee4df4aa064d2fc418e68a879f318c11e72cfbc4bf5a9d1c1d67`
- A claim is scored only to the strongest fully eligible linked artifact. Rank and evidence type must be satisfied by the same artifact for typed caps and stage floors.
- Rounding: midpoint-to-even where required by the canonical calculator

**Numeric + gate ready** is not a final investment, financing, launch, safety, or governance decision. Team coverage, role design, financing approval, independent review, and human judgment remain separate.

## Privacy model

- No Idea Foundry account is required. OpenRouter and other remote services may require their own accounts and billing.
- Projects are stored locally on the current device.
- There is no analytics, wallet connection, hosted project database, or automatic upload.
- Private profile data is excluded from exports by default.
- Computed fields in imported packets are ignored and recalculated locally.
- API credentials are never stored in project JSON or browser storage.
- Evaluation and evidence AI drafts remain staged until the user explicitly applies them; each application can be undone in one click.
- The evidence organizer does not persist the full pasted source. Approved artifacts retain only the accepted excerpt, source fingerprint, and model provenance.
- Ollama and LM Studio are forced to localhost in their named connector modes.
- OpenRouter is pinned to its official HTTPS API URL so its key cannot be redirected to another host.
- Other remote endpoints must use HTTPS. Saved keys are bound to the exact provider and endpoint and are cleared when that boundary changes.
- Choosing OpenRouter sends the displayed prompt and operation-specific context to OpenRouter and the selected upstream model provider. Other remote compatible endpoints receive the same material; the UI warns about these boundaries.
- Do not enter wallet seeds, regulated personal data, or confidential evidence bodies.

**Clear project** removes the active workspace but keeps the saved AI connection. **Clear everything** also removes the provider, model, and operating-system-protected API key. Export important work first.

## Development

Requires Node.js `>=22.13.0`.

```bash
npm ci
npm run dev
```

Desktop validation and local launch:

```bash
npm run desktop:typecheck
npm run desktop:build
npm run desktop:run
```

Create Windows installer and portable packages:

```bash
npm run desktop:package
```

Create macOS Intel and Apple silicon DMG/ZIP packages (must run on macOS, or use GitHub Actions):

```bash
npm run desktop:package:mac
```

Run all web, scoring, connector, and security tests:

```bash
npm test
```

## Project structure

- `app/page.tsx` — shared web/desktop workflow and model-connection UI
- `app/lib/model-search.ts` — punctuation-tolerant local model ranking and filtering
- `app/lib/scoring.ts` — deterministic validator and scoring engine
- `app/lib/rubric.json` — canonical 51-row rubric manifest
- `desktop/main.mjs` — isolated Electron main process and secure configuration store
- `desktop/preload.cjs` — narrow allowlisted renderer bridge
- `desktop/llm-core.mjs` — provider-neutral connector, validation, and output normalization
- `desktop/renderer/` — local desktop entry point with strict content security policy
- `tests/scoring.test.ts` — parity, caps, evidence, privacy-invariance, and determinism fixtures
- `tests/model-search.test.ts` — model version, punctuation, provider, and stable-rank fixtures
- `tests/llm-core.test.mjs` — mocked provider and failure-mode fixtures
- `tests/desktop-security.test.mjs` — authority-boundary and AI-write invariants

## Brand assets

- `public/brand/idea-foundry-logo.png` — wide landing-page wordmark
- `public/brand/idea-foundry-icon.png` — square UI and icon reference
- `public/brand/idea-foundry-mark-transparent.png` — large decorative mark
- `app/icon.png` and `app/apple-icon.png` — web metadata icons
- `build/icon.png` — Electron icon master for Windows and macOS conversion
- `public/og.png` — social preview image

Unless otherwise noted, repository assets are distributed under the repository's MIT license. Idea Foundry is an independent open-source project and is not an official Xahau or Evernode product; names and marks belonging to third parties remain their respective owners.

## Methodology source

This implementation is derived from the open-source Xahau/Evernode Idea Review Framework v3 and preserves the current PowerShell calculator behavior under an explicit parity engine version. Any intentional rules change should use a new engine version and new golden fixtures so historical reviews remain reproducible.

## License

MIT. See [LICENSE](LICENSE).
