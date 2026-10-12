"""Check that the public site has no CDN resources or missing local dependencies.

Ordinary outbound links and license/source URLs in comments are allowed. Only URLs
that the browser loads as page resources (including CSS fonts) are checked.
"""
import argparse
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DIRECTORIES = ("css", "js", "images", "partials", "games", "lib")


class PageResources(HTMLParser):
    def __init__(self):
        super().__init__()
        self.resources = []

    def handle_starttag(self, tag, attributes):
        attributes = dict(attributes)
        if tag == "link" and set(attributes.get("rel", "").split()) & {
            "stylesheet", "icon", "preload", "modulepreload", "preconnect", "dns-prefetch"
        }:
            self.resources.append(attributes.get("href", ""))
        if tag in {"script", "img", "source", "video", "audio", "iframe", "embed"}:
            if attributes.get("src"):
                self.resources.append(attributes["src"])
        if tag == "image" and attributes.get("href"):
            self.resources.append(attributes["href"])


def public_files(site_root):
    yield from site_root.glob("*.html")
    for name in PUBLIC_DIRECTORIES:
        directory = site_root / name
        if directory.exists():
            yield from (path for path in directory.rglob("*") if path.is_file())


def validate_site(site_root=ROOT):
    site_root = site_root.resolve()
    errors = []
    resource_count = 0
    for path in public_files(site_root):
        if path.suffix not in {".html", ".css", ".js"}:
            continue
        contents = path.read_text(encoding="utf-8-sig")
        resources = []
        if path.suffix == ".html":
            parser = PageResources()
            parser.feed(contents)
            resources = parser.resources
        elif path.suffix == ".css":
            contents = re.sub(r"/\*.*?\*/", "", contents, flags=re.DOTALL)
            resources = re.findall(r"url\(\s*['\"]?([^)'\"\s]+)", contents)
            resources += re.findall(r"@import\s+['\"]([^'\"]+)", contents)
        elif path.suffix == ".js":
            # ES-module specifiers; comments and license URLs are not dependencies.
            resources = re.findall(r"(?:^|[;\n])\s*(?:import|export)\s*(?:[^;'\"\n]+?\bfrom\s*)?['\"]([^'\"]+)['\"]", contents)
            resources += re.findall(r"\bimport\s*\(\s*['\"]([^'\"]+)['\"]", contents)
        for resource in resources:
            if not resource or resource.startswith(("data:", "#")):
                continue
            resource_count += 1
            parsed = urlsplit(resource)
            label = path.relative_to(site_root)
            if parsed.scheme or parsed.netloc:
                errors.append(f"{label}: external resource {resource}")
                continue
            target = (site_root / unquote(parsed.path).lstrip("/") if parsed.path.startswith("/")
                      else path.parent / unquote(parsed.path)).resolve()
            if not target.is_relative_to(site_root) or not target.is_file():
                errors.append(f"{label}: missing local resource {resource}")
    return resource_count, errors


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", nargs="?", type=Path, default=ROOT)
    args = parser.parse_args()
    count, errors = validate_site(args.directory)
    if errors:
        raise SystemExit("\n".join(errors))
    print(f"Verified {count} local resource references; no CDN dependencies or missing files.")
