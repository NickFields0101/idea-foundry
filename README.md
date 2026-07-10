# Idea Foundry — Xahau + Evernode

Idea Foundry is a local-first, optional-AI idea-generation and evidence-review workspace for Xahau and Evernode projects. It moves a founder from a broad search profile to falsifiable candidates, then calculates stage readiness with a locked 51-claim rubric.

No account or ChatGPT sign-in is required in the desktop edition.

## Download and install on Windows

Download the latest files from [GitHub Releases](https://github.com/NickFields0101/idea-foundry/releases/latest).

- **Installer:** download `Idea-Foundry-Setup-0.2.0-x64.exe`, double-click it, choose an install folder, and launch Idea Foundry from the desktop or Start menu.
- **Portable:** download `Idea-Foundry-Portable-0.2.0-x64.exe` and double-click it. It runs without installing anything.

No app account, wallet, ChatGPT sign-in, or AI connection is required. The app works immediately with manual ideas and the starter slate. Connecting Ollama, LM Studio, OpenRouter, or another compatible model is optional. Choosing OpenRouter requires the user's own OpenRouter account, API key, and credits.

Version `0.2.0` is not yet code-signed, so Windows SmartScreen may display an **Unknown publisher** warning. Verify the download against `SHA256SUMS.txt` on the release page before choosing **More info** and **Run anyway**. Organizations distributing the app broadly should code-sign future builds.

The app deliberately separates two questions:

- **What should I explore?** An optional private profile and connected LLM help generate and rank hypotheses by personal fit, opportunity signal, protocol affordance, and experimentability.
- **What does the evidence support?** A deterministic engine calculates merit, evidence-adjusted value, confidence, coverage, caps, critical floors, and gates. Neither the profile nor the LLM can change these results.

## Desktop edition

The packaged desktop app runs locally and supports:

- Ollama on `http://127.0.0.1:11434`
- LM Studio on `http://127.0.0.1:1234/v1`
- OpenRouter on the locked `https://openrouter.ai/api/v1` endpoint with a user-supplied API key
- A user-selected OpenAI-compatible HTTP or HTTPS endpoint
- API credentials encrypted through the operating system

The renderer has no direct network authority. A narrow, isolated desktop bridge performs only five model operations: read configuration, save configuration, test the connection, list models, and generate an idea slate. Local providers are restricted to loopback addresses.

To connect a model:

1. Start Ollama or the LM Studio local server, obtain an OpenRouter API key, or obtain the base URL for another compatible endpoint.
2. Open **LLM** in the desktop navigation.
3. Select the provider and enter or refresh the model ID.
4. Paste an API key when required. OpenRouter always requires one.
5. Test the connection and save it locally.
6. Open **Ideas** and choose **Generate with connected LLM**.

Every generated item is marked as an editable AI draft. It cannot write claims, evidence, grades, gates, caps, scores, or advancement results.

## Use the framework

1. Choose **Profile-neutral** or create a **Private profile**.
2. Generate hypotheses with a connected model, add them manually, load the starter slate, or copy the prompt into any LLM.
3. Give each candidate 0–100 exploration estimates. These values only order the search; they are not validated scores.
4. Select one idea and lock its dominant archetype and target stage.
5. Assess all 51 atomic claims with merit from 0–5.
6. Attach evidence and assign E0–E4. The validator checks evidence-type ceilings, dates, verification, claim links, duplicates, and counterevidence.
7. Resolve the eight non-compensable gates.
8. Read the four separate outputs and every active cap, floor, validation error, and blocker.
9. Export a reproducible JSON packet or claim-level CSV.

## Scoring integrity

- Framework: `v3`
- Engine: `v3-powershell-parity/1.0.1`
- Canonical claims: `51`
- Archetype weights: exactly `100` for Application, Enterprise, Protocol/Infrastructure, and Marketplace/DePIN
- Rubric manifest SHA-256: `fa940feea694ee4df4aa064d2fc418e68a879f318c11e72cfbc4bf5a9d1c1d67`
- Rounding: midpoint-to-even where required by the canonical calculator

**Numeric + gate ready** is not a final investment, financing, launch, safety, or governance decision. Team coverage, role design, financing approval, independent review, and human judgment remain separate.

## Privacy model

- No Idea Foundry account is required. OpenRouter and other remote services may require their own accounts and billing.
- Projects are stored locally on the current device.
- There is no analytics, wallet connection, hosted project database, or automatic upload.
- Private profile data is excluded from exports by default.
- Computed fields in imported packets are ignored and recalculated locally.
- API credentials are never stored in project JSON or browser storage.
- Ollama and LM Studio are forced to localhost in their named connector modes.
- OpenRouter is pinned to its official HTTPS API URL so its key cannot be redirected to another host.
- Choosing OpenRouter sends the displayed generation prompt to OpenRouter and the selected upstream model provider. Other remote compatible endpoints receive the same displayed prompt; the UI warns about these boundaries.
- Do not enter wallet seeds, regulated personal data, or confidential evidence bodies.

Clearing local data removes the active workspace from that application profile. Export important work first.

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

Run all web, scoring, connector, and security tests:

```bash
npm test
```

## Project structure

- `app/page.tsx` — shared web/desktop workflow and model-connection UI
- `app/lib/scoring.ts` — deterministic validator and scoring engine
- `app/lib/rubric.json` — canonical 51-row rubric manifest
- `desktop/main.mjs` — isolated Electron main process and secure configuration store
- `desktop/preload.cjs` — narrow allowlisted renderer bridge
- `desktop/llm-core.mjs` — provider-neutral connector, validation, and output normalization
- `desktop/renderer/` — local desktop entry point with strict content security policy
- `tests/scoring.test.ts` — parity, caps, evidence, privacy-invariance, and determinism fixtures
- `tests/llm-core.test.mjs` — mocked provider and failure-mode fixtures
- `tests/desktop-security.test.mjs` — authority-boundary and AI-write invariants

## Methodology source

This implementation is derived from the open-source Xahau/Evernode Idea Review Framework v3 and preserves the current PowerShell calculator behavior under an explicit parity engine version. Any intentional rules change should use a new engine version and new golden fixtures so historical reviews remain reproducible.

## License

MIT. See [LICENSE](LICENSE).
