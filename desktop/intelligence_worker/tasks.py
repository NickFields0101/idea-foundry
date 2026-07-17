"""Bounded intelligence tasks. Outputs are analysis, never customer validation."""

from __future__ import annotations

import json
from typing import Any, Callable

from .protocol import ProtocolError, RunRequest, clean_text


SYSTEM_PROMPT = """You are SIFT's competitor-analysis and red-team specialist.
Analyze only the idea and source excerpts supplied by the user. You do not have web access.
Never invent customer interviews, payments, production behavior, audits, measurements, citations,
or validation. Treat names and facts without a supplied source as model hypotheses. Be skeptical,
specific, concise, and actionable. Return one JSON object and no markdown.

Required schema:
{
  "summary": "string",
  "competitors": [{
    "name": "string", "category": "direct|indirect|substitute|do_nothing",
    "overlap": "string", "competitorAdvantage": "string", "ideaAdvantage": "string",
    "evidenceBasis": "provided_source|model_hypothesis", "sourceIds": ["source-id"],
    "confidence": "low|medium|high"
  }],
  "redTeam": {
    "fatalAssumptions": [{
      "assumption": "string", "failureMode": "string", "severity": "medium|high|critical",
      "rationale": "string"
    }],
    "counterarguments": ["string"],
    "disconfirmingTests": [{"test": "string", "signal": "string", "stopCondition": "string"}],
    "goForwardConditions": ["string"]
  },
  "confidence": "low|medium|high",
  "limitations": ["string"]
}"""


def _json_from_model(text: str) -> Any:
    candidate = text.strip()
    if candidate.startswith("```"):
        first_newline = candidate.find("\n")
        last_fence = candidate.rfind("```")
        if first_newline != -1 and last_fence > first_newline:
            candidate = candidate[first_newline + 1:last_fence].strip()
    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        raise ProtocolError("invalid_model_output", "The model did not return the required JSON analysis.") from None


