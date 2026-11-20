"""Seal an explicit list of Gym files locally and upload only ciphertext."""

import argparse
import csv
import io
import json
import os
import zipfile
from pathlib import Path
from urllib.parse import quote

from . import send


def seal(directory, recipient_hex):
    from nacl.public import PublicKey, SealedBox

    manifest = json.loads((directory / "manifest.json").read_text())
    files = ["manifest.json", *manifest["files"]]
    if not any(name.endswith((".jsonl", ".csv")) for name in files) or not any(
        name.endswith(".py") for name in files
    ):
        raise ValueError(
            "Include a task dataset and a Python grader or verifiers environment."
        )
    if len(files) != len(set(files)):
        raise ValueError("Each package file must be listed once.")
    data = io.BytesIO()
    total = 0
    with zipfile.ZipFile(data, "w", zipfile.ZIP_DEFLATED) as archive:
        for name in files:
            path = directory / name
            if (
                Path(name).is_absolute()
                or ".." in Path(name).parts
                or not path.resolve().is_relative_to(directory.resolve())
            ):
                raise ValueError("All files must be inside the Gym directory.")
            if path.suffix not in {".py", ".json", ".jsonl", ".csv", ".lock", ".toml"}:
                raise ValueError("Unsupported Gym file format.")
            total += path.stat().st_size
            if total > 15 * 1024**2:
                raise ValueError("Keep the uncompressed package under 15 MiB.")
            content = path.read_bytes()
            if path.suffix == ".jsonl":
                if not all(
                    isinstance(json.loads(line), dict)
                    for line in content.splitlines()
                    if line.strip()
                ):
                    raise ValueError("JSONL rows must be JSON objects.")
            elif path.suffix == ".csv":
                if not csv.DictReader(
                    io.StringIO(content.decode("utf-8-sig"))
                ).fieldnames:
                    raise ValueError("Include CSV column headers.")
            archive.writestr(name, content)
    key = PublicKey(bytes.fromhex(recipient_hex))
    return b"MMG1" + bytes(key) + SealedBox(key).encrypt(data.getvalue())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--gym", required=True)
    parser.add_argument("--origin", required=True)
    parser.add_argument(
        "--recipient",
        required=True,
        help="X25519 public key from the independently verified grader record, in hex",
    )
    args = parser.parse_args()
    box = seal(args.directory, args.recipient)
    result = send(
        args.origin,
        "/v1/gyms/" + quote(args.gym, safe="") + "/packages",
        os.environ["MODELMON_CREATOR_KEY"],
        box,
        "application/octet-stream",
    )
    print(result["digest"], result["status"])


if __name__ == "__main__":
    main()
