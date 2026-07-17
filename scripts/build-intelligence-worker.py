"""Build SIFT's local Python intelligence worker for the current platform.

The release workflow runs this script natively on each target architecture.
Users receive the resulting standalone executable inside the SIFT application;
they never need to install Python themselves.
"""

from __future__ import annotations

import platform
import shutil
import subprocess
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
WORKER_ENTRY = PROJECT_ROOT / "desktop" / "intelligence_worker_entry.py"
RUNTIME_ROOT = PROJECT_ROOT / "desktop" / "intelligence-runtime"
BUILD_ROOT = PROJECT_ROOT / "build" / "intelligence-worker"
EXECUTABLE_NAME = "sift-intelligence-worker"


def platform_name() -> str:
    if sys.platform == "win32":
        return "win"
    if sys.platform == "darwin":
        return "mac"
    raise SystemExit("SIFT desktop intelligence packages are built only on Windows or macOS.")


def architecture_name() -> str:
    machine = platform.machine().lower()
    if machine in {"amd64", "x86_64"}:
        return "x64"
    if machine in {"arm64", "aarch64"}:
        return "arm64"
    raise SystemExit(f"Unsupported desktop architecture: {machine or 'unknown'}")


def main() -> None:
    if not WORKER_ENTRY.is_file():
        raise SystemExit(f"Python intelligence worker not found: {WORKER_ENTRY}")

    target = RUNTIME_ROOT / f"{platform_name()}-{architecture_name()}"
    work = BUILD_ROOT / f"{platform_name()}-{architecture_name()}"
    shutil.rmtree(target, ignore_errors=True)
    shutil.rmtree(work, ignore_errors=True)
    target.mkdir(parents=True, exist_ok=True)
    (work / "work").mkdir(parents=True, exist_ok=True)
    (work / "spec").mkdir(parents=True, exist_ok=True)

    command = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--clean",
        "--noconfirm",
        "--onefile",
        "--console",
        "--name",
        EXECUTABLE_NAME,
        "--distpath",
        str(target),
        "--workpath",
        str(work / "work"),
        "--specpath",
        str(work / "spec"),
        str(WORKER_ENTRY),
    ]
    completed = subprocess.run(command, cwd=PROJECT_ROOT, check=False)
    if completed.returncode != 0:
        raise SystemExit(completed.returncode)

    suffix = ".exe" if sys.platform == "win32" else ""
    artifact = target / f"{EXECUTABLE_NAME}{suffix}"
    if not artifact.is_file() or artifact.stat().st_size == 0:
        raise SystemExit(f"PyInstaller did not create the expected worker: {artifact}")
    print(artifact)


if __name__ == "__main__":
    main()
