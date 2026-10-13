"""Real screenshots of sources (production rule 15), taken on GitHub before rendering.

For every scene whose visual is {"type": "source", "url": ...}: open the live page in Chromium,
dismiss cookie banners, check the page is really the article (not a bot wall or error page),
and save a screenshot of the top of the page. The scene then shows that screenshot.
If a page can't be captured honestly, the scene keeps its details without a picture.
usage: python scripts/fetch_sources.py out/job.final.json

If the publisher blocks automated visits (common for journals), the same study is looked up on
PubMed (US National Library of Medicine) by its title and that real record page is captured.
"""
import json
import os
import sys
import urllib.parse
import urllib.request

from PIL import Image
from playwright.sync_api import sync_playwright

path = sys.argv[1] if len(sys.argv) > 1 else "out/job.final.json"
job = json.load(open(path, encoding="utf-8"))
scenes = [s for s in job["scenes"] if (s.get("visual") or {}).get("type") == "source" and s["visual"].get("url")]
if not scenes:
    print("No source scenes")
    sys.exit(0)
out_dir = os.path.join("public", "jobs", job["id"], "sources")
os.makedirs(out_dir, exist_ok=True)
BLOCKED = ["just a moment", "access denied", "captcha", "are you a robot", "verify you are human", "403 forbidden", "404 not found", "page not found", "enable javascript and cookies", "unusual traffic"]
BUTTONS = ["Accept all", "Accept All Cookies", "Accept", "I agree", "I Accept", "Agree", "Allow all", "Got it", "OK", "Continue"]
done = {}
report = []


def pubmed_url(title):
    """The PubMed record of a study, found by its title (free NCBI E-utilities, no key)."""
    if not title:
        return None
    q = urllib.parse.urlencode({"db": "pubmed", "retmode": "json", "retmax": 1, "term": f"{title}[Title]"})
    try:
        data = json.load(urllib.request.urlopen(f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?{q}", timeout=20))
        ids = data.get("esearchresult", {}).get("idlist", [])
        return f"https://pubmed.ncbi.nlm.nih.gov/{ids[0]}/" if ids else None
    except Exception:  # noqa: BLE001
        return None


def capture(ctx, url, sid):
    page = ctx.new_page()
    try:
        resp = page.goto(url, wait_until="domcontentloaded", timeout=45000)
        page.wait_for_timeout(3500)
        for label in BUTTONS:
            try:
                page.get_by_role("button", name=label).first.click(timeout=700)
                page.wait_for_timeout(700)
                break
            except Exception:  # noqa: BLE001
                pass
        title = (page.title() or "").lower()
        body = (page.inner_text("body") or "")[:4000].lower()
        status = resp.status if resp else 0
        if status >= 400 or not body.strip() or any(k in title or k in body[:600] for k in BLOCKED):
            return {"shot_error": f"page not capturable (status {status})"}
        full = os.path.join(out_dir, f"{sid}-full.png")
        page.screenshot(path=full, full_page=True)
        img = Image.open(full)
        img = img.crop((0, 0, img.width, min(img.height, 2400)))
        shot = os.path.join(out_dir, f"{sid}.png")
        img.save(shot, optimize=True)
        os.remove(full)
        return {"shot": f"jobs/{job['id']}/sources/{sid}.png", "shotRatio": round(img.height / img.width, 3), "capturedUrl": url}
    except Exception as e:  # noqa: BLE001
        return {"shot_error": str(e)[:160]}
    finally:
        page.close()


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1280, "height": 900}, locale="en-IN",
                              user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36")
    for s in scenes:
        v = s["visual"]
        url = v["url"]
        if url in done:
            v.update(done[url])
            continue
        result = capture(ctx, url, s["id"])
        if "shot" not in result:
            alt = pubmed_url(v.get("title"))
            if alt:
                second = capture(ctx, alt, s["id"])
                if "shot" in second:
                    result = second
                else:
                    result["shot_error"] += f"; PubMed also failed ({second.get('shot_error')})"
        v.update(result)
        done[url] = result
        report.append({"id": s["id"], "url": url, **result})
        print(s["id"], url, "->", result.get("shot") or result.get("shot_error"), result.get("capturedUrl", ""))
    browser.close()
json.dump(job, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
json.dump(report, open("out/sources-report.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