def _strict_record(value: Any, keys: set[str], name: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != keys:
        raise ProtocolError("invalid_model_output", f"The model returned an invalid {name} structure.")
    return value


def _string(value: Any, name: str, maximum: int) -> str:
    try:
        return clean_text(value, name, maximum)
    except ProtocolError:
        raise ProtocolError("invalid_model_output", f"The model returned an invalid {name} value.") from None


def _choice(value: Any, choices: set[str], name: str) -> str:
    if value not in choices:
        raise ProtocolError("invalid_model_output", f"The model returned an invalid {name} value.")
    return value


def _strings(value: Any, name: str, *, maximum_items: int, maximum_chars: int) -> list[str]:
    if not isinstance(value, list) or len(value) > maximum_items:
        raise ProtocolError("invalid_model_output", f"The model returned an invalid {name} list.")
    return [_string(item, f"{name}[{index}]", maximum_chars) for index, item in enumerate(value)]


def validate_analysis(value: Any, allowed_source_ids: set[str]) -> dict[str, Any]:
    root = _strict_record(value, {"summary", "competitors", "redTeam", "confidence", "limitations"}, "analysis")
    raw_competitors = root["competitors"]
    if not isinstance(raw_competitors, list) or len(raw_competitors) > 12:
        raise ProtocolError("invalid_model_output", "The model returned too many competitors.")
    competitors = []
    for index, raw in enumerate(raw_competitors):
        item = _strict_record(
            raw,
            {
                "name", "category", "overlap", "competitorAdvantage", "ideaAdvantage",
                "evidenceBasis", "sourceIds", "confidence",
            },
            f"competitor {index + 1}",
        )
        basis = _choice(item["evidenceBasis"], {"provided_source", "model_hypothesis"}, "evidenceBasis")
        source_ids = _strings(item["sourceIds"], "sourceIds", maximum_items=12, maximum_chars=80)
        if any(source_id not in allowed_source_ids for source_id in source_ids):
            raise ProtocolError("invalid_model_output", "The model referenced an unknown source ID.")
        if basis == "provided_source" and not source_ids:
            raise ProtocolError("invalid_model_output", "A sourced competitor must reference a provided source.")
        if basis == "model_hypothesis" and source_ids:
            raise ProtocolError("invalid_model_output", "A model hypothesis cannot claim supplied-source support.")
        competitors.append(
            {
                "name": _string(item["name"], "competitor.name", 300),
                "category": _choice(item["category"], {"direct", "indirect", "substitute", "do_nothing"}, "category"),
                "overlap": _string(item["overlap"], "competitor.overlap", 1_500),
                "competitorAdvantage": _string(item["competitorAdvantage"], "competitor.competitorAdvantage", 1_500),
                "ideaAdvantage": _string(item["ideaAdvantage"], "competitor.ideaAdvantage", 1_500),
                "evidenceBasis": basis,
                "sourceIds": source_ids,
                "confidence": _choice(item["confidence"], {"low", "medium", "high"}, "confidence"),
            }
        )
    red_team = _strict_record(
        root["redTeam"],
        {"fatalAssumptions", "counterarguments", "disconfirmingTests", "goForwardConditions"},
        "redTeam",
    )
    raw_assumptions = red_team["fatalAssumptions"]
    if not isinstance(raw_assumptions, list) or len(raw_assumptions) > 12:
        raise ProtocolError("invalid_model_output", "The model returned invalid fatal assumptions.")
    assumptions = []
    for raw in raw_assumptions:
        item = _strict_record(raw, {"assumption", "failureMode", "severity", "rationale"}, "fatal assumption")
        assumptions.append(
            {
                "assumption": _string(item["assumption"], "assumption", 1_000),
                "failureMode": _string(item["failureMode"], "failureMode", 1_000),
                "severity": _choice(item["severity"], {"medium", "high", "critical"}, "severity"),
                "rationale": _string(item["rationale"], "rationale", 1_500),
            }
        )
    raw_tests = red_team["disconfirmingTests"]
    if not isinstance(raw_tests, list) or len(raw_tests) > 12:
        raise ProtocolError("invalid_model_output", "The model returned invalid disconfirming tests.")
    tests = []
    for raw in raw_tests:
        item = _strict_record(raw, {"test", "signal", "stopCondition"}, "disconfirming test")
        tests.append(
            {
                "test": _string(item["test"], "test", 1_500),
                "signal": _string(item["signal"], "signal", 1_000),
                "stopCondition": _string(item["stopCondition"], "stopCondition", 1_000),
            }
        )
    return {
        "summary": _string(root["summary"], "summary", 3_000),
        "competitors": competitors,
        "redTeam": {
            "fatalAssumptions": assumptions,
            "counterarguments": _strings(red_team["counterarguments"], "counterarguments", maximum_items=12, maximum_chars=1_500),
            "disconfirmingTests": tests,
            "goForwardConditions": _strings(red_team["goForwardConditions"], "goForwardConditions", maximum_items=12, maximum_chars=1_500),
        },
        "confidence": _choice(root["confidence"], {"low", "medium", "high"}, "confidence"),
        "limitations": _strings(root["limitations"], "limitations", maximum_items=12, maximum_chars=1_500),
    }


def run_competitor_red_team(
    request: RunRequest,
    call_model: Callable[..., str],
    *,
    timeout_seconds: float,
) -> dict[str, Any]:
    payload = json.dumps(request.input, ensure_ascii=False, separators=(",", ":"))
    response = call_model(
        request.model,
        [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Analyze this SIFT idea packet:\n{payload}"},
        ],
        timeout_seconds=timeout_seconds,
        output_limit=request.budget.max_output_chars,
    )
    analysis = validate_analysis(
        _json_from_model(response),
        {source["id"] for source in request.input["sources"]},
    )
    return {
        "task": "competitor_red_team",
        "provisional": True,
        "evidenceKind": "public_context",
        "customerValidation": False,
        "analysis": analysis,
    }
