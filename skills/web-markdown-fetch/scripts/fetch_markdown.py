#!/usr/bin/env python3
import argparse
import json
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0 Safari/537.36"


def extract_url(text: str):
    match = re.search(r"https?://[^\s\]>)\"']+", text)
    return match.group(0) if match else text.strip()


def build_candidates(target_url: str):
    encoded = urllib.parse.quote(target_url, safe=':/?&=%#')
    return [
        ("markdown.new", f"https://markdown.new/{encoded}"),
        ("defuddle.md", f"https://defuddle.md/{encoded}"),
        ("r.jina.ai", f"https://r.jina.ai/http://{target_url}"),
    ]


def fetch_text(url: str, timeout: int):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        charset = resp.headers.get_content_charset() or "utf-8"
        body = resp.read().decode(charset, errors="replace")
        return resp.getcode(), dict(resp.headers.items()), body


def looks_good(body: str):
    text = (body or "").strip()
    if len(text) < 80:
        return False, "response too short"

    lowered = text.lower()
    bad_markers = [
        "just a moment...",
        "enable javascript and cookies to continue",
        "attention required! | cloudflare",
        "cf-browser-verification",
        "access denied",
        "captcha",
        "error 403",
        "error 429",
        "{" + '"data":null' + "}",
    ]
    for marker in bad_markers:
        if marker in lowered:
            return False, f"blocked/challenge marker: {marker}"

    good_markers = ["markdown content:", "url source:", "title:"]
    if any(marker in lowered for marker in good_markers):
        return True, "markdown-style response"

    if text.startswith("#") or "\n#" in text or "\n##" in text:
        return True, "markdown headings present"

    return True, "non-empty text response"


def extract_title(body: str):
    for line in body.splitlines()[:12]:
        if line.lower().startswith("title:"):
            return line.split(":", 1)[1].strip()
    for line in body.splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return None


def detect_cached(body: str, provider: str):
    lowered = body.lower()
    if "cached snapshot" in lowered:
        return True
    return provider == "r.jina.ai" and "published time:" in lowered and "warning:" in lowered


def summarize(body: str, limit: int = 3):
    lines = []
    for raw in body.splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.lower().startswith(("title:", "url source:", "markdown content:", "published time:", "warning:")):
            continue
        if line.startswith("#"):
            line = line.lstrip("# ").strip()
        if len(line) < 25:
            continue
        lines.append(line)
        if len(lines) >= limit:
            break
    return " ".join(lines)[:500] if lines else None


def run_playwright(playwright_script: str, target_url: str, timeout: int):
    proc = subprocess.run(
        ["node", playwright_script, target_url, "--timeout", str(timeout * 1000)],
        capture_output=True,
        text=True,
        check=False,
    )
    stdout = (proc.stdout or "").strip()
    stderr = (proc.stderr or "").strip()
    if proc.returncode != 0:
        return {
            "ok": False,
            "provider": "playwright",
            "error": stderr or stdout or f"playwright exited {proc.returncode}",
        }
    return {
        "ok": True,
        "provider": "playwright",
        "content": stdout,
    }


def main():
    parser = argparse.ArgumentParser(description="Fetch a markdown-friendly version of a web page via provider fallbacks.")
    parser.add_argument("url", help="Target URL or a sentence containing a URL")
    parser.add_argument("--timeout", type=int, default=20, help="Per-request timeout in seconds")
    parser.add_argument("--json", action="store_true", help="Print JSON instead of plain text")
    parser.add_argument(
        "--playwright-script",
        help="Optional path to playwright fallback script (used only if all markdown providers fail)",
    )
    args = parser.parse_args()

    target_url = extract_url(args.url)
    attempts = []
    started = time.time()

    for provider, candidate_url in build_candidates(target_url):
        try:
            status, headers, body = fetch_text(candidate_url, args.timeout)
            ok, reason = looks_good(body)
            attempt = {
                "provider": provider,
                "fetch_url": candidate_url,
                "status": status,
                "ok": ok,
                "reason": reason,
                "content_preview": body[:280],
            }
            attempts.append(attempt)
            if ok:
                result = {
                    "ok": True,
                    "provider": provider,
                    "target_url": target_url,
                    "fetch_url": candidate_url,
                    "status": status,
                    "headers": headers,
                    "elapsed_seconds": round(time.time() - started, 2),
                    "attempts": attempts,
                    "title": extract_title(body),
                    "is_cached_snapshot": detect_cached(body, provider),
                    "summary": summarize(body),
                    "content": body,
                }
                if args.json:
                    print(json.dumps(result, ensure_ascii=False, indent=2))
                else:
                    print(body)
                return 0
        except urllib.error.HTTPError as e:
            attempts.append({
                "provider": provider,
                "fetch_url": candidate_url,
                "status": e.code,
                "ok": False,
                "reason": f"HTTPError: {e.reason}",
            })
        except Exception as e:
            attempts.append({
                "provider": provider,
                "fetch_url": candidate_url,
                "status": None,
                "ok": False,
                "reason": f"{type(e).__name__}: {e}",
            })

    if args.playwright_script:
        pw = run_playwright(args.playwright_script, target_url, args.timeout)
        attempts.append(pw)
        if pw.get("ok"):
            result = {
                "ok": True,
                "provider": "playwright",
                "target_url": target_url,
                "elapsed_seconds": round(time.time() - started, 2),
                "attempts": attempts,
                "title": None,
                "is_cached_snapshot": False,
                "summary": None,
                "content": pw["content"],
            }
            if args.json:
                print(json.dumps(result, ensure_ascii=False, indent=2))
            else:
                print(pw["content"])
            return 0

    result = {
        "ok": False,
        "target_url": target_url,
        "elapsed_seconds": round(time.time() - started, 2),
        "attempts": attempts,
        "next_step": "Try Scrapling for stubborn pages, or use the playwright-scraper skill if browser rendering is required.",
    }
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    return 1


if __name__ == "__main__":
    sys.exit(main())
