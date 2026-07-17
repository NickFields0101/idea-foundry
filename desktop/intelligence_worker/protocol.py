"""Protocol validation for the SIFT intelligence worker.

This module deliberately has no third-party dependencies.  The renderer never talks
to it directly; the Electron main process owns the child process and validates the
messages again at the application trust boundary.
"""

from __future__ import annotations

from dataclasses import dataclass
import ipaddress
import json
import re
from typing import Any
from urllib.parse import urlsplit, urlunsplit


PROTOCOL = "sift-intelligence/1"
WORKER_VERSION = "0.2.0"
CAPABILITIES = ("ping", "health", "run", "competitor_red_team", "idea_forge", "cancel")

_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
_CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_LOCAL_HOSTS = frozenset(("localhost", "127.0.0.1", "::1"))


class ProtocolError(Exception):
    """A caller-safe validation or execution error."""

    def __init__(self, code: str, message: str, *, retryable: bool = False):
        super().__init__(message)
        self.code = code
        self.public_message = message
        self.retryable = retryable


class CancelledError(ProtocolError):
    def __init__(self):
        super().__init__("cancelled", "The intelligence run was cancelled.")


@dataclass(frozen=True)
class Budget:
    timeout_ms: int = 60_000
    max_steps: int = 8
    max_model_calls: int = 1
    max_input_chars: int = 30_000
    max_output_chars: int = 16_000


@dataclass(frozen=True)
class ModelConfig:
    base_url: str
    model: str
    api_key: str
    temperature: float
    max_tokens: int


@dataclass(frozen=True)
class RunRequest:
    run_id: str
    task: str
    input: dict[str, Any]
    model: ModelConfig
    budget: Budget


