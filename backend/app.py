"""
Statbate Scraper — Flask Backend
"""

import csv
import datetime
import io
import json
import os
import random
import re
import tempfile
import threading
import time
import uuid
from pathlib import Path

from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
from playwright.sync_api import sync_playwright
from openpyxl import Workbook
from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
from openpyxl.utils import get_column_letter

app = Flask(__name__)
CORS(app)

TOKEN_COST = 0.05

PLATFORM_NAMES = {
    "1": "Chaturbate",
    "2": "BongaCams",
    "3": "Stripchat",
    "4": "CamSoda",
    "6": "MFC",
}

# ── Job persistence ────────────────────────────────────────────────────────────

JOBS_DIR = Path(os.environ.get("JOBS_DIR", "/tmp/statbate_jobs"))
JOBS_DIR.mkdir(parents=True, exist_ok=True)

def _job_path(job_id):
    return JOBS_DIR / f"{job_id}.json"

def load_job(job_id):
    p = _job_path(job_id)
    if p.exists():
        with open(p) as f:
            return json.load(f)
    return None

def save_job(job):
    with open(_job_path(job["id"]), "w") as f:
        json.dump(job, f)

def list_jobs_from_disk():
    jobs_list = []
    for p in sorted(JOBS_DIR.glob("*.json"), key=lambda x: x.stat().st_mtime, reverse=True)[:20]:
        try:
            with open(p) as f:
                jobs_list.append(json.load(f))
        except Exception:
            pass
    return jobs_list


# ── Styling ────────────────────────────────────────────────────────────────────

HEADER_FILL   = PatternFill("solid", fgColor="1A3A5C")
ROW_ODD_FILL  = PatternFill("solid", fgColor="EFF4FB")
ROW_EVEN_FILL = PatternFill("solid", fgColor="FFFFFF")
HEADER_FONT   = Font(bold=True, color="FFFFFF", size=11)
BODY_FONT     = Font(size=10)
THIN = Border(
    left=Side(style="thin", color="D0D7E3"),
    right=Side(style="thin", color="D0D7E3"),
    top=Side(style="thin", color="D0D7E3"),
    bottom=Side(style="thin", color="D0D7E3"),
)
OK_FILL   = PatternFill("solid", fgColor="D6F5E3")
MISS_FILL = PatternFill("solid", fgColor="FDE8E8")
ERR_FILL  = PatternFill("solid", fgColor="FFF3CD")


def style_header(ws, row, ncols):
    for c in range(1, ncols + 1):
        cell = ws.cell(row=row, column=c)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = THIN


def style_row(ws, row, ncols, odd):
    fill = ROW_ODD_FILL if odd else ROW_EVEN_FILL
    for c in range(1, ncols + 1):
        cell = ws.cell(row=row, column=c)
        cell.fill = fill
        cell.font = BODY_FONT
        cell.alignment = Alignment(vertical="center")
        cell.border = THIN


def auto_width(ws):
    for col in ws.columns:
        letter = get_column_letter(col[0].column)
        width = max((len(str(c.value or "")) for c in col), default=8)
        ws.column_dimensions[letter].width = min(max(width + 4, 12), 55)


# ── Scraping ───────────────────────────────────────────────────────────────────

def extract_js_var(html, var_name):
    pattern = rf'var\s+{re.escape(var_name)}\s*=\s*(\[.*?\]|\{{.*?\}}|".*?"|\'.*?\'|-?\d+\.?\d*);'
    match = re.search(pattern, html, re.DOTALL)
    if not match:
        return None
    try:
        return json.loads(match.group(1))
    except Exception:
        return None


def extract_profile_info(page):
    info = {}
    try:
        rows = page.locator(".bg-white table tbody tr").all()
        for row in rows:
            cells = row.locator("td").all()
            if len(cells) >= 2:
                label = cells[0].inner_text().strip().lower()
                value = cells[1].inner_text().strip()
                value = re.sub(r'\s*\?.*', '', value).strip()
                if "type" in label:
                    info["type"] = value
                elif "last online" in label:
                    info["last_online"] = value
                elif "last month" in label:
                    info["last_month_usd"] = value
                elif "all time" in label:
                    info["all_time_usd"] = value
    except Exception as e:
        info["profile_error"] = str(e)
    return info


