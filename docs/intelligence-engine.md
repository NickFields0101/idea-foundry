# SIFT intelligence engine

SIFT uses a hybrid desktop architecture. TypeScript and Electron remain the
trusted application kernel; a supervised Python sidecar performs bounded,
non-authoritative intelligence work.

## Responsibility boundary

TypeScript/Electron owns:

- the interface, canonical project state, and workflow transitions;
- operating-system-protected model credentials and endpoint policy;
- validation of every worker request, event, and result;
- evidence provenance, grade ceilings, and human-verification rules;
- deterministic thesis screening, review scoring, gates, and decisions; and
- worker lifecycle, timeouts, cancellation, and fallback behavior.

Python owns:

- a bounded competitor and alternative analysis;
- assumptions, contradictions, and red-team challenges;
- falsification and validation-test proposals;
- synthesis of supplied public context; and
- structured progress for longer-running intelligence tasks.

The worker never writes project storage, changes a deterministic score, verifies
evidence, executes a build tool, signs a transaction, or receives wallet
material. Its output is provisional. For a newly generated idea, public context
is not customer validation and cannot imply interviews, commitments, payments,
production use, or audits.

## Local protocol

Electron supervises one worker process and communicates over newline-delimited
JSON on private standard input/output. No local network server or listening port
is created. Every message uses protocol `sift-intelligence/1`, a bounded run ID,
and an allowlisted message shape. Progress is exposed to the sandboxed renderer
through polling-only IPC; the renderer receives neither process authority nor a
model credential.

In development, Electron launches the repository-owned `intelligence_worker`
module with the current Python interpreter. Packaged applications use only the
native worker embedded in the application resources. They never execute an
arbitrary system Python binary or user-selected script.

## Failure behavior

The intelligence phase is additive. If the worker is missing, incompatible,
times out, crashes, or returns invalid output, Electron terminates it and the
existing TypeScript Generate & Screen workflow continues. A worker failure is
reported as skipped provisional analysis—not as failed customer validation.

## Development

Run the Python protocol tests:

```bash
npm run intelligence:test
```

Release jobs install the pinned PyInstaller version and build a native worker on
Windows x64, macOS x64, and macOS arm64. `npm run intelligence:build` creates the
worker for the current machine, and `npm run intelligence:smoke` verifies the
packaged protocol handshake. Normal SIFT users do not install Python.
