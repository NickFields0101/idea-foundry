# SIFT v0.11.2

Version 0.11.2 fixes slow-model timeouts in the Create-to-Build workflow, especially when using Claude Opus 4.6 through OpenRouter.

## Slow-model recovery

- Gives each Idea Forge pass its own bounded time budget and reserves time for the final hypothesis pass.
- Uses low-effort reasoning for Claude 4.6 automated workflow calls without applying Claude-specific controls to other models.
- Replaces the full-size standard-generator retry with one smaller recovery request using the same selected model.
- Reports whether Idea Forge, standard generation, or evaluation actually timed out.

## Resume instead of restart

- Checkpoints completed idea generation and public research for the current session.
- A retry after a later evaluation timeout resumes from the completed work instead of regenerating the idea slate.
- Clears checkpoints whenever the project, prompt, or model configuration changes.

## Regression coverage

- Adds timeout-chain, stage-budget, checkpoint, and cross-model compatibility tests.
- Validates the embedded Python worker and packaged Windows application.

Windows and macOS packages are currently unsigned. Verify downloads with `SHA256SUMS.txt` from the release before bypassing operating-system warnings.
