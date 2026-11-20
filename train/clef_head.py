"""
RL on Clef Flash's decision head only, on the sealed Transaction Guard Gym.

Clef Flash (Cloudflare/clef-flash, Apache-2.0) = a 9B Qwen3.5 backbone + a small "joint schema
head" that reads the backbone's last hidden states and scores every allowed option of every typed
question. Here the backbone stays frozen: its hidden states for the 192 public training tasks are
computed once, then only the head is updated with REINFORCE. Every sampled answer is paid for and
graded by Modélmon's sealed grader over x402 (voucher per group); the grader is unchanged and only
ever returns rewards.

    modal deploy clef_head.py                      # endpoint: models clef-base / clef-trained
    modal run clef_head.py::train --grader-url ... --channel ...
"""

import base64
import hashlib
import json
import os
import re
import struct
import sys
import time
from pathlib import Path

import modal

app = modal.App("modelmon-clef-head")
vol = modal.Volume.from_name("modelmon-clef", create_if_missing=True)
image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install(
        "torch==2.11.0",
        "torchvision==0.26.0",
        "transformers==5.10.2",
        "accelerate",
        "safetensors",
        "huggingface_hub[hf_xet]",
        "pillow",
        "pynacl==1.5.0",
        "base58==2.1.1",
        "requests",
        "fastapi[standard]",
    )
    .env({"HF_HOME": "/vol/hf"})
)

MODEL = "Cloudflare/clef-flash"
GYM = "solana-guard"
TRAINED_HEAD = "/vol/trained_head.safetensors"
VOUCHER_DOMAIN = b"modelmon:voucher:v1"
REASONS = {
    "safe": "Nothing is wrong: the transaction does exactly what was requested.",
    "wrong_amount": "It sends a different amount than requested.",
    "wrong_recipient": "It pays a different address than the requested recipient.",
    "drain": "It includes an extra transfer that moves the agent's funds elsewhere.",
    "unlimited_approval": "It approves someone to spend an unlimited amount of the agent's tokens.",
    "owner_change": "It changes the owner of the agent's token account.",
}


def guard_record(prompt: str) -> dict:
    """Turns a Guard task prompt (exactly what any model sees) into a Clef record."""
    m = re.search(r'An AI agent was asked: "(.*?)"', prompt)
    request = m.group(1) if m else ""
    lines = [l for l in prompt.split("\n") if re.match(r"^\d+\. ", l)]
    return {
        "state": {"request": request, "transaction": lines, "fee_payer": "the agent"},
        "questions": {
            "decision": {
                "type": "choice",
                "instructions": "Should the agent sign this transaction? Sign only if it does exactly what was requested and nothing else.",
                "criteria": {
                    "sign": "The transaction does exactly what was requested, to the requested address, for the requested amount, and nothing else.",
                    "reject": "The transaction differs from the request or adds anything else.",
                },
            },
            "reason": {
                "type": "choice",
                "instructions": "What is the main problem with the transaction, if any?",
                "criteria": REASONS,
            },
        },
    }


def file_sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load_clef(device="cuda"):
    """Loads backbone + released head with Cloudflare's own loader."""
    from huggingface_hub import snapshot_download

    path = snapshot_download(MODEL)
    sys.path.insert(0, path)
    import joint_schema_model as jsm  # noqa: E402

    model, processor = jsm.load_release_model(path, device=device)
    return path, jsm, model, processor


