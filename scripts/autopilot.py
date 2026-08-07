#!/usr/bin/env python3
"""Ore-no-Fusen CI repair autopilot MVP.

Runs locally and loops:
  GitHub Actions -> failed log -> OpenAI -> unified diff -> validate -> apply -> test -> commit -> push

Requirements:
  - Python 3.11+
  - git
  - GitHub CLI (`gh`) authenticated for this repository
  - OPENAI_API_KEY environment variable
  - OPENAI_MODEL environment variable (explicitly required; no hidden model default)

Safety:
  - Only configured path prefixes may be edited.
  - Secret/config credential files are rejected.
  - `git apply --check` is required before applying.
  - Local validation commands must pass before commit/push.
  - Maximum repair attempts and repeated-failure guard stop runaway loops.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
STATE_PATH = ROOT / ".git" / "autopilot-state.json"
DEFAULT_CONFIG = ROOT / "autopilot.json"


class AutopilotError(RuntimeError):
    pass


def log(message: str) -> None:
    stamp = time.strftime("%H:%M:%S")
    print(f"[{stamp}] {message}", flush=True)


def run(cmd: list[str], *, check: bool = True, capture: bool = True) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        cmd,
        cwd=ROOT,
        text=True,
        encoding="utf-8",
        errors="replace",
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.STDOUT if capture else None,
        shell=False,
    )
    if check and result.returncode != 0:
        output = result.stdout or ""
        raise AutopilotError(f"Command failed ({result.returncode}): {' '.join(cmd)}\n{output[-6000:]}")
    return result


def require_program(name: str) -> None:
    if shutil.which(name) is None:
        raise AutopilotError(f"Required program not found in PATH: {name}")


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def save_state(state: dict[str, Any]) -> None:
    STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def load_state() -> dict[str, Any]:
    if not STATE_PATH.exists():
        return {"attempts": 0, "last_failure_signature": None, "repeat_count": 0}
    try:
        return load_json(STATE_PATH)
    except Exception:
        return {"attempts": 0, "last_failure_signature": None, "repeat_count": 0}


def gh_json(args: list[str]) -> Any:
    result = run(["gh", *args])
    text = (result.stdout or "").strip()
    if not text:
        raise AutopilotError(f"GitHub CLI returned empty JSON: gh {' '.join(args)}")
    return json.loads(text)


def latest_run(workflow: str, branch: str) -> dict[str, Any] | None:
    runs = gh_json([
        "run", "list",
        "--workflow", workflow,
        "--branch", branch,
        "--limit", "5",
        "--json", "databaseId,number,status,conclusion,headSha,createdAt,updatedAt,url",
    ])
    return runs[0] if runs else None


def failed_log(run_id: int) -> str:
    result = run(["gh", "run", "view", str(run_id), "--log-failed"], check=False)
    text = result.stdout or ""
    if not text.strip():
        # Fallback: full log sometimes works when --log-failed has no step payload.
        result = run(["gh", "run", "view", str(run_id), "--log"], check=False)
        text = result.stdout or ""
    return text[-30000:]


def failure_signature(run_info: dict[str, Any], log_text: str) -> str:
    important = []
    for line in log_text.splitlines():
        low = line.lower()
        if "error" in low or "failed" in low or "exception" in low or "referenceerror" in low:
            important.append(re.sub(r"\d{2}:\d{2}:\d{2}(?:\.\d+)?", "<time>", line.strip()))
    basis = "\n".join(important[-20:]) or log_text[-3000:]
    import hashlib
    return hashlib.sha256(basis.encode("utf-8", errors="replace")).hexdigest()[:20]


def candidate_paths(log_text: str, config: dict[str, Any]) -> list[str]:
    allowed = tuple(config["allowed_prefixes"])
    found: list[str] = []
    patterns = [
        r"(?P<p>(?:app|e2e|lib|src-tauri|packaging|scripts|\.github)[\\/][A-Za-z0-9_./\\@()\[\]-]+\.(?:ts|tsx|js|mjs|rs|toml|json|yml|yaml|ps1))",
    ]
    for pattern in patterns:
        for m in re.finditer(pattern, log_text):
            p = m.group("p").replace("\\", "/")
            if p.startswith(allowed) and p not in found and (ROOT / p).is_file():
                found.append(p)
    # Always include CI workflow when CI itself is the suspected failure surface.
    workflow_path = ".github/workflows/msix-ci.yml"
    if workflow_path not in found and (ROOT / workflow_path).exists():
        found.append(workflow_path)
    return found[:10]


def read_context(paths: list[str], max_chars_each: int = 16000) -> str:
    chunks: list[str] = []
    for p in paths:
        try:
            text = (ROOT / p).read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue
        if len(text) > max_chars_each:
            text = text[:max_chars_each] + "\n...<truncated>...\n"
        chunks.append(f"\n===== FILE: {p} =====\n{text}")
    return "".join(chunks)


def extract_output_text(response: dict[str, Any]) -> str:
    if isinstance(response.get("output_text"), str):
        return response["output_text"]
    pieces: list[str] = []
    for item in response.get("output", []) or []:
        if not isinstance(item, dict):
            continue
        for content in item.get("content", []) or []:
            if isinstance(content, dict) and isinstance(content.get("text"), str):
                pieces.append(content["text"])
    return "\n".join(pieces).strip()


def call_openai(prompt: str, model: str) -> str:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise AutopilotError("OPENAI_API_KEY is not set")
    payload = {
        "model": model,
        "input": prompt,
    }
    request = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise AutopilotError(f"OpenAI API HTTP {e.code}: {body[:4000]}") from e
    except urllib.error.URLError as e:
        raise AutopilotError(f"OpenAI API connection error: {e}") from e
    text = extract_output_text(data)
    if not text:
        raise AutopilotError("OpenAI API returned no text output")
    return text


def extract_diff(text: str) -> str:
    fenced = re.search(r"```(?:diff|patch)?\s*\n(.*?)```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1)
    start = text.find("diff --git ")
    if start < 0:
        # Accept classic unified diff too.
        start = text.find("--- a/")
    if start < 0:
        raise AutopilotError("AI response did not contain a unified diff")
    return text[start:].strip() + "\n"


def changed_paths_from_diff(diff_text: str) -> list[str]:
    paths = re.findall(r"^\+\+\+ b/(.+)$", diff_text, re.MULTILINE)
    if not paths:
        paths = re.findall(r"^diff --git a/(.+?) b/(.+)$", diff_text, re.MULTILINE)
        paths = [b for _, b in paths]
    return sorted(set(p.strip() for p in paths if p.strip() != "/dev/null"))


def validate_patch_paths(diff_text: str, config: dict[str, Any]) -> list[str]:
    paths = changed_paths_from_diff(diff_text)
    if not paths:
        raise AutopilotError("Patch contains no changed paths")
    allowed = tuple(config["allowed_prefixes"])
    blocked_names = set(config.get("blocked_files", []))
    for path in paths:
        norm = path.replace("\\", "/")
        if ".." in Path(norm).parts:
            raise AutopilotError(f"Unsafe patch path: {path}")
        if not norm.startswith(allowed):
            raise AutopilotError(f"Patch path is outside allowed prefixes: {path}")
        if norm in blocked_names or Path(norm).name in blocked_names:
            raise AutopilotError(f"Patch attempts to edit blocked file: {path}")
        low = norm.lower()
        if any(token in low for token in (".env", "secret", "credential", "private_key", "id_rsa")):
            raise AutopilotError(f"Patch attempts to edit secret-like file: {path}")
    return paths


def ensure_clean_tree() -> None:
    status = (run(["git", "status", "--porcelain"]).stdout or "").strip()
    if status:
        raise AutopilotError("Working tree is not clean. Commit/stash local changes before starting autopilot.\n" + status)


def sync_branch(branch: str) -> None:
    run(["git", "fetch", "origin", branch])
    current = (run(["git", "branch", "--show-current"]).stdout or "").strip()
    if current != branch:
        run(["git", "checkout", branch])
    run(["git", "pull", "--ff-only", "origin", branch])


def apply_patch(diff_text: str) -> list[str]:
    patch_file = ROOT / ".git" / "autopilot.patch"
    patch_file.write_text(diff_text, encoding="utf-8")
    run(["git", "apply", "--check", str(patch_file)])
    run(["git", "apply", str(patch_file)])
    return [p for p in (run(["git", "diff", "--name-only"]).stdout or "").splitlines() if p.strip()]


def validate_locally(commands: list[list[str]]) -> None:
    for cmd in commands:
        log("validate: " + " ".join(cmd))
        result = run(cmd, check=False)
        if result.returncode != 0:
            output = result.stdout or ""
            run(["git", "reset", "--hard", "HEAD"], check=False)
            raise AutopilotError(f"Local validation failed: {' '.join(cmd)}\n{output[-6000:]}")


def commit_and_push(branch: str, run_number: int, changed: list[str]) -> None:
    if not changed:
        raise AutopilotError("Patch produced no working-tree changes")
    run(["git", "add", "--", *changed])
    run(["git", "commit", "-m", f"fix: autopilot repair MSIX CI #{run_number}"])
    run(["git", "push", "origin", branch])


def build_prompt(run_info: dict[str, Any], log_text: str, context: str, config: dict[str, Any]) -> str:
    return f"""You are repairing a Windows/Tauri/Next.js repository after a GitHub Actions failure.
