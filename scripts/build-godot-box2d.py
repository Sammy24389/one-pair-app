"""Build the pinned Box2D addon with Android 16 KB ELF load alignment."""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--ndk", required=True, type=Path)
parser.add_argument("--scons-path", type=Path, default=root / "release/tools/python-deps")
parser.add_argument("--build-dir", type=Path, default=root / "release/godot-box2d-build")
parser.add_argument("--jobs", type=int, default=2)
args = parser.parse_args()
source = root / "vendor/godot-box2d"
stage = args.build_dir.resolve()
if stage == source.resolve() or stage in source.resolve().parents:
    raise SystemExit("Build directory must be separate from vendored source")
shutil.copytree(source, stage, dirs_exist_ok=True, ignore=shutil.ignore_patterns("__pycache__", "*.o", "*.os", "*.dblite", ".git"))
env = os.environ.copy()
env["ANDROID_NDK_ROOT"] = str(args.ndk.resolve())
env.pop("ANDROID_HOME", None)
env.pop("ANDROID_SDK_ROOT", None)
env["PYTHONPATH"] = str(args.scons_path.resolve()) + os.pathsep + env.get("PYTHONPATH", "")
command = [sys.executable, "-m", "SCons", "platform=android", "arch=arm64", "target=template_release", "ANDROID_HOME=", "android_api_level=26", f"-j{args.jobs}"]
subprocess.run(command, cwd=stage, env=env, check=True)
artifact = stage / "bin/addons/godot-box2d/bin/libgodot-box2d.android.template_release.arm64.so"
if not artifact.is_file():
    raise SystemExit("Expected Android arm64 output missing")
print(f"Built (not installed): {artifact}")