def scrape_user(page, platform, username):
    url = f"https://statbate.com/search/{platform}/{username}"
    result = {"status": "ok", "url": url, "profile": {}, "charts": {}, "tables": {}}

    try:
        page.goto(url, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(2000)
        html = page.content()

        body_text = page.locator("body").inner_text()
        if any(x in body_text.lower() for x in ["not found", "no data", "404", "doesn't exist"]):
            result["status"] = "not_found"
            return result

        result["profile"] = extract_profile_info(page)

        result["charts"] = {
            "earnings_cumulative": extract_js_var(html, "chartIncomeLine") or [],
            "daily_income":        extract_js_var(html, "chartIncomeBar")  or [],
            "tippers_cumulative":  extract_js_var(html, "chartDonsLine")   or [],
            "tips_count":          extract_js_var(html, "chartTipsLine")   or [],
        }

        api_url = f"https://statbate.com/api.php?action=tables&name={username}&db={platform}"
        api_response = page.evaluate(f"""
            async () => {{
                try {{
                    const r = await fetch('{api_url}');
                    return await r.json();
                }} catch(e) {{ return null; }}
            }}
        """)
        result["tables"] = api_response or {}

    except Exception as e:
        result["status"] = f"error: {e}"

    return result


def chart_to_rows(data, col2_name):
    rows = []
    for point in data:
        if len(point) >= 2:
            date_str = datetime.datetime.utcfromtimestamp(point[0] / 1000).strftime("%Y-%m-%d")
            rows.append({"date": date_str, col2_name: point[1]})
    return rows


# ── Job runner ─────────────────────────────────────────────────────────────────

def run_scrape_job(job_id, platform, usernames, delay):
    job = load_job(job_id)
    job["status"] = "running"
    job["total"] = len(usernames)
    job["done"] = 0
    job["results"] = []
    job["log"] = []
    save_job(job)

    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            ctx = browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36"
                ),
                viewport={"width": 1280, "height": 900},
            )
            page = ctx.new_page()

            for idx, username in enumerate(usernames, 1):
                job["log"].append(f"[{idx}/{len(usernames)}] Scraping {username}...")
                data = scrape_user(page, platform, username)
                job["results"].append({"username": username, "data": data})
                job["done"] = idx
                job["log"][-1] += f" {data.get('status', '?')}"
                save_job(job)

                if idx < len(usernames):
                    time.sleep(random.uniform(delay * 0.7, delay * 1.4))

            browser.close()

        job["status"] = "done"
        save_job(job)

    except Exception as e:
        job["status"] = "error"
        job["error"] = str(e)
        save_job(job)


# ── Excel / CSV builders ───────────────────────────────────────────────────────

