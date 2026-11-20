"""
GRPO post-training of Qwen3-0.6B on the sealed Transaction Guard Gym, on Modal.

Every reward comes from Modélmon's sealed grader over x402: each GRPO group is
sent to POST /api/v1/gyms/solana-guard/grade with a voucher signed by the
trainer's own wallet (the running total of its payment channel). The grader
returns rewards only, never labels.

    # one-time: the trainer key as a Modal secret (TRAINER_SECRET_KEY, base58)
    modal secret create modelmon-trainer --from-dotenv <file>

    modal run grpo_guard.py::train --grader-url https://<tunnel> --channel <channel> --steps 150
    modal deploy grpo_guard.py      # OpenAI-compatible endpoint the grader calls for sealed tests
"""

import base64
import hashlib
import json
import os
import struct
import time
from pathlib import Path

import modal

app = modal.App("modelmon-guard-grpo")

image = modal.Image.debian_slim(python_version="3.12").pip_install(
    "torch==2.6.0",
    "transformers==4.53.2",
    "trl==0.19.1",
    "peft==0.16.0",
    "accelerate==1.8.1",
    "datasets==3.6.0",
    "pynacl==1.5.0",
    "base58==2.1.1",
    "requests==2.32.4",
    "fastapi[standard]==0.116.1",
)
vol = modal.Volume.from_name("modelmon-guard", create_if_missing=True)

# Qwen3 models gave identical answers within every group (no GRPO signal); Qwen2.5-1.5B varies (probe_models).
BASE = "Qwen/Qwen2.5-1.5B-Instruct"
GYM = "solana-guard"
TRAINED_DIR = "/vol/trained"
# The trainer's harness: the model compares the transaction with the request before answering.
# Short reasoning gives different paths to different answers, which GRPO needs to learn.
SYSTEM = "Compare the transaction with what the agent was asked to do, in one or two short sentences. Then give the JSON answer."
VOUCHER_DOMAIN = b"modelmon:voucher:v1"


def weights_hash(model_dir: str) -> str:
    """sha256 over the model's safetensors files: the identity recorded onchain."""
    h = hashlib.sha256()
    for f in sorted(Path(model_dir).rglob("*.safetensors")):
        h.update(f.name.encode())
        with open(f, "rb") as fh:
            for chunk in iter(lambda: fh.read(1 << 20), b""):
                h.update(chunk)
    return h.hexdigest()


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

    def grade(self, task_id: str, outputs: list[str], group_id: str, version: str) -> list[float]:
        cost = self.price * len(outputs)
        nxt = self.cumulative + cost
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
                    f"{self.url}/api/v1/gyms/{GYM}/grade",
                    json=body,
                    headers={"X-PAYMENT": self.voucher(nxt)},
                    timeout=120,
                )
                if r.status_code == 402 and "required" in r.text:
                    # Our running total was behind the grader's tab (e.g. a previous job graded on this
                    # channel). Resync from the grader's figure and re-sign; still capped by the deposit.
                    nxt = int(r.json()["required"])
                    self.cumulative = nxt - cost
                    print(f"resynced voucher total to {nxt}")
                    continue
                if r.status_code == 200:
                    self.cumulative = nxt
                    self.reps += len(outputs)
                    # Errors are masked as 0 here; flagged rollouts already carry reward 0.
                    return [float(x.get("reward") or 0.0) if x["status"] != "error" else 0.0 for x in r.json()["rewards"]]
                raise RuntimeError(f"grade {r.status_code}: {r.text[:300]}")
            except Exception as e:  # retry transient tunnel errors; the idempotency key prevents double charges
                if attempt == 4:
                    raise
                print(f"retrying grade ({e})")
                time.sleep(2 * (attempt + 1))
        return [0.0] * len(outputs)