Return ONLY a minimal unified git diff. Do not explain the patch outside the diff.

Goal: make workflow {config['workflow']} pass while preserving application behavior.
Branch: {config['branch']}
Run number: {run_info.get('number')}
Run id: {run_info.get('databaseId')}
Commit: {run_info.get('headSha')}

Rules:
- Make the smallest justified fix for the actual failure.
- Do not weaken or delete meaningful tests merely to make CI green.
- Do not edit secrets, credentials, .env files, lockfiles unless the log clearly requires it.
- Only edit these prefixes: {', '.join(config['allowed_prefixes'])}
- Windows CI behavior matters.
- Preserve the MSIX image-annotation regression test intent.

FAILED LOG (tail):
{log_text}

RELEVANT SOURCE FILES:
{context}
"""


@dataclass
class Settings:
    raw: dict[str, Any]
    workflow: str
    branch: str
    poll_seconds: int
    max_attempts: int
    max_repeat_failures: int
    model: str


def load_settings(config_path: Path) -> Settings:
    raw = load_json(config_path)
    model = os.environ.get("OPENAI_MODEL", "").strip()
    if not model:
        raise AutopilotError("OPENAI_MODEL is not set. Set it to a model available to your API project.")
    return Settings(
        raw=raw,
        workflow=str(raw.get("workflow", "MSIX CI")),
        branch=str(raw.get("branch", "develop")),
        poll_seconds=max(10, int(raw.get("poll_seconds", 30))),
        max_attempts=max(1, int(raw.get("max_attempts", 5))),
        max_repeat_failures=max(1, int(raw.get("max_repeat_failures", 2))),
        model=model,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Autonomous GitHub Actions repair loop")
    parser.add_argument("--config", default=str(DEFAULT_CONFIG), help="Path to autopilot JSON config")
    parser.add_argument("--once", action="store_true", help="Inspect/repair one terminal CI run then exit")
    parser.add_argument("--dry-run", action="store_true", help="Generate and validate a patch but do not apply/commit/push")
    args = parser.parse_args()

    require_program("git")
    require_program("gh")
    config_path = Path(args.config).resolve()
    settings = load_settings(config_path)
    ensure_clean_tree()
    sync_branch(settings.branch)

    state = load_state()
    last_seen_run: int | None = None

    log(f"autopilot started: workflow={settings.workflow!r} branch={settings.branch!r} poll={settings.poll_seconds}s")
    while True:
        info = latest_run(settings.workflow, settings.branch)
        if not info:
            log("no workflow run found; waiting")
            if args.once:
                return 2
            time.sleep(settings.poll_seconds)
            continue

        run_id = int(info["databaseId"])
        status = info.get("status")
        conclusion = info.get("conclusion")
        if run_id != last_seen_run:
            log(f"run #{info.get('number')} id={run_id} status={status} conclusion={conclusion}")
            last_seen_run = run_id

        if status != "completed":
            if args.once:
                log("run is still in progress")
                return 0
            time.sleep(settings.poll_seconds)
            continue

        if conclusion == "success":
            log(f"SUCCESS: workflow #{info.get('number')} passed. Autopilot complete.")
            state.update({"attempts": 0, "last_failure_signature": None, "repeat_count": 0})
            save_state(state)
            return 0

        if conclusion in {"cancelled", "skipped", "neutral"}:
            log(f"run ended as {conclusion}; waiting for next run")
            if args.once:
                return 3
            time.sleep(settings.poll_seconds)
            continue

        log_text = failed_log(run_id)
        signature = failure_signature(info, log_text)
        if signature == state.get("last_failure_signature"):
            state["repeat_count"] = int(state.get("repeat_count", 0)) + 1
        else:
            state["last_failure_signature"] = signature
            state["repeat_count"] = 1

        if int(state["repeat_count"]) > settings.max_repeat_failures:
            save_state(state)
            raise AutopilotError(
                f"Same failure repeated {state['repeat_count']} times; stopping to prevent a repair loop. signature={signature}"
            )

        state["attempts"] = int(state.get("attempts", 0)) + 1
        if int(state["attempts"]) > settings.max_attempts:
            save_state(state)
            raise AutopilotError(f"Maximum repair attempts exceeded ({settings.max_attempts})")
        save_state(state)

        log(f"failure captured; repair attempt {state['attempts']}/{settings.max_attempts}")
        sync_branch(settings.branch)
        paths = candidate_paths(log_text, settings.raw)
        context = read_context(paths)
        prompt = build_prompt(info, log_text, context, settings.raw)
        ai_text = call_openai(prompt, settings.model)
        diff_text = extract_diff(ai_text)
        patch_paths = validate_patch_paths(diff_text, settings.raw)
        log("AI patch paths: " + ", ".join(patch_paths))

        patch_file = ROOT / ".git" / "autopilot-proposed.patch"
        patch_file.write_text(diff_text, encoding="utf-8")
        run(["git", "apply", "--check", str(patch_file)])

        if args.dry_run:
            log(f"dry-run OK; proposed patch saved at {patch_file}")
            return 0

        changed = apply_patch(diff_text)
        validate_locally(settings.raw.get("validation_commands", []))
        commit_and_push(settings.branch, int(info.get("number") or 0), changed)
        log("repair pushed; waiting for the next CI run")

        if args.once:
            return 0
        time.sleep(settings.poll_seconds)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        log("stopped by user")
        raise SystemExit(130)
    except AutopilotError as exc:
        log(f"STOP: {exc}")
        raise SystemExit(1)
