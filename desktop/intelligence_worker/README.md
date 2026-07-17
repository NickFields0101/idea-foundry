# SIFT intelligence worker

This directory contains the bounded Python sidecar for SIFT's intelligence layer. It uses only
the Python standard library. It is not the scoring authority: deterministic scoring, evidence
grades, stage gates, project mutation, secrets storage, and user approvals remain in Electron and
TypeScript.

## Process contract

Launch from the repository root:

```text
python -m desktop.intelligence_worker
```

stdin and stdout are newline-delimited JSON. stdout is reserved for protocol messages. The worker
first emits:

```json
{"protocol":"sift-intelligence/1","type":"ready","workerVersion":"0.2.0","capabilities":["ping","health","run","competitor_red_team","idea_forge","cancel"]}
```

Ping and health requests use the common envelope:

```json
{"protocol":"sift-intelligence/1","type":"request","id":"health-1","method":"health","params":{}}
```

A bounded analysis run is:

```json
{
  "protocol": "sift-intelligence/1",
  "type": "request",
  "id": "run-01",
  "method": "run",
  "params": {
    "task": "competitor_red_team",
    "input": {
      "title": "Example idea",
      "description": "What it does and why",
      "targetCustomer": "Optional",
      "protocolRoute": "Optional",
      "context": "Optional",
      "knownCompetitors": [],
      "sources": [{"id":"src-1","title":"Source","url":"https://example.org/report","excerpt":"Exact supplied excerpt"}]
    },
    "model": {
      "provider": "openai_compatible",
      "approvedByUser": true,
      "baseUrl": "https://approved.example/v1",
      "model": "provider/model-id",
      "apiKey": "request-only secret",
      "temperature": 0.2,
      "maxTokens": 2500
    },
    "budget": {
      "timeoutMs": 60000,
      "maxSteps": 8,
      "maxModelCalls": 1,
      "maxInputChars": 30000,
      "maxOutputChars": 16000
    }
  }
}
```

The API key may only arrive inside this stdin request. The worker does not read keys from argv or
the environment and never writes them to events, errors, files, or logs. Remote endpoints require
HTTPS; plain HTTP is allowed only for localhost. Redirects are refused.

Progress messages contain `id`, monotonic `seq`, `stage`, `percent`, and `message`. A run ends with
exactly one `result` or `error` message. Cancel with:

```json
{"protocol":"sift-intelligence/1","type":"cancel","id":"run-01"}
```

The terminal result is explicitly bounded:

```json
{
  "task": "competitor_red_team",
  "provisional": true,
  "evidenceKind": "public_context",
  "customerValidation": false,
  "analysis": {
    "summary": "...",
    "competitors": [],
    "redTeam": {
      "fatalAssumptions": [],
      "counterarguments": [],
      "disconfirmingTests": [],
      "goForwardConditions": []
    },
    "confidence": "low",
    "limitations": []
  },
  "usage": {"modelCalls": 1, "steps": 4, "elapsedMs": 1000}
}
```

This output is public-context analysis, not customer evidence. It cannot establish interviews,
commitments, payments, production usage, audits, or customer validation. Supplied source excerpts
may support a competitor statement; everything else must remain labeled `model_hypothesis`.

## Idea forge

`idea_forge` is a three-pass hypothesis generator. It first creates problem-mechanism frames, then
diverges into a larger raw candidate set, and finally runs an independent critique and revision
pass. Every intermediate model response is schema-validated before the next pass begins. A failed
or cancelled pass cannot silently fall through to a later pass.

Its exact task input is:

```json
{
  "opportunityBoundary": "Required opportunity or problem boundary",
  "requestedCount": 4,
  "profile": {
    "mode": "neutral",
    "searchThemes": [{"label":"Optional private theme","weight":75}],
    "fitDimensions": [{"label":"Optional fit criterion","weight":60}],
    "workStylePreferences": [{"label":"Collaboration","orientation":"Prefers small teams"}]
  }
}
```

`requestedCount` is 1 through 12. Profile child arrays contain no raw personality scores and have
at most 20 entries each. Weights are preference weights from 0 through 100. Neutral mode requires
the final `personalFit` estimates to be `null`; private mode uses only the explicitly supplied
labels and orientations.

The three-pass task defaults to a 180-second, 16-step, three-model-call budget. It returns exactly
the requested number of unique ideas:

```json
{
  "task": "idea_forge",
  "provisional": true,
  "evidenceKind": "hypothesis",
  "customerValidation": false,
  "pipelineVersion": "idea-forge/1.0.0",
  "ideas": [{
    "title": "...",
    "concept": "...",
    "user": "...",
    "buyer": "...",
    "triggeringSituation": "...",
    "currentAlternative": "...",
    "materialConsequence": "...",
    "whyNow": "Explicitly hypothetical...",
    "distributionWedge": "...",
    "adoptionFriction": "...",
    "protocolNeed": "...",
    "protocolCounterfactual": "A conventional alternative...",
    "failureReason": "...",
    "criticalAssumption": "...",
    "experiment": "...",
    "experimentPlan": {
      "durationDays": 7,
      "method": "concierge",
      "target": "...",
      "sampleSize": 8,
      "artifact": "...",
      "metric": "...",
      "passThreshold": "...",
      "killThreshold": "..."
    },
    "route": "Neither yet",
    "scores": {
      "personalFit": null,
      "opportunitySignal": 60,
      "protocolAffordance": 10,
      "experimentability": 80
    }
  }],
  "diagnostics": {
    "framesGenerated": 8,
    "rawCandidatesGenerated": 12,
    "candidatesReturned": 4,
    "method": "frame-diverge-critique"
  }
}
```

Routes are `Xahau`, `Evernode`, `Both`, or `Neither yet`. Xahau routes must identify an account
Hook or native-ledger affordance; Evernode routes must identify decentralized hosting or
HotPocket execution; a Both route must state separate `Xahau role:` and `Evernode role:` clauses.
Every route must include a conventional counterfactual. These are provisional exploration
estimates, not market evidence, customer validation, or official deterministic SIFT scores.