@app.function(
    image=image,
    gpu="L40S",  # 48 GB: room for 1.5B + 16-way groups
    timeout=3 * 3600,
    volumes={"/vol": vol},
    secrets=[modal.Secret.from_name("modelmon-trainer")],
)
def train(grader_url: str, channel: str, steps: int = 80, lr: float = 1e-5, temperature: float = 1.0, generations: int = 16, beta: float = 0.04):
    import requests
    import torch
    from datasets import Dataset
    from peft import LoraConfig
    from transformers import AutoTokenizer
    from trl import GRPOConfig, GRPOTrainer

    pub = requests.get(f"{grader_url.rstrip('/')}/api/v1/gyms/{GYM}/tasks", timeout=60).json()
    tasks, version = pub["tasks"], pub["grader_version"]
    print(f"{len(tasks)} public training tasks, grader {version}")

    tok = AutoTokenizer.from_pretrained(BASE)
    # Batched generation needs left padding; Qwen2.5's tokenizer pads on the right by default,
    # which turned every shorter prompt in a batch into gibberish.
    tok.padding_side = "left"

    def fmt(prompt: str) -> str:
        return tok.apply_chat_template(
            [{"role": "user", "content": prompt}], tokenize=False, add_generation_prompt=True, enable_thinking=False
        )

    ds = Dataset.from_list([{"prompt": fmt(t["prompt"]), "task_id": t["id"]} for t in tasks]).shuffle(seed=0)
    payer = Payer(grader_url, channel, os.environ["TRAINER_SECRET_KEY"])
    calls = {"n": 0}
    run_id = f"run{int(time.time())}"  # group ids double as idempotency keys, so they must be unique per run

    def sealed_reward(completions, task_id, **_):
        """Groups the batch by task (one GRPO group each) and pays the sealed grader for each group."""
        groups: dict[str, list[int]] = {}
        for i, tid in enumerate(task_id):
            groups.setdefault(tid, []).append(i)
        out = [0.0] * len(completions)
        calls["n"] += 1
        for tid, idx in groups.items():
            rewards = payer.grade(tid, [completions[i] for i in idx], f"{run_id}/call-{calls['n']}/{tid}", version)
            if len(rewards) != len(idx):
                raise RuntimeError(f"grader returned {len(rewards)} rewards for {len(idx)} rollouts")
            for j, i in enumerate(idx):
                out[i] = rewards[j]
        return out

    cfg = GRPOConfig(
        output_dir="/vol/run",
        learning_rate=lr,
        # GRPO learns only from differences within a group: sample at T=1 with no top-k/top-p cut.
        per_device_train_batch_size=16,  # one task's group per forward pass (fits the A10G's 22 GB)
        num_generations=generations,
        top_p=1.0,
        top_k=None,
        gradient_accumulation_steps=2,  # two tasks per optimizer step
        # No gradient checkpointing: it forces cache-less generation, which with left padding
        # produced gibberish completions. The L40S has the memory to do without it.
        gradient_checkpointing=False,
        max_prompt_length=512,
        max_completion_length=48,
        max_steps=steps,
        temperature=temperature,
        beta=beta,  # KL to the base model: the beta=0 run collapsed onto fixed answers after ~45 steps
        logging_steps=5,
        bf16=True,
        report_to=[],
        save_strategy="no",
    )
    lora = LoraConfig(
        r=32,
        lora_alpha=64,
        lora_dropout=0.0,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
        task_type="CAUSAL_LM",
    )
    trainer = GRPOTrainer(
        model=BASE,
        reward_funcs=sealed_reward,
        args=cfg,
        train_dataset=ds,
        peft_config=lora,
        processing_class=tok,
    )
    # Make sure the model's own generation defaults can't re-impose top-k/top-p filtering.
    for gc in (trainer.model.generation_config, getattr(trainer, "generation_config", None)):
        if gc is not None:
            gc.top_k, gc.top_p = 0, 1.0
    trainer.train()

    merged = trainer.model.merge_and_unload()
    merged.to(torch.bfloat16).save_pretrained(TRAINED_DIR, safe_serialization=True)
    tok.save_pretrained(TRAINED_DIR)
    vol.commit()
    history = [
        {"step": h.get("step"), "reward": h.get("reward"), "reward_std": h.get("reward_std")}
        for h in trainer.state.log_history
        if "reward" in h
    ]
    result = {
        "base_model": BASE,
        "trained_weights_sha256": weights_hash(TRAINED_DIR),
        "steps": steps,
        "reps": payer.reps,
        "cumulative_paid_base_units": payer.cumulative,
        "history": history,
    }
    Path("/vol/train_result.json").write_text(json.dumps(result, indent=2))
    vol.commit()
    print(json.dumps(result, indent=2))
    return result


@app.cls(image=image, gpu="A10G", volumes={"/vol": vol}, scaledown_window=300, timeout=900)
class Policy:
    """OpenAI-compatible chat endpoint serving `base` and `trained`. The sealed grader calls it for sealed tests."""

    @modal.enter()
    def load(self):
        import torch
        from huggingface_hub import snapshot_download
        from transformers import AutoModelForCausalLM, AutoTokenizer

        self.tok = AutoTokenizer.from_pretrained(BASE)
        base_dir = snapshot_download(BASE)
        self.models = {"base": AutoModelForCausalLM.from_pretrained(base_dir, torch_dtype=torch.bfloat16).cuda().eval()}
        self.hashes = {"base": weights_hash(base_dir)}
        vol.reload()
        if Path(TRAINED_DIR).exists():
            self.models["trained"] = AutoModelForCausalLM.from_pretrained(TRAINED_DIR, torch_dtype=torch.bfloat16).cuda().eval()
            self.hashes["trained"] = weights_hash(TRAINED_DIR)

    @modal.asgi_app()
    def api(self):
        import torch
        from fastapi import FastAPI, HTTPException

        web = FastAPI()

        @web.get("/v1/models")
        def models():
            return {"data": [{"id": k, "weights_sha256": v} for k, v in self.hashes.items()]}

        @web.post("/v1/chat/completions")
        def chat(body: dict):
            name = body.get("model", "base")
            if name not in self.models:
                raise HTTPException(404, f"unknown model {name}")
            text = self.tok.apply_chat_template(
                body["messages"], tokenize=False, add_generation_prompt=True, enable_thinking=False
            )
            ids = self.tok(text, return_tensors="pt").to("cuda")
            with torch.no_grad():
                out = self.models[name].generate(
                    **ids, max_new_tokens=int(body.get("max_tokens", 64)), do_sample=False
                )
            content = self.tok.decode(out[0][ids["input_ids"].shape[1]:], skip_special_tokens=True)
            # The weights hash travels with every answer, so the grader can check which model really answered.
            return {"choices": [{"message": {"role": "assistant", "content": content}}], "model": name, "weights_sha256": self.hashes[name]}

        return web