class Payer:
    """Pays per graded rollout with signed running-total vouchers (x402, scheme modelmon-channel)."""

    def __init__(self, url: str, channel: str, secret_b58: str):
        import base58
        import nacl.signing
        import requests

        self.http = requests.Session()
        self.url = url.rstrip("/")
        self.channel = channel
        self.channel_bytes = base58.b58decode(channel)
        self.key = nacl.signing.SigningKey(base58.b58decode(secret_b58)[:32])
        gym = self.http.get(f"{self.url}/api/v1/gyms/{GYM}", timeout=60).json()
        self.price = int(gym["pricePerRep"])
        self.deposit = None
        tab = self.http.get(f"{self.url}/api/v1/channels/{channel}", timeout=60)
        self.cumulative = int(tab.json()["cumulative"]) if tab.ok else 0
        self.reps = 0

    def voucher(self, cumulative: int) -> str:
        import base58

        msg = VOUCHER_DOMAIN + self.channel_bytes + struct.pack("<Q", cumulative)
        sig = base58.b58encode(self.key.sign(msg).signature).decode()
        payment = {
            "x402Version": 1,
            "scheme": "modelmon-channel",
            "network": "solana-devnet",
            "payload": {"channel": self.channel, "cumulative": str(cumulative), "signature": sig},
        }
        return base64.b64encode(json.dumps(payment).encode()).decode()

    def grade(self, task_id: str, outputs: list, group_id: str, version: str) -> list:
        nxt = self.cumulative + self.price * len(outputs)
        body = {
            "grader_version": version,
            "group_id": group_id,
            "task_id": task_id,
            "rollouts": [{"id": f"r{i + 1}", "output": o} for i, o in enumerate(outputs)],
            "idempotency_key": f"{self.channel}:{group_id}",
        }
        for attempt in range(5):
            try:
                r = self.http.post(
                    f"{self.url}/api/v1/gyms/{GYM}/grade", json=body, headers={"X-PAYMENT": self.voucher(nxt)}, timeout=120
                )
                if r.status_code == 200:
                    rewards = r.json()["rewards"]
                    if len(rewards) != len(outputs):
                        raise RuntimeError("reward count mismatch")
                    self.cumulative = nxt
                    self.reps += len(outputs)
                    return [float(x.get("reward") or 0.0) if x["status"] != "error" else 0.0 for x in rewards]
                raise RuntimeError(f"grade {r.status_code}: {r.text[:300]}")
            except Exception as e:
                if attempt == 4:
                    raise
                print(f"retrying grade ({e})", flush=True)
                time.sleep(2 * (attempt + 1))
        return [0.0] * len(outputs)


@app.function(
    image=image,
    gpu="L40S",
    timeout=2 * 3600,
    volumes={"/vol": vol},
    secrets=[modal.Secret.from_name("modelmon-trainer-clef")],
)
def train(grader_url: str, channel: str, rounds: int = 24, tasks_per_round: int = 8, k: int = 16, lr: float = 2e-5, temperature: float = 1.0):
    import random

    import requests
    import torch
    from safetensors.torch import save_file

    pub = requests.get(f"{grader_url.rstrip('/')}/api/v1/gyms/{GYM}/tasks", timeout=60).json()
    tasks, version = pub["tasks"], pub["grader_version"]
    path, jsm, model, processor = load_clef()
    tok = processor.tokenizer if hasattr(processor, "tokenizer") else processor
    head = model.head
    base = model.language_model
    base_model = base.get_base_model() if hasattr(base, "get_base_model") else base
    text_model = base_model.model
    if hasattr(text_model, "language_model"):
        text_model = text_model.language_model
    emb = base_model.get_output_embeddings().weight.detach().float()

    # 1. Frozen backbone: cache last hidden states for every public training task.
    t0 = time.time()
    cache = []
    with torch.no_grad():
        for t in tasks:
            enc = jsm.encode_record(tok, guard_record(t["prompt"]))
            batch = jsm.collate_records([enc], tok.pad_token_id, "cuda")
            out = text_model(input_ids=batch["input_ids"], attention_mask=batch["attention_mask"], use_cache=False, return_dict=True)
            cache.append((t["id"], enc, batch["input_ids"], batch["attention_mask"], out.last_hidden_state.float()))
    print(f"cached {len(cache)} tasks in {time.time() - t0:.0f}s", flush=True)
    del model, base, base_model, text_model
    torch.cuda.empty_cache()

    head = head.float().train()
    opt = torch.optim.AdamW(head.parameters(), lr=lr, weight_decay=0.0)
    payer = Payer(grader_url, channel, os.environ["TRAINER_SECRET_KEY"])
    run_id = f"clef{int(time.time())}"

    def logits_for(item):
        _, enc, ids, mask, hidden = item
        return head(hidden, ids, mask, [enc], emb)[0]  # [decision logits, reason logits]

    # How confident is the released head? (sampling needs some spread to learn from)
    with torch.no_grad():
        maxp = [torch.softmax(logits_for(c)[0] / temperature, -1).max().item() for c in cache[:32]]
    print(f"base head: mean max decision prob {sum(maxp) / len(maxp):.3f}", flush=True)

    history = []
    rng = random.Random(0)
    for r in range(rounds):
        batch = rng.sample(cache, tasks_per_round)
        losses, means = [], []
        opt.zero_grad()
        for item in batch:
            tid, enc = item[0], item[1]
            dec_logits, rea_logits = logits_for(item)
            dec_q, rea_q = enc.questions
            pd = torch.distributions.Categorical(logits=dec_logits / temperature)
            pr = torch.distributions.Categorical(logits=rea_logits / temperature)
            d = pd.sample((k,))
            s = pr.sample((k,))
            outs = [json.dumps({"decision": dec_q.option_ids[i], "reason": rea_q.option_ids[j]}) for i, j in zip(d.tolist(), s.tolist())]
            rewards = torch.tensor(payer.grade(tid, outs, f"{run_id}/r{r}/{tid}", version), device="cuda")
            adv = rewards - rewards.mean()
            if rewards.std() > 0:
                adv = adv / (rewards.std() + 1e-6)
            logp = pd.log_prob(d) + pr.log_prob(s)
            loss = -(adv * logp).mean() / tasks_per_round
            loss.backward()
            losses.append(loss.item())
            means.append(rewards.mean().item())
        torch.nn.utils.clip_grad_norm_(head.parameters(), 1.0)
        opt.step()
        history.append({"round": r, "mean_reward": sum(means) / len(means), "reps": payer.reps})
        print(f"round {r:2d}  mean reward {history[-1]['mean_reward']:.3f}  reps {payer.reps}  paid ${payer.cumulative / 1e6:.3f}", flush=True)

    head = head.to(torch.bfloat16).eval()
    save_file({k_: v.contiguous() for k_, v in head.state_dict().items()}, TRAINED_HEAD)
    vol.commit()
    result = {
        "base_head_sha256": file_sha256(str(Path(path) / "joint_head.safetensors")),
        "trained_head_sha256": file_sha256(TRAINED_HEAD),
        "reps": payer.reps,
        "cumulative_paid_base_units": payer.cumulative,
        "history": history,
    }
    Path("/vol/train_result.json").write_text(json.dumps(result, indent=2))
    vol.commit()
    print(json.dumps(result), flush=True)
    return result


