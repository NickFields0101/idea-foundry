from __future__ import annotations

import io
import json
import time
import unittest

from desktop.intelligence_worker.idea_forge import validate_final_ideas
from desktop.intelligence_worker.protocol import PROTOCOL, ProtocolError, validate_envelope, validate_run_request
from desktop.intelligence_worker.worker import Worker


def forge_message(run_id: str = "forge-1", requested_count: int = 2) -> dict:
    return {
        "protocol": PROTOCOL,
        "type": "request",
        "id": run_id,
        "method": "run",
        "params": {
            "task": "idea_forge",
            "input": {
                "opportunityBoundary": "Reduce coordination failures for independent outdoor fitness organizers.",
                "requestedCount": requested_count,
                "profile": {
                    "mode": "neutral",
                    "searchThemes": [],
                    "fitDimensions": [],
                    "workStylePreferences": [],
                },
            },
            "model": {
                "provider": "openai_compatible",
                "approvedByUser": True,
                "baseUrl": "http://127.0.0.1:1234/v1",
                "model": "local-model",
                "apiKey": "request-secret",
            },
        },
    }


def frames(count: int = 8) -> dict:
    return {
        "frames": [
            {
                "label": f"Frame {index}",
                "user": f"Organizer group {index}",
                "triggeringSituation": f"A route or attendance plan changes for group {index}.",
                "problemMechanism": "Information fragments across messages and informal tools.",
                "materialConsequence": "The organizer may waste time and participants may miss the activity.",
                "currentAlternative": "Group chats and manual spreadsheets.",
                "protocolPossibility": "Protocol use is unknown and must beat a conventional workflow.",
            }
            for index in range(count)
        ]
    }


def raw_candidates(count: int = 6) -> dict:
    return {
        "candidates": [
            {
                "title": f"Raw Candidate {index}",
                "frameLabel": f"Frame {index % 8}",
                "concept": f"Explore a bounded coordination mechanism {index}.",
                "user": f"Organizer group {index}",
                "buyer": f"Independent program operator {index}",
                "triggeringSituation": f"A scheduled activity changes unexpectedly for cohort {index}.",
                "currentAlternative": "Manual chat follow-up.",
                "materialConsequence": "Possible missed attendance and organizer rework.",
                "protocolHypothesis": "No protocol advantage is assumed before a counterfactual test.",
                "conventionalAlternative": "A conventional hosted web application.",
            }
            for index in range(count)
        ]
    }


def final_idea(index: int, *, route: str = "Neither yet") -> dict:
    return {
        "title": f"Trail Signal {index}",
        "concept": f"A distinct organizer workflow hypothesis {index} for coordinating late route changes.",
        "user": f"Independent outdoor organizer segment {index}",
        "buyer": f"Program operator segment {index}",
        "triggeringSituation": f"A weather or route change occurs shortly before event cohort {index}.",
        "currentAlternative": "Group chat broadcasts and manual acknowledgement lists.",
        "materialConsequence": "The organizer may repeat work while participants risk following stale instructions.",
        "whyNow": "Hypothesis: cheaper workflow automation may make a focused coordination test practical.",
        "distributionWedge": "Recruit organizers through local outdoor clubs for a concierge trial.",
        "adoptionFriction": "Organizers may resist another communication channel.",
        "protocolNeed": "No protocol use is justified; a conventional implementation should be tested first.",
        "protocolCounterfactual": "A conventional web app with a standard database and notification service.",
        "failureReason": "The existing group chat may already be good enough.",
        "criticalAssumption": "Organizers experience enough acknowledgement uncertainty to change workflow.",
        "experiment": "Run a seven-day concierge test and compare acknowledged route changes.",
        "experimentPlan": {
            "durationDays": 7,
            "method": "concierge",
            "target": "Outdoor event organizers planning an activity within two weeks.",
            "sampleSize": 8,
            "artifact": "A manual route-change acknowledgement workflow and result log.",
            "metric": "Share of organizers completing the workflow twice.",
            "passThreshold": "At least five organizers repeat the workflow and request continued access.",
            "killThreshold": "Fewer than two organizers complete a second route-change workflow.",
        },
        "route": route,
        "scores": {
            "personalFit": None,
            "opportunitySignal": 58 + index,
            "protocolAffordance": 10,
            "experimentability": 82,
        },
    }


def final_ideas(count: int = 2) -> dict:
    return {"ideas": [final_idea(index) for index in range(count)]}


