"""A minimal OpenAI-compatible client with deliberately narrow network authority."""

from __future__ import annotations

import json
from typing import Any
import urllib.error
import urllib.request

from .protocol import ModelConfig, ProtocolError


MAX_HTTP_RESPONSE_BYTES = 2_000_000


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, file_pointer, code, message, headers, new_url):  # noqa: ANN001
        raise ProtocolError("provider_redirect", "The model endpoint attempted an unsupported redirect.")


def _completion_url(base_url: str) -> str:
    if base_url.endswith("/chat/completions"):
        return base_url
    return f"{base_url.rstrip('/')}/chat/completions"


def _parse_content(payload: Any, output_limit: int) -> str:
    try:
        content = payload["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise ProtocolError("invalid_model_output", "The model returned an unsupported response.") from exc
    if not isinstance(content, str) or not content.strip():
        raise ProtocolError("invalid_model_output", "The model returned an empty response.")
    if len(content) > output_limit:
        raise ProtocolError("output_too_large", "The model response exceeded the run budget.")
    return content.strip()


def chat_completion(
    config: ModelConfig,
    messages: list[dict[str, str]],
    *,
    timeout_seconds: float,
    output_limit: int,
) -> str:
    """Call exactly the endpoint approved in the request; never read credentials elsewhere."""

    body = json.dumps(
        {
            "model": config.model,
            "messages": messages,
            "temperature": config.temperature,
            "max_tokens": config.max_tokens,
        },
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "User-Agent": "SIFT-Intelligence-Worker/0.1",
    }
    if config.api_key:
        headers["Authorization"] = f"Bearer {config.api_key}"
    request = urllib.request.Request(_completion_url(config.base_url), data=body, headers=headers, method="POST")
    opener = urllib.request.build_opener(_NoRedirect())
    try:
        with opener.open(request, timeout=max(1.0, timeout_seconds)) as response:
            raw = response.read(MAX_HTTP_RESPONSE_BYTES + 1)
    except ProtocolError:
        raise
    except urllib.error.HTTPError as exc:
        # Never echo the provider response: it can contain submitted prompt material or credentials.
        if exc.code == 401:
            raise ProtocolError("authentication_failed", "The model endpoint rejected its credentials.") from None
        if exc.code == 402:
            raise ProtocolError("credits_required", "The model provider requires credits or a higher spending limit.") from None
        if exc.code == 429:
            raise ProtocolError("rate_limited", "The model endpoint is temporarily rate limited.", retryable=True) from None
        if exc.code >= 500:
            raise ProtocolError("provider_unavailable", "The model endpoint is temporarily unavailable.", retryable=True) from None
        raise ProtocolError("provider_error", "The model endpoint rejected the request.") from None
    except (urllib.error.URLError, TimeoutError, OSError):
        raise ProtocolError("provider_unavailable", "The model endpoint could not be reached.", retryable=True) from None
    if len(raw) > MAX_HTTP_RESPONSE_BYTES:
        raise ProtocolError("provider_response_too_large", "The model endpoint returned too much data.")
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise ProtocolError("invalid_model_output", "The model endpoint returned invalid JSON.") from None
    return _parse_content(payload, output_limit)