def build_excel(all_data, platform):
    wb = Workbook()
    platform_name = PLATFORM_NAMES.get(str(platform), f"Platform {platform}")

    # Summary
    ws = wb.active
    ws.title = "Summary"
    headers = ["Username", "Platform", "Status", "Type", "Last Online", "Last Month $", "All Time $", "Profile URL"]
    for c, h in enumerate(headers, 1):
        ws.cell(row=1, column=c, value=h)
    style_header(ws, 1, len(headers))
    for i, entry in enumerate(all_data, 1):
        r = i + 1
        p = entry["data"].get("profile", {})
        status = entry["data"].get("status", "unknown")
        ws.cell(row=r, column=1, value=entry["username"])
        ws.cell(row=r, column=2, value=platform_name)
        ws.cell(row=r, column=3, value=status)
        ws.cell(row=r, column=4, value=p.get("type", ""))
        ws.cell(row=r, column=5, value=p.get("last_online", ""))
        ws.cell(row=r, column=6, value=p.get("last_month_usd", ""))
        ws.cell(row=r, column=7, value=p.get("all_time_usd", ""))
        ws.cell(row=r, column=8, value=entry["data"].get("url", ""))
        style_row(ws, r, len(headers), i % 2 == 1)
        sc = ws.cell(row=r, column=3)
        if status == "ok": sc.fill = OK_FILL
        elif status == "not_found": sc.fill = MISS_FILL
        elif "error" in status: sc.fill = ERR_FILL
    auto_width(ws)
    ws.freeze_panes = "A2"

    def make_sheet(title, headers_list, row_fn):
        s = wb.create_sheet(title)
        for c, h in enumerate(headers_list, 1):
            s.cell(row=1, column=c, value=h)
        style_header(s, 1, len(headers_list))
        ri = 2; par = 1
        for entry in all_data:
            rows = row_fn(entry)
            if not rows:
                s.cell(row=ri, column=1, value=entry["username"])
                style_row(s, ri, len(headers_list), par % 2 == 1)
                ri += 1; par += 1; continue
            for row in rows:
                for c, val in enumerate(row, 1):
                    s.cell(row=ri, column=c, value=val)
                style_row(s, ri, len(headers_list), par % 2 == 1)
                ri += 1; par += 1
        auto_width(s)
        s.freeze_panes = "B2"

    make_sheet("Last 30d",
        ["Username", "Date", "Dons", "Tips", "Avg USD", "Total USD"],
        lambda e: [[e["username"], r.get("date",""), r.get("dons",""), r.get("tips",""),
                    f"${r.get('avg_usd','')}", f"${r.get('total_usd','')}"]
                   for r in (e["data"].get("tables",{}).get("searchIncome") or [])])

    make_sheet("Recent tips",
        ["Username", "Date", "Donator", "Tokens", "USD"],
        lambda e: [[e["username"], r.get("date",""), r.get("don_name",""),
                    r.get("tokens",""), f"${r.get('usd','')}"]
                   for r in _get_tip_rows(e["data"].get("tables",{}).get("incomeDetails"))])

    make_sheet("Top monthly",
        ["Username", "Rank", "Donator", "Tokens", "USD"],
        lambda e: [[e["username"], i+1, r.get("name",""),
                    round(r.get("total_usd",0)/TOKEN_COST) if r.get("total_usd") else "",
                    f"${r.get('total_usd','')}"]
                   for i, r in enumerate(e["data"].get("tables",{}).get("donsMonth") or [])])

    make_sheet("Top all-time",
        ["Username", "Rank", "Donator", "Tokens", "USD"],
        lambda e: [[e["username"], i+1, r.get("name",""),
                    round(r.get("total_usd",0)/TOKEN_COST) if r.get("total_usd") else "",
                    f"${r.get('total_usd','')}"]
                   for i, r in enumerate(e["data"].get("tables",{}).get("donsAll") or [])])

    make_sheet("Biggest tips",
        ["Username", "Date", "Donator", "Tokens", "USD"],
        lambda e: [[e["username"], r.get("date",""), r.get("don_name",""),
                    r.get("tokens",""), f"${r.get('usd','')}"]
                   for r in (e["data"].get("tables",{}).get("top100tips") or [])])

    make_sheet("Earnings (chart)",
        ["Username", "Date", "Cumulative USD"],
        lambda e: [[e["username"], r["date"], r["cumulative_usd"]]
                   for r in chart_to_rows(e["data"].get("charts",{}).get("earnings_cumulative",[]), "cumulative_usd")])

    make_sheet("Daily (chart)",
        ["Username", "Date", "Daily USD"],
        lambda e: [[e["username"], r["date"], r["daily_usd"]]
                   for r in chart_to_rows(e["data"].get("charts",{}).get("daily_income",[]), "daily_usd")])

    make_sheet("Tippers (chart)",
        ["Username", "Date", "Cumulative Tippers"],
        lambda e: [[e["username"], d, c]
                   for d, c in sorted({
                       datetime.datetime.utcfromtimestamp(pt[0]/1000).strftime("%Y-%m-%d"): pt[1]
                       for pt in (e["data"].get("charts",{}).get("tippers_cumulative") or [])
                       if len(pt) >= 2
                   }.items())])

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


def _get_tip_rows(details):
    if not details:
        return []
    if isinstance(details, dict):
        return details.get("rows", []) or []
    return details or []