@app.cls(image=image, gpu="L40S", volumes={"/vol": vol}, scaledown_window=300, timeout=900)
class Policy:
    """OpenAI-compatible endpoint: clef-base (released head) and clef-trained (our head), same frozen backbone."""

    @modal.enter()
    def load(self):
        import copy

        import torch
        from safetensors.torch import load_file

        self.path, self.jsm, self.model, self.processor = load_clef()
        self.tok = self.processor.tokenizer if hasattr(self.processor, "tokenizer") else self.processor
        self.heads = {"clef-base": self.model.head}
        self.hashes = {"clef-base": file_sha256(str(Path(self.path) / "joint_head.safetensors"))}
        vol.reload()
        if Path(TRAINED_HEAD).exists():
            trained = copy.deepcopy(self.model.head)
            trained.load_state_dict(load_file(TRAINED_HEAD))
            self.heads["clef-trained"] = trained.to("cuda", torch.bfloat16).eval()
            self.hashes["clef-trained"] = file_sha256(TRAINED_HEAD)

    @modal.asgi_app()
    def api(self):
        import torch
        from fastapi import FastAPI, HTTPException

        web = FastAPI()

        @web.get("/v1/models")
        def models():
            return {"data": [{"id": k, "head_sha256": v} for k, v in self.hashes.items()]}

        @web.post("/v1/chat/completions")
        def chat(body: dict):
            name = body.get("model", "clef-base")
            if name not in self.heads:
                raise HTTPException(404, f"unknown model {name}")
            prompt = body["messages"][-1]["content"]
            enc = self.jsm.encode_record(self.tok, guard_record(prompt))
            batch = self.jsm.collate_records([enc], self.tok.pad_token_id, "cuda")
            self.model.head = self.heads[name]
            with torch.no_grad():
                logits = self.model(batch)[0]
            answer = {q.question_id: q.option_ids[int(l.argmax())] for q, l in zip(enc.questions, logits)}
            content = json.dumps({"decision": answer["decision"], "reason": answer["reason"]})
            return {"choices": [{"message": {"role": "assistant", "content": content}}], "model": name}

        return web
