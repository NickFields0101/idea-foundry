# SIFT v0.7.0

Version 0.7.0 adds an honest one-click path from a blank page to a deterministic thesis decision while keeping real-world validation separate.

## Highlights

- New **Generate & Screen** workflow: SIFT generates four fresh ideas, selects the strongest profile match, screens the winner, saves the complete result atomically, and provides one-step undo.
- New deterministic thesis decisions: **Advance to validation**, **Revise & rescreen**, **Park this idea**, or **Screen incomplete**.
- Newly generated ideas are no longer penalized for having zero customer interviews, payments, production usage, or audits. Those records cannot exist before the idea does.
- The thesis screen evaluates hypothesis specificity, coherence, falsifiability, and the G1, G2, and G7 controls. Evidence multipliers, validation-stage caps, and evidence floors do not affect it.
- Deterministic engine `v3-powershell-parity/1.1.0` records the new stage-aware scoring semantics while retaining the existing canonical rubric manifest.
- OpenRouter can add cited public market, competitor, regulatory, and protocol context. Public context can inform the thesis assessment but is never written into the direct-validation ledger.
- Ollama, LM Studio, and other OpenAI-compatible providers can complete Generate & Screen without public web context.
- **Start validation** opens Discovery with an intentionally empty evidence ledger and resets AI-owned thesis gates. Strict evidence requirements begin from Discovery onward.
- Switching to another idea starts a clean thesis review so claims, gates, interviews, payments, and other evidence cannot leak across ideas.
- Thesis mode now hides evidence grades, production-stage controls, and evidence tools until validation explicitly begins.
- Updated high-resolution tornado artwork is used consistently for the Windows, macOS, and web application icons.

## What one click means

Generate & Screen automates everything that can honestly happen immediately: idea generation, selection, optional public context, hypothesis assessment, and the decision about whether an idea deserves validation.

It does not fabricate future customer validation. Interviews, direct tests, commitments, payments, production behavior, and audits must come from later real-world work.

## Upgrading

- Installing SIFT 0.7.0 over 0.6.0 preserves the existing installation identity, local projects, and protected model settings.
- The desktop app remains local-first and requires no SIFT or ChatGPT account.
- Windows and macOS packages remain unsigned. Verify downloads against `SHA256SUMS.txt` on the GitHub release page.

## Important boundaries

- AI proposes and explains thesis inputs; SIFT's locked local formula calculates the thesis decision.
- Public research remains desk context and cannot substitute for direct customer or product evidence.
- SIFT does not sign transactions, accept wallet secrets, spend funds, acquire leases, or deploy contracts automatically.