def build_csv(all_data, platform):
    platform_name = PLATFORM_NAMES.get(str(platform), f"Platform {platform}")
    fieldnames = [
        "section", "username", "platform", "status",
        "type", "last_online", "last_month_usd", "all_time_usd",
        "date", "dons", "tips", "avg_usd", "total_usd",
        "donator", "tokens", "usd", "rank",
        "cumulative_usd", "daily_usd", "cumulative_tippers",
    ]
    rows = []
    for entry in all_data:
        username = entry["username"]
        data = entry["data"]
        status = data.get("status", "unknown")
        p = data.get("profile", {})
        tables = data.get("tables", {})
        charts = data.get("charts", {})
        base = {"username": username, "platform": platform_name, "status": status}

        rows.append({**base, "section": "profile",
                     "type": p.get("type",""), "last_online": p.get("last_online",""),
                     "last_month_usd": p.get("last_month_usd",""), "all_time_usd": p.get("all_time_usd","")})

        for r in (tables.get("searchIncome") or []):
            rows.append({**base, "section": "last_30d", "date": r.get("date",""),
                         "dons": r.get("dons",""), "tips": r.get("tips",""),
                         "avg_usd": r.get("avg_usd",""), "total_usd": r.get("total_usd","")})

        for r in _get_tip_rows(tables.get("incomeDetails")):
            rows.append({**base, "section": "recent_tips", "date": r.get("date",""),
                         "donator": r.get("don_name",""), "tokens": r.get("tokens",""), "usd": r.get("usd","")})

        for i, r in enumerate(tables.get("donsMonth") or [], 1):
            total_usd = r.get("total_usd", 0)
            rows.append({**base, "section": "top_monthly", "rank": i,
                         "donator": r.get("name",""),
                         "tokens": round(total_usd/TOKEN_COST) if total_usd else "", "usd": total_usd})

        for i, r in enumerate(tables.get("donsAll") or [], 1):
            total_usd = r.get("total_usd", 0)
            rows.append({**base, "section": "top_alltime", "rank": i,
                         "donator": r.get("name",""),
                         "tokens": round(total_usd/TOKEN_COST) if total_usd else "", "usd": total_usd})

        for r in (tables.get("top100tips") or []):
            rows.append({**base, "section": "biggest_tips", "date": r.get("date",""),
                         "donator": r.get("don_name",""), "tokens": r.get("tokens",""), "usd": r.get("usd","")})

        for r in chart_to_rows(charts.get("earnings_cumulative",[]), "cumulative_usd"):
            rows.append({**base, "section": "earnings_chart", "date": r["date"], "cumulative_usd": r["cumulative_usd"]})

        for r in chart_to_rows(charts.get("daily_income",[]), "daily_usd"):
            rows.append({**base, "section": "daily_chart", "date": r["date"], "daily_usd": r["daily_usd"]})

        seen = {}
        for pt in (charts.get("tippers_cumulative") or []):
            if len(pt) >= 2:
                d = datetime.datetime.utcfromtimestamp(pt[0]/1000).strftime("%Y-%m-%d")
                seen[d] = pt[1]
        for d, c in sorted(seen.items()):
            rows.append({**base, "section": "tippers_chart", "date": d, "cumulative_tippers": c})

    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)
    return io.BytesIO(buf.getvalue().encode("utf-8"))


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.route("/api/health")
def health():
    return jsonify({"ok": True})


@app.route("/api/scrape", methods=["POST"])
def start_scrape():
    body = request.json or {}
    platform = str(body.get("platform", "3"))
    usernames_raw = body.get("usernames", "")
    delay = float(body.get("delay", 3.0))

    usernames = [
        line.strip()
        for line in usernames_raw.splitlines()
        if line.strip() and not line.startswith("#")
    ]

    if not usernames:
        return jsonify({"error": "No usernames provided"}), 400
    if platform not in PLATFORM_NAMES:
        return jsonify({"error": "Invalid platform"}), 400

    job_id = str(uuid.uuid4())
    job = {
        "id": job_id,
        "platform": platform,
        "status": "queued",
        "total": len(usernames),
        "done": 0,
        "results": [],
        "log": [],
        "created_at": datetime.datetime.utcnow().isoformat(),
    }
    save_job(job)

    thread = threading.Thread(
        target=run_scrape_job,
        args=(job_id, platform, usernames, delay),
        daemon=True,
    )
    thread.start()

    return jsonify({"job_id": job_id})


@app.route("/api/jobs/<job_id>")
def job_status(job_id):
    job = load_job(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    return jsonify({
        "id": job["id"],
        "status": job["status"],
        "total": job["total"],
        "done": job["done"],
        "log": job["log"][-50:],  # last 50 lines
        "error": job.get("error"),
    })


@app.route("/api/jobs/<job_id>/download/<fmt>")
def download(job_id, fmt):
    job = load_job(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    if job["status"] != "done":
        return jsonify({"error": "Job not complete"}), 400

    all_data = job["results"]
    platform = job["platform"]
    platform_name = PLATFORM_NAMES.get(platform, "data")
    ts = datetime.datetime.utcnow().strftime("%Y%m%d_%H%M")

    if fmt == "xlsx":
        buf = build_excel(all_data, platform)
        filename = f"statbate_{platform_name}_{ts}.xlsx"
        mimetype = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    elif fmt == "csv":
        buf = build_csv(all_data, platform)
        filename = f"statbate_{platform_name}_{ts}.csv"
        mimetype = "text/csv"
    else:
        return jsonify({"error": "Invalid format"}), 400

    return send_file(buf, mimetype=mimetype,
                     as_attachment=True, download_name=filename)


@app.route("/api/jobs")
def list_jobs():
    return jsonify([
        {"id": j["id"], "status": j["status"], "platform": PLATFORM_NAMES.get(j["platform"], j["platform"]),
         "total": j["total"], "done": j["done"], "created_at": j.get("created_at")}
        for j in list_jobs_from_disk()
    ])


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
