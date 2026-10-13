"""Real screenshots of sources (production rule 15), taken on GitHub before rendering.

For every scene whose visual is {"type": "source", "url": ...}: open the live page in Chromium,
dismiss cookie banners, check the page is really the article (not a bot wall or error page),
and save a screenshot of the top of the page. The scene then shows that screenshot.
If a page can't be captured honestly, the scene keeps its details without a picture.
usage: python scripts/fetch_sources.py out/job.final.json
"""
import json
import os
import sys

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
        result = {}
        page = ctx.new_page()
        try:
            resp = page.goto(url, wait_until="domcontentloaded", timeout=45000)
            page.wait_for_timeout(3500)
            for label in BUTTONS:
                try:
                    page.get_by_role("button", name=label).first.click(timeout=700)
                    page.wait_for_timeout(700)
                    break
                except Exception:
                    pass
            title = (page.title() or "").lower()
            body = (page.inner_text("body") or "")[:4000].lower()
            status = resp.status if resp else 0
            if status >= 400 or not body.strip() or any(k in title or k in body[:600] for k in BLOCKED):
                result = {"shot_error": f"page not capturable (status {status})"}
            else:
                full = os.path.join(out_dir, f"{s['id']}-full.png")
                page.screenshot(path=full, full_page=True)
                img = Image.open(full)
                img = img.crop((0, 0, img.width, min(img.height, 2400)))
                shot = os.path.join(out_dir, f"{s['id']}.png")
                img.save(shot, optimize=True)
                os.remove(full)
                result = {"shot": f"jobs/{job['id']}/sources/{s['id']}.png", "shotRatio": round(img.height / img.width, 3)}
        except Exception as e:  # noqa: BLE001
            result = {"shot_error": str(e)[:160]}
        finally:
            page.close()
        v.update(result)
        done[url] = result
        report.append({"id": s["id"], "url": url, **result})
        print(s["id"], url, "->", result.get("shot") or result.get("shot_error"))
    browser.close()
json.dump(job, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
json.dump(report, open("out/sources-report.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
