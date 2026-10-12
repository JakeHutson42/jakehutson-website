"""Export only public site files. Never upload the repository root or tooling."""
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "dist"


def build_static():
    # Verify the resolved path before clearing our own generated output on Windows.
    # No caller-controlled path is accepted and nothing outside this checkout is touched.
    resolved = OUTPUT.resolve()
    if resolved.parent != ROOT.resolve() or resolved.name != "dist":
        raise RuntimeError("Refusing to replace a build directory outside this checkout")
    if OUTPUT.is_symlink():
        raise RuntimeError("The build directory must not be a symbolic link")
    if OUTPUT.exists():
        shutil.rmtree(resolved)
    OUTPUT.mkdir()
    for page in ROOT.glob("*.html"):
        shutil.copy2(page, OUTPUT / page.name)
    for name in ("css", "js", "images", "partials", "games", "lib"):
        shutil.copytree(ROOT / name, OUTPUT / name, ignore=shutil.ignore_patterns("__pycache__", "*.md", "package.json"))
    if (ROOT / "_headers").exists():
        shutil.copy2(ROOT / "_headers", OUTPUT / "_headers")
    print(f"Static site ready in {OUTPUT}")


if __name__ == "__main__":
    build_static()