class IdeaForgeProtocolTests(unittest.TestCase):
    def test_input_is_strict_and_has_task_specific_budget_defaults(self):
        request = validate_run_request(validate_envelope(forge_message()))
        self.assertEqual(request.task, "idea_forge")
        self.assertEqual(request.budget.max_model_calls, 3)
        self.assertEqual(request.budget.timeout_ms, 180_000)
        self.assertEqual(request.model.max_tokens, 12_000)
        invalid = forge_message()
        invalid["params"]["input"]["profile"]["opennessScore"] = 91
        with self.assertRaises(ProtocolError):
            validate_run_request(validate_envelope(invalid))

    def test_count_and_weight_bounds_fail_closed(self):
        invalid = forge_message(requested_count=13)
        with self.assertRaises(ProtocolError):
            validate_run_request(validate_envelope(invalid))
        raw_trait = forge_message()
        raw_trait["params"]["input"]["profile"]["fitDimensions"] = [{"label": "Openness", "weight": 91}]
        with self.assertRaises(ProtocolError):
            validate_run_request(validate_envelope(raw_trait))
        invalid = forge_message()
        invalid["params"]["input"]["profile"]["searchThemes"] = [{"label": "Fitness", "weight": 101}]
        with self.assertRaises(ProtocolError):
            validate_run_request(validate_envelope(invalid))


class IdeaForgeValidationTests(unittest.TestCase):
    def test_final_set_requires_exact_count_and_neutral_personal_fit_null(self):
        with self.assertRaises(ProtocolError):
            validate_final_ideas(final_ideas(1), 2, "neutral")
        packet = final_ideas(2)
        packet["ideas"][0]["scores"]["personalFit"] = 50
        with self.assertRaises(ProtocolError):
            validate_final_ideas(packet, 2, "neutral")

    def test_forced_both_route_and_invented_evidence_are_rejected(self):
        packet = final_ideas(1)
        packet["ideas"][0]["route"] = "Both"
        packet["ideas"][0]["protocolNeed"] = "Both protocols would be innovative."
        with self.assertRaises(ProtocolError):
            validate_final_ideas(packet, 1, "neutral")
        packet = final_ideas(1)
        packet["ideas"][0]["concept"] = "We interviewed 20 organizers and validated demand for this workflow."
        with self.assertRaises(ProtocolError) as caught:
            validate_final_ideas(packet, 1, "neutral")
        self.assertEqual(caught.exception.code, "invented_evidence")

    def test_both_route_requires_separate_grounded_roles(self):
        packet = final_ideas(1)
        idea = packet["ideas"][0]
        idea["route"] = "Both"
        idea["protocolNeed"] = (
            "Xahau role: an account Hook rejects invalid escrow releases and the ledger records offers. "
            "Evernode role: HotPocket hosts the POSIX coordination app across consensus nodes."
        )
        idea["protocolCounterfactual"] = "A conventional centralized web app and standard database."
        validated = validate_final_ideas(packet, 1, "neutral")
        self.assertEqual(validated[0]["route"], "Both")


class IdeaForgeWorkerTests(unittest.TestCase):
    def test_worker_runs_three_ordered_passes_and_returns_hypotheses(self):
        output = io.StringIO()
        responses = iter((frames(), raw_candidates(), final_ideas()))
        prompts: list[list[dict[str, str]]] = []

        def fake_client(config, messages, **kwargs):
            prompts.append(messages)
            return json.dumps(next(responses))

        worker = Worker(output, model_client=fake_client)
        worker.handle(forge_message())
        deadline = time.time() + 2
        while '"type":"result"' not in output.getvalue() and time.time() < deadline:
            time.sleep(0.01)
        messages = [json.loads(line) for line in output.getvalue().splitlines()]
        self.assertEqual(len(prompts), 3)
        self.assertIn("account Hooks", prompts[0][0]["content"])
        self.assertIn("Demand, traction", prompts[2][0]["content"])
        progress = [message["stage"] for message in messages if message["type"] == "progress"]
        self.assertEqual(
            progress,
            ["validating", "framing", "diverging", "critiquing", "validating_output", "complete"],
        )
        result = next(message["result"] for message in messages if message["type"] == "result")
        self.assertEqual(result["task"], "idea_forge")
        self.assertTrue(result["provisional"])
        self.assertEqual(result["evidenceKind"], "hypothesis")
        self.assertFalse(result["customerValidation"])
        self.assertEqual(result["pipelineVersion"], "idea-forge/1.0.0")
        self.assertEqual(len(result["ideas"]), 2)
        self.assertEqual(
            result["diagnostics"],
            {
                "framesGenerated": 8,
                "rawCandidatesGenerated": 6,
                "candidatesReturned": 2,
                "method": "frame-diverge-critique",
            },
        )
        self.assertEqual(result["usage"]["modelCalls"], 3)

    def test_invalid_intermediate_pass_stops_before_later_calls(self):
        output = io.StringIO()
        calls = 0

        def fake_client(*args, **kwargs):
            nonlocal calls
            calls += 1
            return json.dumps({"frames": []})

        worker = Worker(output, model_client=fake_client)
        worker.handle(forge_message("bad-stage"))
        deadline = time.time() + 2
        while '"type":"error"' not in output.getvalue() and time.time() < deadline:
            time.sleep(0.01)
        self.assertEqual(calls, 1)
        messages = [json.loads(line) for line in output.getvalue().splitlines()]
        terminal = next(message for message in messages if message["type"] == "error")
        self.assertEqual(terminal["error"]["code"], "invalid_model_output")


if __name__ == "__main__":
    unittest.main()
