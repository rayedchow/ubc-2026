"""Call the pinned remote grader directly from the trainer's own infrastructure."""

import asyncio
import json
import math
import re
from urllib.parse import quote, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def send(origin, path, key, body, content_type="application/json", headers=None):
    url = urlparse(origin)
    if url.scheme != "https" and not (
        url.scheme == "http" and url.hostname in {"localhost", "127.0.0.1", "::1"}
    ):
        raise ValueError("Use an HTTPS origin or a loopback development server.")
    if (
        not url.hostname
        or url.username
        or url.password
        or url.path not in {"", "/"}
        or url.query
        or url.fragment
    ):
        raise ValueError("Provide a service origin.")
    request = Request(
        origin.rstrip("/") + path,
        data=body,
        method="POST",
        headers={
            "Content-Type": content_type,
            "Authorization": "Bearer " + key,
            **(headers or {}),
        },
    )
    with build_opener(_NoRedirect()).open(request, timeout=60) as response:
        return json.load(response)


class Trainer:
    def __init__(
        self,
        grader_origin,
        api_key,
        *,
        gym,
        model_id,
        run_id,
        checkpoint,
        grader_version,
    ):
        for value in (checkpoint, grader_version):
            if not re.fullmatch(r"sha256:[0-9a-f]{64}", value):
                raise ValueError("Pin the full SHA-256 checkpoint and grader version.")
        self.origin, self.key, self.gym = grader_origin, api_key, gym
        self.identity = dict(
            run_id=run_id,
            model_id=model_id,
            checkpoint=checkpoint,
            grader_version=grader_version,
        )

    def grade(self, *, task_id, group_id, rollouts, idempotency_key, voucher):
        """Retry with the same immutable group, voucher and idempotency key."""
        if (
            not voucher
            or not group_id
            or not task_id
            or not idempotency_key
            or not rollouts
        ):
            raise ValueError(
                "Provide a task, group, rollouts, idempotency key and signed voucher."
            )
        ids = [r["id"] for r in rollouts]
        if len(set(ids)) != len(ids):
            raise ValueError("Rollout IDs must be unique within a group.")
        payload = dict(
            self.identity,
            task_id=task_id,
            group_id=group_id,
            rollouts=rollouts,
            idempotency_key=idempotency_key,
        )
        return send(
            self.origin,
            "/v1/gyms/" + quote(self.gym, safe="") + "/grade",
            self.key,
            json.dumps(payload, allow_nan=False).encode(),
            headers={"Payment-Signature": voucher},
        )


def publish_run(origin, trainer_key, snapshot):
    """Publish one versioned, metadata-only run snapshot to the web dashboard."""
    return send(
        origin,
        "/v1/telemetry",
        trainer_key,
        json.dumps(snapshot, allow_nan=False).encode(),
    )


def group_reward(client, authorize, verify_receipt):
    """A verifiers group reward function. The trainer supplies a stable voucher and verifies the receipt.

    authorize(states) returns task_id, group_id, idempotency_key and voucher.
    The framework must discard or retry a failed group. No error is translated to a numeric reward.
    """

    async def reward(completions, states, **kwargs):
        if not completions or len(completions) != len(states):
            raise ValueError("Expected one rollout state per completion.")
        group = authorize(states)
        rollouts = [
            {"id": f"r{i + 1}", "output": output}
            for i, output in enumerate(completions)
        ]
        reply = await asyncio.to_thread(client.grade, **group, rollouts=rollouts)
        if not reply.get("attestation") or not verify_receipt(
            client.identity, group, rollouts, reply
        ):
            raise ValueError("The grader receipt did not verify.")
        if reply.get("flags"):
            raise ValueError("Discard the flagged group.")
        by_id = {row["id"]: row for row in reply["rewards"]}
        if len(reply["rewards"]) != len(rollouts) or set(by_id) != {
            r["id"] for r in rollouts
        }:
            raise ValueError("Incomplete or duplicate rollout scores.")
        result = []
        for item in rollouts:
            row = by_id[item["id"]]
            value = row.get("reward")
            if (
                row.get("status") != "ok"
                or type(value) not in (float, int)
                or not math.isfinite(value)
            ):
                raise ValueError("Discard or retry the group with an unscored rollout.")
            result.append(value)
        return result

    return reward
