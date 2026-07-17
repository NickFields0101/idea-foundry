# SIFT v0.9.0

Version 0.9.0 replaces the one-pass idea prompt with a contract-first,
three-pass Idea Forge while preserving SIFT's deterministic evidence and
decision boundaries.

## Simpler product journey

- Home now presents one primary path: connect a model, generate and screen a
  fresh idea, then start real-world validation only when the thesis earns it.
- The full one-click flow reports clear progress and keeps the final thesis
  decision available after the run instead of forcing users back through the
  workflow.
- Advanced review controls and the 51-claim rubric remain available through
  progressive disclosure without dominating the default experience.
- Model setup, connection failures, recovery actions, evidence boundaries, and
  build-tool readiness are explained in plain language at the point of use.
- Updated SIFT tornado artwork is used consistently in the app header and
  workflow status surfaces in both light and dark themes.

## Better idea generation

- Python now frames opportunity mechanisms before proposing solutions,
  generates a wider raw slate, and independently critiques and rewrites the
  strongest candidates before returning them.
- Final ideas preserve the actor, trigger, current workflow, material
  consequence, buyer, why-now hypothesis, distribution wedge, adoption
  friction, protocol role, conventional counterfactual, failure case, critical
  assumption, and structured 14-day experiment.
- Every experiment includes an explicit target, artifact, metric, pass
  threshold, and kill threshold.
- Xahau and Evernode prompts use a bounded capability manifest. `Both` requires
  separate protocol responsibilities, while `Neither yet` remains available
  when conventional software is the stronger counterfactual.
- The model may not invent customer evidence, traction, payments, production
  behavior, audits, market statistics, or changing protocol facts.

## Local quality contract

- TypeScript measures thesis construction independently of model-provided
  exploration estimates.
- Generic actors, missing triggers, vague alternatives, marketing language,
  unsupported validation claims, incomplete experiments, contradictory routes,
  and unjustified protocol usage are rejected or flagged.
- Near-duplicate candidates are removed before the requested slate is returned.
- Eligibility is checked before weighted profile priority, so a vague idea
  cannot win merely by assigning itself high scores.
- This local quality value is not evidence, a market score, or a probability of
  success.

## Architecture and compatibility

- The user-facing one-click flow remains one action; its internal gates are now
  explicit and ordered.
- Windows and macOS packages embed the supervised Python intelligence worker;
  users do not need to install Python or Docker.
- The Python worker remains isolated, bounded, cancellable, and unable to write
  project state or alter SIFT's deterministic score.
- TypeScript still owns project mutation, evidence integrity, official scoring,
  stage gates, and decisions.
- Existing projects import safely. Older ideas receive blank values for the new
  fields until edited or regenerated.
- The deterministic 51-claim venture scoring engine and evidence policies are
  unchanged.
