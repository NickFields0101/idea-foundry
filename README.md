# SIFT

SIFT is a local-first, optional-AI venture workspace for Xahau and Evernode projects. It moves a founder from a broad search profile to falsifiable candidates, helps organize a review, calculates stage readiness with a locked 51-claim rubric, and carries the selected opportunity into a guarded local Build workspace.

No account or ChatGPT sign-in is required in the desktop edition.

## Download and install on Windows

Download the latest files from [SIFT Releases](https://github.com/NickFields0101/sift/releases/latest).

- **Installer:** download `SIFT-Setup-0.11.0-x64.exe`, double-click it, choose an install folder, and launch SIFT from the desktop or Start menu.
- **Portable:** download `SIFT.exe` and double-click it. It runs without installing anything.

No app account, wallet, ChatGPT sign-in, or AI connection is required. The app works immediately with manual ideas and the starter slate. Connecting Ollama, LM Studio, OpenRouter, or another compatible model is optional. Choosing OpenRouter requires the user's own OpenRouter account, API key, and credits.

Version `0.11.0` is not yet code-signed, so Windows SmartScreen may display an **Unknown publisher** warning. Verify the download against `SHA256SUMS.txt` on the release page before choosing **More info** and **Run anyway**. Organizations distributing the app broadly should code-sign future builds.

## Download and install on macOS

Download the latest DMG from [SIFT Releases](https://github.com/NickFields0101/sift/releases/latest). Choose `arm64` for Apple silicon Macs or `x64` for Intel Macs running macOS 12 Monterey or newer, open the DMG, and drag SIFT into Applications. ZIP packages are also provided for manual deployment.

The current macOS packages are unsigned and not notarized. Verify `SHA256SUMS.txt`, then right-click the app and choose **Open** if Gatekeeper warns about an unidentified developer. Future broad distribution should use an Apple Developer ID certificate and notarization. See [macOS distribution](docs/macos-distribution.md) for build, architecture, signing, and release details.

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

The renderer has no direct network authority. A narrow, isolated desktop bridge handles configuration, connection testing, model discovery, idea generation, optional review assistants, and bounded OpenRouter public research. Local providers are restricted to loopback addresses.

Create to Build uses SIFT's supervised Python intelligence engine for two bounded jobs. **Idea Forge** first frames distinct actor/problem mechanisms, generates a wider slate, and then runs a separate critique-and-revision pass. After selection, the engine performs competitor mapping, assumption analysis, and red-teaming. Python runs as a private sidecar process with no listening port and returns only provisional structured hypotheses. TypeScript validates every result, applies the deterministic idea-construction gate, removes near-duplicates, and remains the sole authority for project state, evidence policy, scoring, gates, decisions, and the guarded build handoff. The Windows and macOS packages embed the worker, so users do not install Python or Docker.

The interface includes persistent light and dark modes. Theme preference is stored separately from project and model data.

To connect a model:

1. Start Ollama or the LM Studio local server, obtain an OpenRouter API key, or obtain the base URL for another compatible endpoint.
2. Open **Settings & data → AI model** in the desktop navigation.
3. Choose OpenRouter, Ollama, LM Studio, or an OpenAI-compatible endpoint.
4. Paste an API key when required. OpenRouter always requires one.
5. Start typing in **Find a model**. OpenRouter searches live as you type, so a query such as `4.8` immediately shows matching canonical model names and IDs exposed by OpenRouter. Local providers filter their reported catalog the same way.
6. Choose a result and select **Save & connect**.
7. Open **Ideas** and select **Generate ideas**.

Every generated item is marked as an editable AI draft. It cannot write claims, evidence, grades, gates, caps, scores, or advancement results.

## Optional research-based personality profile

For more relevant idea generation, a user can complete the public-domain **Johnson (2014) IPIP-NEO-120** Big Five assessment inside SIFT. The 120-item questionnaire usually takes 15–20 minutes and reports five broad domains plus 30 facets. It is available as an optional alternative to entering profile preferences manually.

Results are shown as 0–100 **response-scale positions**, not population percentiles. They describe how the user answered this questionnaire; they do not rank the user against other people. The assessment is for self-reflection and idea personalization only. It is not a diagnosis and must not be used for hiring, employment, education, insurance, credit, healthcare, or any other consequential decision.

Unfinished raw answers are kept only in the current session's `sessionStorage` so the questionnaire can be resumed. Raw answers are not saved with the project or included in exports. After the user applies a completed result, only the derived assessment result is saved locally and may be included in a user-created export. Exact scores are included in connected-model prompts only when the user separately opts in; with a cloud provider, that means the derived scores leave the device. Otherwise the connected model receives no exact personality scores. The profile can influence idea prompts and personal-fit ordering, but it cannot alter the 51-claim rubric, weights, gates, evidence validation, or deterministic decision formula.

Instrument and scoring references are listed in [Third-party notices](THIRD_PARTY_NOTICES.md).

## Optional AI-assisted review

The two review assistants are available only in the desktop edition with a connected model. They work with local Ollama or LM Studio models and with cloud OpenRouter or OpenAI-compatible providers.

- **Draft evaluation:** the model proposes merits and rationales for unanswered claims and can recommend gate outcomes. It applies nothing automatically, never supplies rubric weights, totals, or final scores, and cannot bypass validation. You choose which claim drafts to apply; gate proposals are reviewed and applied one at a time.
- **Organize evidence:** paste the actual source material you already have, such as interview notes, test results, or a research excerpt. The model turns it into reviewable artifact proposals, and SIFT locally confirms that every quoted excerpt exists in the pasted source before it can be approved. The model cannot create proof or verify its own output.
- **Human control:** evidence at E2 or above still requires an explicit human verification action, reviewer name, and conflict disclosure. Applied changes have one-click undo.
- **Local project data:** the full pasted source is not persisted. An approved artifact keeps only its excerpt, source fingerprint, and AI provenance so the review remains auditable.

If you choose a cloud provider, the relevant idea, review context, or pasted evidence source is sent to that provider for the requested operation. Use Ollama or LM Studio when the material must remain on the device.

## Create to Build: the one-click idea workflow

SIFT separates two jobs that must not be scored as if they were the same thing:

1. **Explore:** generate a new business hypothesis and decide whether it is worth testing.
2. **Validate:** collect real-world evidence after the idea exists and decide whether it has earned stage advancement.

In the desktop app, connect any supported model and choose **Create to build**. The one visible action runs an ordered internal workflow: opportunity framing, divergent candidate generation, independent critique and revision, local schema and thesis-construction checks, duplicate removal, weighted profile ordering, public context when available, the deterministic thesis screen, and a route-aware guarded build handoff. The order is deliberate: the model does not get to invent a shallow idea and grade that same first draft as if it were finished.

If the multi-stage Python Idea Forge stops, times out, or returns malformed structured output, SIFT automatically makes one bounded attempt with its standard generator and continues the same workflow. Authentication, credit, and rate-limit errors do not trigger another provider request; SIFT instead shows the specific account action required. The completed result asks **Start building** or **Not now**. No local build tool runs before that choice.

Every final candidate must name a specific actor and trigger, the current workflow, a material consequence, an economic buyer, a reachable first distribution wedge, adoption friction, a conventional implementation counterfactual, the exact Xahau/Evernode job if one exists, the largest failure case, one atomic assumption, and a structured 1â€“14 day test with a metric plus pass and kill thresholds. Xahau and Evernode are grounded in a bounded capability contract. A conventional `Neither yet` route is validâ€”and preferredâ€”when a ledger or independently hosted consensus service does not create a real advantage.

SIFT then uses the local profile-priority formula to choose the strongest *eligible* exploration match and asks the model to rate the specificity, coherence, and falsifiability of all 51 thesis hypotheses. Missing hypotheses receive low thesis merit; the model is explicitly forbidden from pretending that interviews, commitments, payments, tests, production behavior, or audits already happened. Idea-construction quality is deterministic but intentionally narrow: it measures whether a thesis is specific and testable, not whether the business will succeed.

With OpenRouter, SIFT may also gather exact-citation public context about markets, alternatives, regulation, and protocol capabilities. The local Python intelligence engine then maps alternatives, attacks fatal assumptions, and proposes disconfirming tests using the idea and any supplied public excerpts. Local and other compatible models skip web retrieval but can still perform the provisional competitor/red-team pass. These analyses may inform the model's hypothesis assessment, but they are not written into the direct-validation ledger and cannot raise the deterministic thesis score through an evidence multiplier.

The locked thesis screen returns **Advance to validation**, **Revise & rescreen**, **Park this idea**, or **Screen incomplete**. Its formula uses raw hypothesis merit plus the G1, G2, and G7 screen gates. It never requires customer evidence. The generated slate, selected idea, and thesis screen are saved atomically, and one undo restores the prior project.

Choosing **Start building** opens the guarded Build workspace with the selected idea, deterministic thesis decision, route, critical assumption, first experiment, and build brief already prepared. A Xahau route recommends Xahau MCP, an Evernode route recommends Evernode MCP, a hybrid keeps the two layers separate, and `Neither yet` recommends a conventional prototype instead of forcing protocol use. Generated artifacts remain previews; SIFT never signs, spends, leases, submits, or deploys automatically.

**Start validation** remains available whenever the founder wants to begin Discovery. It opens an intentionally empty evidence ledger and resets AI-owned screen gates. `0 direct records` is the correct starting state—not an error. From that point forward, SIFT's strict evidence grades, verification requirements, caps, floors, counterevidence rules, and formal stage decisions apply.

## Optional preview and guided modes

Select **Preview only** on Home to ask a connected model to generate ideas when needed and propose values for unanswered merit claims and unresolved gates. When the user has not already selected an idea, SIFT’s local profile-priority formula chooses the strongest saved exploration match. The app applies AI proposals only to an isolated copy of the review, derives an unresolved protocol route from the chosen idea’s declared Xahau/Evernode route when possible, then its locked local formula calculates a provisional outcome preview.

The preview does not modify the live review, apply an official rating or gate decision, create evidence, or verify evidence. Existing human decisions and evidence are preserved, and missing evidence remains missing. The result is always labeled provisional; the AI proposes inputs, while the deterministic engine—not the model—calculates the displayed outcome. Users can inspect the selected idea and complete the normal evidence-backed review separately. **Guided review** remains available for people who prefer to approve each checkpoint themselves.

When a cloud model is connected, Quick Run confirms before sending the operation-specific idea and review context. Local Ollama and LM Studio flows stay on the computer. A Quick Run never sends raw personality-test answers; exact derived scores are included only if the user enabled the separate personality-sharing option.

## Optional manual source review

Choose **Find cited public context** from Validation Evidence for the checkpointed research path. It searches public sources, maps exact citation excerpts to a bounded set of publicly researchable rubric claims, and pauses for one consolidated source review before the live project changes.

The research connector uses OpenRouter's current [`openrouter:web_search` server tool](https://openrouter.ai/docs/guides/features/server-tools/web-search) with the Exa engine and fixed result/context limits. It does not use the deprecated web plugin and never fetches arbitrary citation URLs itself. A source can enter the approval packet only when OpenRouter returns an HTTPS `url_citation` annotation with nonempty provider-supplied content and the proposed excerpt occurs exactly in that content. URLs written only in model prose are ignored.

Every approved public finding is forced to `DeskResearch / E1`, is marked not reviewer-verified, keeps its URL, title, retrieval time, exact excerpt, and content hash, and expires under the deterministic one-year desk-research policy. Public research cannot establish interviews, customer commitments, payments, production behavior, audits, or E2–E4 proof. Supporting records may update their linked claim to E1; contradicting records are attached but never acknowledged automatically. The live project changes only after the user checks the consolidated confirmation and selects **Add sources & calculate**. Skipping or discarding the packet leaves the live review untouched.

Research & Run currently requires OpenRouter because local OpenAI-compatible chat APIs do not provide a standard attributable web-search contract. OpenRouter model-token charges and web-search charges apply; SIFT shows this boundary before starting. The public research brief excludes personality scores, wallet data, stored customer identities, and private evidence bodies. Existing evidence excerpts may still be sent to the connected model for the separate evaluation-draft step when the user runs research against an already selected review, and the confirmation states that explicitly.

## Guarded local Build workspace

After choosing an idea, open **Build** to export an evidence-aware build brief and inspect the local Xahau/Evernode toolchain. The desktop edition integrates these upstream tools through a narrow main-process bridge:

- [Evernode MCP](https://github.com/Hugegreencandle/evernode-mcp) for advisory contract patterns and validation
- [Xahau MCP](https://github.com/Hugegreencandle/xahau-mcp) for confirmed Hook starters and bounded WASM inspection
- [XAHC](https://github.com/Hugegreencandle/xahc) for a fixed environment-doctor check in this release
- [XAHC Prover](https://github.com/Hugegreencandle/xahc-prover) as a detected, status-only companion while the pinned proof runner is hardened

The tools are installed separately; SIFT never downloads or updates them automatically. MCP calls use local stdio, not an exposed HTTP service. The renderer cannot supply a command, executable, path, working directory, shell, or timeout. Xahau starter inputs are strictly enumerated; generated source, files, and command examples are advisory output and are never executed automatically. SIFT does not accept signing secrets, sign transactions, submit transactions, spend funds, acquire leases, or deploy.

Upstream XAHC releases currently cover macOS arm64 and Linux x86_64; Windows requires a custom source-built toolchain. SIFT reports that limitation rather than claiming unsupported execution.

## Use the framework

1. Select **Create to build** for the one-click idea workflow, or choose a manual starting point.
2. Generate ideas with a connected model, add your own, try the examples, or copy the prompt into any LLM.
3. Read the deterministic thesis decision. A new idea is judged on hypothesis quality, not on evidence that could not exist yet. Optional 0–100 exploration estimates only order the idea list; they are not validated scores.
4. Choose **Start building** to enter the guarded build workspace with the route-aware brief already prepared, or choose **Start validation** to begin Discovery with zero direct evidence and unresolved formal gates.
5. Open **Validation evidence**, attach real observations and tests, use the desktop organizer with actual source material, or select **Find cited public context**. Public findings stay E1; the validator checks type ceilings, dates, verification, claim links, duplicates, and counterevidence.
6. Resolve the eight non-compensable gates.
7. Open **Stage decision** to read the evidence-backed outputs and every active cap, floor, validation error, and blocker.
8. Open **Build** to export the reviewed build brief, inspect local tool readiness, and create a guarded starter artifact.
9. Use **Settings & data → Import & export** for a reproducible JSON packet or claim-level CSV.

## Scoring integrity

- Framework: `v3`
- Engine: `v3-powershell-parity/1.1.0`
- Canonical claims: `51`
- Archetype weights: exactly `100` for Application, Enterprise, Protocol/Infrastructure, and Marketplace/DePIN
- Rubric manifest SHA-256: `fa940feea694ee4df4aa064d2fc418e68a879f318c11e72cfbc4bf5a9d1c1d67`
- A claim is scored only to the strongest fully eligible linked artifact. Rank and evidence type must be satisfied by the same artifact for typed caps and stage floors.
- Rounding: midpoint-to-even where required by the canonical calculator
- An empty evidence ledger is valid. Thesis screening ignores evidence entirely; Discovery and later stages remain blocked until their explicit evidence floors are met.

**Numeric + gate ready** is not a final investment, financing, launch, safety, or governance decision. Team coverage, role design, financing approval, independent review, and human judgment remain separate.

## Privacy model

- No SIFT account is required. OpenRouter and other remote services may require their own accounts and billing.
- Projects are stored locally on the current device.
- There is no analytics, wallet connection, hosted project database, or automatic upload.
- Private profile data is excluded from exports by default.
- Unfinished personality-assessment answers stay only in the current session's `sessionStorage`; project storage and exports contain only the derived result after completion.
- Exact derived personality scores are withheld from connected-model prompts unless the user explicitly opts in. Raw questionnaire answers are never sent as profile context.
- Computed fields in imported packets are ignored and recalculated locally.
- API credentials are never stored in project JSON or browser storage.
- Evaluation and evidence AI drafts remain staged until the user explicitly applies them; each application can be undone in one click.
- Create to Build saves the fresh idea slate and E0 thesis screen atomically, then prepares a route-aware build handoff. It never creates or verifies direct validation evidence, and no build tool runs before the separate **Start building** choice.
- The separate Preview mode is calculated in an isolated shadow review and cannot overwrite the live review.
- Research & Run accepts only exact provider-returned citation excerpts, keeps public findings at DeskResearch/E1, and commits the complete packet atomically only after one consolidated confirmation.
- Public research sends a public-safe idea brief to OpenRouter, the selected upstream model provider, and OpenRouter's configured Exa search service. It never sends raw personality answers, wallet material, or the full local evidence ledger to the search step.
- The evidence organizer does not persist the full pasted source. Approved artifacts retain only the accepted excerpt, source fingerprint, and model provenance.
- Ollama and LM Studio are forced to localhost in their named connector modes.
- OpenRouter is pinned to its official HTTPS API URL so its key cannot be redirected to another host.
- Other remote endpoints must use HTTPS. Saved keys are bound to the exact provider and endpoint and are cleared when that boundary changes.
- Choosing OpenRouter sends the displayed prompt and operation-specific context to OpenRouter and the selected upstream model provider. Other remote compatible endpoints receive the same material; the UI warns about these boundaries.
- Do not enter wallet seeds, regulated personal data, or confidential evidence bodies.

**Clear local data** in Settings removes the active workspace, profile, provider, model, and operating-system-protected API key. Export important work first.

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

Python intelligence validation and native-worker packaging:

```bash
npm run intelligence:test
python -m pip install pyinstaller==6.21.0
npm run intelligence:build
npm run intelligence:smoke
```

Python is required only for development and release builds. Normal desktop packages include the native worker.

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
- `app/lib/research-run.ts` — atomic cited-evidence validation, E1 enforcement, and shadow-preview integration
- `app/lib/rubric.json` — canonical 51-row rubric manifest
- `desktop/main.mjs` — isolated Electron main process and secure configuration store
- `desktop/preload.cjs` — narrow allowlisted renderer bridge
- `desktop/llm-core.mjs` — provider-neutral connector, validation, and output normalization
- `desktop/intelligence-bridge.mjs` — supervised JSONL worker lifecycle, validation, progress, cancellation, and secret boundary
- `desktop/intelligence_worker/` — bounded Python competitor and red-team engine; never the scoring authority
- `desktop/build-tools.mjs` — fixed local-tool catalog, detection, validation, and bounded MCP/CLI adapters
- `desktop/renderer/` — local desktop entry point with strict content security policy
- `tests/scoring.test.ts` — parity, caps, evidence, privacy-invariance, and determinism fixtures
- `tests/model-search.test.ts` — model version, punctuation, provider, and stable-rank fixtures
- `tests/llm-core.test.mjs` — mocked provider and failure-mode fixtures
- `tests/research-run.test.ts` — citation tamper checks, E1 ceilings, atomic approval, and counterevidence invariants
- `tests/build-tools.test.mjs` — tool allowlists, schema bounds, detection, and stdio transport fixtures
- `tests/desktop-security.test.mjs` — authority-boundary and AI-write invariants

## Brand assets

- `public/brand/sift-mark.svg` — scalable transparent tornado mark
- `public/brand/sift-mark.png` — raster fallback for the mark
- `app/icon.png` and `app/apple-icon.png` — web metadata icons
- `build/icon.png` — Electron icon master for Windows and macOS conversion
- `public/og.png` — social preview image
- `npm run brand:render` — rebuilds all raster assets from the SVG mark

Unless otherwise noted, repository assets are distributed under the repository's MIT license. SIFT is an independent open-source project and is not an official Xahau or Evernode product; names and marks belonging to third parties remain their respective owners.

The optional IPIP-NEO-120 personality assessment is a public-domain instrument and is documented separately in [Third-party notices](THIRD_PARTY_NOTICES.md).

## Methodology source

This implementation is derived from the open-source Xahau/Evernode Idea Review Framework v3 and preserves the current PowerShell calculator behavior under an explicit parity engine version. Any intentional rules change should use a new engine version and new golden fixtures so historical reviews remain reproducible.

## License

MIT. See [LICENSE](LICENSE).
