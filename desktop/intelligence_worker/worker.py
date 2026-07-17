"""JSONL process host for the SIFT intelligence sidecar."""

from __future__ import annotations

import json
import sys
import threading
import time
from typing import Any, Callable, TextIO

from .idea_forge import run_idea_forge
from .model_client import chat_completion
from .protocol import (
    CAPABILITIES,
    PROTOCOL,
    WORKER_VERSION,
    CancelledError,
    ProtocolError,
    RunRequest,
    validate_envelope,
    validate_run_request,
)
from .tasks import run_competitor_red_team


MAX_LINE_CHARS = 100_000
MAX_ACTIVE_RUNS = 2


class _RunState:
    def __init__(self, request: RunRequest):
        self.request = request
        self.cancelled = threading.Event()
        self.started = time.monotonic()
        self.sequence = 0
        self.steps = 0
        self.model_calls = 0


class Worker:
    def __init__(
        self,
        output: TextIO,
        *,
        model_client: Callable[..., str] = chat_completion,
    ):
        self._output = output
        self._model_client = model_client
        self._write_lock = threading.Lock()
        self._runs_lock = threading.Lock()
        self._runs: dict[str, _RunState] = {}

    def emit(self, message: dict[str, Any]) -> None:
        # Protocol messages never contain provider credentials. Keep stdout machine-only.
        encoded = json.dumps(message, ensure_ascii=False, separators=(",", ":"))
        with self._write_lock:
            self._output.write(encoded + "\n")
            self._output.flush()

    def ready(self) -> None:
        self.emit(
            {
                "protocol": PROTOCOL,
                "type": "ready",
                "workerVersion": WORKER_VERSION,
                "capabilities": list(CAPABILITIES),
            }
        )

    def _progress(
        self,
        state: _RunState,
        stage: str,
        percent: int,
        message: str,
        detail: dict[str, Any] | None = None,
    ) -> None:
        state.sequence += 1
        event: dict[str, Any] = {
            "protocol": PROTOCOL,
            "type": "progress",
            "id": state.request.run_id,
            "seq": state.sequence,
            "stage": stage,
            "percent": percent,
            "message": message,
        }
        if detail:
            event["detail"] = detail
        self.emit(event)

    def _result(self, run_id: str, result: dict[str, Any]) -> None:
        self.emit({"protocol": PROTOCOL, "type": "result", "id": run_id, "result": result})

    def _error(self, run_id: str, error: ProtocolError) -> None:
        self.emit(
            {
                "protocol": PROTOCOL,
                "type": "error",
                "id": run_id,
                "error": {
                    "code": error.code,
                    "message": error.public_message,
                    "retryable": error.retryable,
                },
            }
        )

    def _check(self, state: _RunState) -> None:
        if state.cancelled.is_set():
            raise CancelledError()
        elapsed_ms = int((time.monotonic() - state.started) * 1_000)
        if elapsed_ms >= state.request.budget.timeout_ms:
            raise ProtocolError("budget_exceeded", "The intelligence run exceeded its time budget.", retryable=True)
        state.steps += 1
        if state.steps > state.request.budget.max_steps:
            raise ProtocolError("budget_exceeded", "The intelligence run exceeded its step budget.")

    def _remaining_seconds(self, state: _RunState) -> float:
        elapsed_ms = int((time.monotonic() - state.started) * 1_000)
        return max(1.0, (state.request.budget.timeout_ms - elapsed_ms) / 1_000)

    def _execute(self, state: _RunState) -> None:
        run_id = state.request.run_id
        try:
            self._progress(
                state,
                "validating",
                5 if state.request.task == "idea_forge" else 10,
                "Validated the bounded intelligence request.",
            )
            self._check(state)

            if state.request.task == "idea_forge":
                def call_stage(
                    stage: str,
                    percent: int,
                    message: str,
                    messages: list[dict[str, str]],
                ) -> str:
                    self._check(state)
                    if state.model_calls >= state.request.budget.max_model_calls:
                        raise ProtocolError("budget_exceeded", "The intelligence run exceeded its model-call budget.")
                    state.model_calls += 1
                    self._progress(state, stage, percent, message, {"pass": state.model_calls, "passes": 3})
                    response = self._model_client(
                        state.request.model,
                        messages,
                        timeout_seconds=self._remaining_seconds(state),
                        output_limit=state.request.budget.max_output_chars,
                    )
                    self._check(state)
                    return response

                result = run_idea_forge(state.request, call_stage)
                validation_message = "Validating idea diversity, experiments, scores, and protocol consistency."
            else:
                self._progress(state, "preparing", 25, "Preparing competitor and red-team context.")
                self._check(state)
                if state.model_calls >= state.request.budget.max_model_calls:
                    raise ProtocolError("budget_exceeded", "The intelligence run exceeded its model-call budget.")
                state.model_calls += 1
                self._progress(state, "model", 45, "Running the approved model analysis.")
                result = run_competitor_red_team(
                    state.request,
                    self._model_client,
                    timeout_seconds=self._remaining_seconds(state),
                )
                self._check(state)
                validation_message = "Validating provisional analysis and source boundaries."

            self._progress(
                state,
                "validating_output",
                92 if state.request.task == "idea_forge" else 90,
                validation_message,
            )
            self._check(state)
            elapsed_ms = int((time.monotonic() - state.started) * 1_000)
            result["usage"] = {
                "modelCalls": state.model_calls,
                "steps": state.steps,
                "elapsedMs": elapsed_ms,
            }
            completion_message = (
                "Idea hypotheses are ready for deterministic screening."
                if state.request.task == "idea_forge"
                else "Competitor and red-team analysis is ready."
            )
            self._progress(state, "complete", 100, completion_message)
            self._result(run_id, result)
        except ProtocolError as error:
            self._error(run_id, error)
        except Exception:
            # Do not expose stack traces, request data, endpoint bodies, or secrets over IPC.
            self._error(run_id, ProtocolError("internal_error", "The intelligence worker could not complete the run."))
        finally:
            with self._runs_lock:
                self._runs.pop(run_id, None)

    def start(self, message: dict[str, Any]) -> None:
        request = validate_run_request(message)
        with self._runs_lock:
            if request.run_id in self._runs:
                raise ProtocolError("duplicate_run", "A run with this id is already active.")
            if len(self._runs) >= MAX_ACTIVE_RUNS:
                raise ProtocolError("worker_busy", "The intelligence worker is busy.", retryable=True)
            state = _RunState(request)
            self._runs[request.run_id] = state
        thread = threading.Thread(target=self._execute, args=(state,), name="sift-intelligence-run", daemon=True)
        thread.start()

    def cancel(self, run_id: str) -> None:
        with self._runs_lock:
            state = self._runs.get(run_id)
        if state is None:
            raise ProtocolError("run_not_found", "No active intelligence run has this id.")
        state.cancelled.set()
        self._progress(state, "cancelling", min(99, max(1, state.sequence * 10)), "Cancellation requested.")

    def health(self, request_id: str, *, ping: bool) -> None:
        with self._runs_lock:
            active_runs = len(self._runs)
        self._result(
            request_id,
            {
                "ok": True,
                "kind": "pong" if ping else "health",
                "workerVersion": WORKER_VERSION,
                "activeRuns": active_runs,
                "capacity": MAX_ACTIVE_RUNS,
                "capabilities": list(CAPABILITIES),
            },
        )

    def handle(self, raw_message: Any) -> None:
        run_id = raw_message.get("id", "invalid") if isinstance(raw_message, dict) else "invalid"
        try:
            message = validate_envelope(raw_message)
            run_id = message["id"]
            if message["type"] == "cancel":
                self.cancel(run_id)
            elif message["method"] == "run":
                self.start(message)
            else:
                self.health(run_id, ping=message["method"] == "ping")
        except ProtocolError as error:
            safe_id = run_id if isinstance(run_id, str) and 0 < len(run_id) <= 128 else "invalid"
            self._error(safe_id, error)


def serve(input_stream: TextIO = sys.stdin, output_stream: TextIO = sys.stdout) -> None:
    worker = Worker(output_stream)
    worker.ready()
    for line in input_stream:
        if len(line) > MAX_LINE_CHARS:
            worker._error("invalid", ProtocolError("request_too_large", "The request line exceeds its size limit."))
            continue
        try:
            message = json.loads(line)
        except json.JSONDecodeError:
            worker._error("invalid", ProtocolError("invalid_json", "The worker request is not valid JSON."))
            continue
        worker.handle(message)


def main() -> None:
    serve()


if __name__ == "__main__":
    main()
