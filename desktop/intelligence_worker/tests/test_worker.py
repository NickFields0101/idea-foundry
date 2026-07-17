from __future__ import annotations

import io
import json
import subprocess
import sys
import threading
import time
import unittest

from desktop.intelligence_worker.protocol import PROTOCOL, ProtocolError, validate_envelope, validate_run_request
from desktop.intelligence_worker.tasks import validate_analysis
from desktop.intelligence_worker.worker import Worker


def valid_analysis() -> dict:
    return {
        "summary": "The idea has a plausible wedge but its urgency remains unvalidated.",
        "competitors": [
            {
                "name": "Manual workflow",
                "category": "do_nothing",
                "overlap": "The existing process addresses the same job.",
                "competitorAdvantage": "No switching cost.",
                "ideaAdvantage": "Potentially faster coordination.",
                "evidenceBasis": "model_hypothesis",
                "sourceIds": [],
                "confidence": "low",
            }
        ],
        "redTeam": {
            "fatalAssumptions": [
                {
                    "assumption": "The problem is frequent.",
                    "failureMode": "Users do not change behavior.",
                    "severity": "critical",
                    "rationale": "Frequency has not been observed.",
                }
            ],
            "counterarguments": ["The current workflow may be good enough."],
            "disconfirmingTests": [
                {
                    "test": "Run problem interviews.",
                    "signal": "Independent examples of the workflow.",
                    "stopCondition": "Fewer than three of ten report the problem.",
                }
            ],
            "goForwardConditions": ["Observe repeated problem behavior."],
        },
        "confidence": "low",
        "limitations": ["No customer evidence was supplied."],
    }


def run_message(run_id: str = "run-1", api_key: str = "super-secret") -> dict:
    return {
        "protocol": PROTOCOL,
        "type": "request",
        "id": run_id,
        "method": "run",
        "params": {
            "task": "competitor_red_team",
            "input": {"title": "Receipt bridge", "description": "Coordinate service receipts."},
            "model": {
                "provider": "openai_compatible",
                "approvedByUser": True,
                "baseUrl": "http://127.0.0.1:1234/v1",
                "model": "local-model",
                "apiKey": api_key,
            },
        },
    }


class ProtocolTests(unittest.TestCase):
    def test_ping_subprocess_emits_ready_and_pong(self):
        request = json.dumps(
            {"protocol": PROTOCOL, "type": "request", "id": "ping-1", "method": "ping", "params": {}}
        )
        completed = subprocess.run(
            [sys.executable, "-m", "desktop.intelligence_worker"],
            input=request + "\n",
            text=True,
            capture_output=True,
            timeout=5,
            check=True,
        )
        lines = [json.loads(line) for line in completed.stdout.splitlines()]
        self.assertEqual(lines[0]["type"], "ready")
        self.assertEqual(lines[1]["type"], "result")
        self.assertEqual(lines[1]["result"]["kind"], "pong")
        self.assertEqual(completed.stderr, "")

    def test_strict_request_rejects_unknown_fields_without_echoing_secret(self):
        message = run_message(api_key="never-echo-this")
        message["params"]["model"]["unexpected"] = "never-echo-this"
        with self.assertRaises(ProtocolError) as caught:
            validate_run_request(validate_envelope(message))
        self.assertNotIn("never-echo-this", caught.exception.public_message)

    def test_remote_http_and_unapproved_endpoint_fail_closed(self):
        message = run_message()
        message["params"]["model"]["baseUrl"] = "http://models.example.com/v1"
        with self.assertRaises(ProtocolError) as caught:
            validate_run_request(validate_envelope(message))
        self.assertEqual(caught.exception.code, "insecure_endpoint")
        message = run_message()
        message["params"]["model"]["approvedByUser"] = False
        with self.assertRaises(ProtocolError) as caught:
            validate_run_request(validate_envelope(message))
        self.assertEqual(caught.exception.code, "endpoint_not_approved")

    def test_analysis_cannot_fake_supplied_source_support(self):
        analysis = valid_analysis()
        analysis["competitors"][0]["evidenceBasis"] = "provided_source"
        with self.assertRaises(ProtocolError):
            validate_analysis(analysis, set())


class WorkerTests(unittest.TestCase):
    def test_run_emits_progress_and_provisional_non_customer_result(self):
        output = io.StringIO()
        secret = "key-must-not-be-emitted"

        def fake_client(config, messages, **kwargs):
            self.assertEqual(config.api_key, secret)
            self.assertNotIn(secret, json.dumps(messages))
            return json.dumps(valid_analysis())

        worker = Worker(output, model_client=fake_client)
        worker.handle(run_message(api_key=secret))
        deadline = time.time() + 2
        while '"type":"result"' not in output.getvalue() and time.time() < deadline:
            time.sleep(0.01)
        transcript = output.getvalue()
        self.assertNotIn(secret, transcript)
        messages = [json.loads(line) for line in transcript.splitlines()]
        progress = [message for message in messages if message["type"] == "progress"]
        self.assertGreaterEqual(len(progress), 4)
        self.assertEqual([event["seq"] for event in progress], list(range(1, len(progress) + 1)))
        result = next(message["result"] for message in messages if message["type"] == "result")
        self.assertTrue(result["provisional"])
        self.assertEqual(result["evidenceKind"], "public_context")
        self.assertFalse(result["customerValidation"])

    def test_cancel_is_processed_while_model_call_is_active(self):
        output = io.StringIO()
        entered = threading.Event()
        release = threading.Event()

        def blocking_client(*args, **kwargs):
            entered.set()
            release.wait(1)
            return json.dumps(valid_analysis())

        worker = Worker(output, model_client=blocking_client)
        worker.handle(run_message("cancel-me"))
        self.assertTrue(entered.wait(1))
        worker.handle({"protocol": PROTOCOL, "type": "cancel", "id": "cancel-me"})
        release.set()
        deadline = time.time() + 2
        while '"code":"cancelled"' not in output.getvalue() and time.time() < deadline:
            time.sleep(0.01)
        messages = [json.loads(line) for line in output.getvalue().splitlines()]
        self.assertTrue(any(item["type"] == "progress" and item["stage"] == "cancelling" for item in messages))
        terminal = [item for item in messages if item["type"] in {"result", "error"}]
        self.assertEqual(len(terminal), 1)
        self.assertEqual(terminal[0]["error"]["code"], "cancelled")


if __name__ == "__main__":
    unittest.main()