@app.function(image=image, gpu="A10G", timeout=1200)
def probe(grader_url: str, n_tasks: int = 6, samples: int = 16):
    """Before spending a training run: does reasoning first give valid, varied answers?"""
    import collections
    import re

    import requests
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    tasks = requests.get(f"{grader_url.rstrip('/')}/api/v1/gyms/{GYM}/tasks", timeout=60).json()["tasks"][:n_tasks]
    tok = AutoTokenizer.from_pretrained(BASE)
    model = AutoModelForCausalLM.from_pretrained(BASE, torch_dtype=torch.bfloat16).cuda().eval()
    for label, system, thinking, max_new in [("short reasoning", SYSTEM, False, 160), ("qwen thinking", None, True, 320)]:
        valid = distinct = 0
        lengths = []
        for t in tasks:
            msgs = ([{"role": "system", "content": system}] if system else []) + [{"role": "user", "content": t["prompt"]}]
            text = tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True, enable_thinking=thinking)
            ids = tok(text, return_tensors="pt").to("cuda")
            with torch.no_grad():
                out = model.generate(**ids, do_sample=True, temperature=1.0, top_p=1.0, top_k=0, max_new_tokens=max_new, num_return_sequences=samples)
            answers = []
            for o in out:
                gen = o[ids["input_ids"].shape[1]:]
                lengths.append(int((gen != tok.pad_token_id).sum()))
                s = tok.decode(gen, skip_special_tokens=True)
                m = re.search(r'"decision"\s*:\s*"(sign|reject)".*?"reason"\s*:\s*"(\w+)"', s, re.S)
                answers.append(m.groups() if m else None)
            valid += sum(a is not None for a in answers)
            distinct += len(collections.Counter(a for a in answers if a))
        print(f"{label}: valid {valid}/{len(tasks) * samples}, avg distinct answers per task {distinct / len(tasks):.1f}, mean length {sum(lengths) / len(lengths):.0f} tokens")


@app.function(image=image, gpu="A10G", timeout=1800)
def probe_models(grader_url: str, models: str, n_tasks: int = 8, samples: int = 16):
    """Which small models give valid but varied answers on Guard tasks (the precondition for GRPO)?"""
    import collections
    import re

    import requests
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    tasks = requests.get(f"{grader_url.rstrip('/')}/api/v1/gyms/{GYM}/tasks", timeout=60).json()["tasks"][:n_tasks]
    for name in models.split(","):
        tok = AutoTokenizer.from_pretrained(name)
        model = AutoModelForCausalLM.from_pretrained(name, torch_dtype=torch.bfloat16).cuda().eval()
        valid = distinct = mixed = 0
        for t in tasks:
            text = tok.apply_chat_template([{"role": "user", "content": t["prompt"]}], tokenize=False, add_generation_prompt=True, enable_thinking=False)
            ids = tok(text, return_tensors="pt").to("cuda")
            with torch.no_grad():
                out = model.generate(**ids, do_sample=True, temperature=1.0, top_p=1.0, top_k=0, max_new_tokens=48, num_return_sequences=samples, pad_token_id=tok.eos_token_id)
            answers = []
            for o in out:
                s = tok.decode(o[ids["input_ids"].shape[1]:], skip_special_tokens=True)
                m = re.search(r'"decision"\s*:\s*"(sign|reject)".*?"reason"\s*:\s*"(\w+)"', s, re.S)
                answers.append(m.groups() if m else None)
            ok = [a for a in answers if a]
            valid += len(ok)
            distinct += len(set(ok))
            mixed += len({a[0] for a in ok}) > 1  # both sign and reject appear: GRPO can learn the decision here
        print(f"{name}: valid {valid}/{len(tasks) * samples}, distinct answers/task {distinct / len(tasks):.1f}, tasks with both decisions {mixed}/{len(tasks)}", flush=True)
        del model
        torch.cuda.empty_cache()