def _record(value: Any, name: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ProtocolError("invalid_request", f"{name} must be an object.")
    return value


def _only(record: dict[str, Any], allowed: set[str], name: str) -> None:
    unexpected = sorted(set(record) - allowed)
    if unexpected:
        raise ProtocolError("invalid_request", f"{name} contains unsupported fields.")


def clean_text(value: Any, name: str, maximum: int, *, required: bool = True) -> str:
    if not isinstance(value, str):
        if not required and value is None:
            return ""
        raise ProtocolError("invalid_request", f"{name} must be text.")
    result = _CONTROL_RE.sub(" ", value).strip()
    if required and not result:
        raise ProtocolError("invalid_request", f"{name} is required.")
    if len(result) > maximum:
        raise ProtocolError("input_too_large", f"{name} exceeds its size limit.")
    return result


def validate_id(value: Any) -> str:
    if not isinstance(value, str) or not _ID_RE.fullmatch(value):
        raise ProtocolError("invalid_request", "id must be a short opaque identifier.")
    return value


def validate_envelope(message: Any) -> dict[str, Any]:
    record = _record(message, "message")
    if record.get("protocol") != PROTOCOL:
        raise ProtocolError("unsupported_protocol", f"Use protocol {PROTOCOL}.")
    message_type = record.get("type")
    if message_type == "cancel":
        _only(record, {"protocol", "type", "id"}, "cancel message")
        validate_id(record.get("id"))
        return record
    if message_type != "request":
        raise ProtocolError("invalid_request", "type must be request or cancel.")
    _only(record, {"protocol", "type", "id", "method", "params"}, "request")
    validate_id(record.get("id"))
    if record.get("method") not in {"ping", "health", "run"}:
        raise ProtocolError("unknown_method", "The requested worker method is not supported.")
    params = record.get("params", {})
    if not isinstance(params, dict):
        raise ProtocolError("invalid_request", "params must be an object.")
    if record["method"] in {"ping", "health"} and params:
        raise ProtocolError("invalid_request", f"{record['method']} does not accept parameters.")
    return record


def _bounded_int(record: dict[str, Any], key: str, default: int, minimum: int, maximum: int) -> int:
    value = record.get(key, default)
    if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= maximum:
        raise ProtocolError("invalid_budget", f"budget.{key} is outside its allowed range.")
    return value


def validate_budget(value: Any, *, task: str = "competitor_red_team") -> Budget:
    defaults = Budget() if task == "competitor_red_team" else Budget(
        timeout_ms=180_000,
        max_steps=16,
        max_model_calls=3,
        max_input_chars=60_000,
        max_output_chars=60_000,
    )
    if value is None:
        return defaults
    record = _record(value, "budget")
    _only(
        record,
        {"timeoutMs", "maxSteps", "maxModelCalls", "maxInputChars", "maxOutputChars"},
        "budget",
    )
    return Budget(
        timeout_ms=_bounded_int(record, "timeoutMs", defaults.timeout_ms, 1_000, 180_000),
        max_steps=_bounded_int(record, "maxSteps", defaults.max_steps, 4, 16),
        max_model_calls=_bounded_int(record, "maxModelCalls", defaults.max_model_calls, 1, 3),
        max_input_chars=_bounded_int(record, "maxInputChars", defaults.max_input_chars, 1_000, 60_000),
        max_output_chars=_bounded_int(record, "maxOutputChars", defaults.max_output_chars, 1_000, 60_000),
    )


def _normalize_base_url(value: Any) -> str:
    raw = clean_text(value, "model.baseUrl", 2_048)
    try:
        parsed = urlsplit(raw)
        port = parsed.port
    except ValueError as exc:
        raise ProtocolError("invalid_endpoint", "The model endpoint is invalid.") from exc
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ProtocolError("invalid_endpoint", "The model endpoint must use HTTP or HTTPS.")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ProtocolError("invalid_endpoint", "The model endpoint must be a plain base URL.")
    host = parsed.hostname.lower()
    if parsed.scheme == "http" and host not in _LOCAL_HOSTS:
        raise ProtocolError("insecure_endpoint", "Remote model endpoints must use HTTPS.")
    if host not in _LOCAL_HOSTS:
        try:
            address = ipaddress.ip_address(host)
        except ValueError:
            address = None
        if address is not None and not address.is_global:
            raise ProtocolError("private_endpoint", "Private-network model endpoints must use localhost.")
    netloc = f"[{host}]" if ":" in host else host
    if port is not None:
        netloc = f"{netloc}:{port}"
    path = parsed.path.rstrip("/")
    return urlunsplit((parsed.scheme, netloc, path, "", ""))


def validate_model(value: Any, *, default_max_tokens: int = 2_500) -> ModelConfig:
    record = _record(value, "model")
    _only(
        record,
        {"provider", "approvedByUser", "baseUrl", "model", "apiKey", "temperature", "maxTokens"},
        "model",
    )
    if record.get("provider") != "openai_compatible" or record.get("approvedByUser") is not True:
        raise ProtocolError(
            "endpoint_not_approved",
            "The model endpoint must be explicitly approved by the user.",
        )
    base_url = _normalize_base_url(record.get("baseUrl"))
    model = clean_text(record.get("model"), "model.model", 200)
    api_key = clean_text(record.get("apiKey", ""), "model.apiKey", 8_192, required=False)
    host = urlsplit(base_url).hostname or ""
    if host not in _LOCAL_HOSTS and not api_key:
        raise ProtocolError("missing_credentials", "The remote model endpoint requires an API key.")
    temperature = record.get("temperature", 0.2)
    if isinstance(temperature, bool) or not isinstance(temperature, (int, float)) or not 0 <= temperature <= 1:
        raise ProtocolError("invalid_request", "model.temperature must be between 0 and 1.")
    max_tokens = record.get("maxTokens", default_max_tokens)
    if isinstance(max_tokens, bool) or not isinstance(max_tokens, int) or not 256 <= max_tokens <= 16_000:
        raise ProtocolError("invalid_request", "model.maxTokens is outside its allowed range.")
    return ModelConfig(base_url, model, api_key, float(temperature), max_tokens)


def _safe_public_url(value: Any, name: str) -> str:
    url = clean_text(value, name, 2_048)
    try:
        parsed = urlsplit(url)
    except ValueError as exc:
        raise ProtocolError("invalid_source", f"{name} is not a valid public URL.") from exc
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise ProtocolError("invalid_source", f"{name} must be a public HTTPS URL.")
    host = parsed.hostname.lower()
    if host in _LOCAL_HOSTS or host.endswith(".localhost") or host.endswith(".local"):
        raise ProtocolError("invalid_source", f"{name} must be a public HTTPS URL.")
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        address = None
    if address is not None and not address.is_global:
        raise ProtocolError("invalid_source", f"{name} must be a public HTTPS URL.")
    return url


def validate_task_input(value: Any, budget: Budget) -> dict[str, Any]:
    record = _record(value, "input")
    _only(
        record,
        {
            "title",
            "description",
            "targetCustomer",
            "protocolRoute",
            "context",
            "knownCompetitors",
            "sources",
        },
        "input",
    )
    result: dict[str, Any] = {
        "title": clean_text(record.get("title"), "input.title", 300),
        "description": clean_text(record.get("description"), "input.description", 8_000),
        "targetCustomer": clean_text(record.get("targetCustomer", ""), "input.targetCustomer", 1_000, required=False),
        "protocolRoute": clean_text(record.get("protocolRoute", ""), "input.protocolRoute", 100, required=False),
        "context": clean_text(record.get("context", ""), "input.context", 12_000, required=False),
    }
    competitors = record.get("knownCompetitors", [])
    if not isinstance(competitors, list) or len(competitors) > 20:
        raise ProtocolError("invalid_request", "input.knownCompetitors must contain at most 20 items.")
    result["knownCompetitors"] = [
        clean_text(item, f"input.knownCompetitors[{index}]", 300)
        for index, item in enumerate(competitors)
    ]
    sources = record.get("sources", [])
    if not isinstance(sources, list) or len(sources) > 12:
        raise ProtocolError("invalid_request", "input.sources must contain at most 12 items.")
    normalized_sources = []
    seen_ids: set[str] = set()
    for index, source_value in enumerate(sources):
        source = _record(source_value, f"input.sources[{index}]")
        _only(source, {"id", "title", "url", "excerpt"}, f"input.sources[{index}]")
        source_id = clean_text(source.get("id"), f"input.sources[{index}].id", 80)
        if not _ID_RE.fullmatch(source_id) or source_id in seen_ids:
            raise ProtocolError("invalid_source", "Source IDs must be unique opaque identifiers.")
        seen_ids.add(source_id)
        normalized_sources.append(
            {
                "id": source_id,
                "title": clean_text(source.get("title"), f"input.sources[{index}].title", 300),
                "url": _safe_public_url(source.get("url"), f"input.sources[{index}].url"),
                "excerpt": clean_text(source.get("excerpt"), f"input.sources[{index}].excerpt", 4_000),
            }
        )
    result["sources"] = normalized_sources
    total_chars = len(str(result))
    if total_chars > budget.max_input_chars:
        raise ProtocolError("input_too_large", "The task input exceeds the run budget.")
    return result


def _weight(value: Any, name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ProtocolError("invalid_request", f"{name} must be a number between 0 and 100.")
    number = float(value)
    if not 0 <= number <= 100:
        raise ProtocolError("invalid_request", f"{name} must be a number between 0 and 100.")
    return number


def _weighted_labels(value: Any, name: str) -> list[dict[str, Any]]:
    if not isinstance(value, list) or len(value) > 20:
        raise ProtocolError("invalid_request", f"{name} must contain at most 20 items.")
    result = []
    seen: set[str] = set()
    for index, raw in enumerate(value):
        item = _record(raw, f"{name}[{index}]")
        _only(item, {"label", "weight"}, f"{name}[{index}]")
        label = clean_text(item.get("label"), f"{name}[{index}].label", 200)
        normalized = label.casefold()
        if normalized in {
            "openness",
            "conscientiousness",
            "extraversion",
            "agreeableness",
            "neuroticism",
            "ocean score",
            "neo personality score",
        }:
            raise ProtocolError(
                "invalid_request",
                "Raw personality-test dimensions must be transformed into private preferences before idea generation.",
            )
        if normalized in seen:
            raise ProtocolError("invalid_request", f"{name} contains duplicate labels.")
        seen.add(normalized)
        result.append({"label": label, "weight": _weight(item.get("weight"), f"{name}[{index}].weight")})
    return result


def _work_styles(value: Any) -> list[dict[str, str]]:
    name = "input.profile.workStylePreferences"
    if not isinstance(value, list) or len(value) > 20:
        raise ProtocolError("invalid_request", f"{name} must contain at most 20 items.")
    result = []
    seen: set[str] = set()
    for index, raw in enumerate(value):
        item = _record(raw, f"{name}[{index}]")
        _only(item, {"label", "orientation"}, f"{name}[{index}]")
        label = clean_text(item.get("label"), f"{name}[{index}].label", 200)
        normalized = label.casefold()
        if normalized in seen:
            raise ProtocolError("invalid_request", f"{name} contains duplicate labels.")
        seen.add(normalized)
        result.append(
            {
                "label": label,
                "orientation": clean_text(item.get("orientation"), f"{name}[{index}].orientation", 300),
            }
        )
    return result


def validate_idea_forge_input(value: Any, budget: Budget) -> dict[str, Any]:
    record = _record(value, "input")
    _only(record, {"opportunityBoundary", "requestedCount", "profile"}, "input")
    requested_count = record.get("requestedCount")
    if isinstance(requested_count, bool) or not isinstance(requested_count, int) or not 1 <= requested_count <= 12:
        raise ProtocolError("invalid_request", "input.requestedCount must be an integer from 1 through 12.")
    profile = _record(record.get("profile"), "input.profile")
    _only(profile, {"mode", "searchThemes", "fitDimensions", "workStylePreferences"}, "input.profile")
    mode = profile.get("mode")
    if mode not in {"neutral", "private"}:
        raise ProtocolError("invalid_request", "input.profile.mode must be neutral or private.")
    result = {
        "opportunityBoundary": clean_text(
            record.get("opportunityBoundary"),
            "input.opportunityBoundary",
            12_000,
        ),
        "requestedCount": requested_count,
        "profile": {
            "mode": mode,
            "searchThemes": _weighted_labels(profile.get("searchThemes"), "input.profile.searchThemes"),
            "fitDimensions": _weighted_labels(profile.get("fitDimensions"), "input.profile.fitDimensions"),
            "workStylePreferences": _work_styles(profile.get("workStylePreferences")),
        },
    }
    if len(json.dumps(result, ensure_ascii=False)) > budget.max_input_chars:
        raise ProtocolError("input_too_large", "The task input exceeds the run budget.")
    return result


def validate_run_request(message: dict[str, Any]) -> RunRequest:
    if message.get("method") != "run":
        raise ProtocolError("invalid_request", "Expected a run request.")
    params = _record(message.get("params"), "params")
    _only(params, {"task", "input", "model", "budget"}, "params")
    task = params.get("task")
    if task not in {"competitor_red_team", "idea_forge"}:
        raise ProtocolError("unknown_task", "The requested intelligence task is not supported.")
    budget = validate_budget(params.get("budget"), task=task)
    if task == "idea_forge" and budget.max_model_calls < 3:
        raise ProtocolError("invalid_budget", "idea_forge requires a budget of exactly three model calls.")
    task_input = (
        validate_idea_forge_input(params.get("input"), budget)
        if task == "idea_forge"
        else validate_task_input(params.get("input"), budget)
    )
    model = validate_model(params.get("model"), default_max_tokens=12_000 if task == "idea_forge" else 2_500)
    return RunRequest(validate_id(message.get("id")), task, task_input, model, budget)
