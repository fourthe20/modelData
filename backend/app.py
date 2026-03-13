"""
Statbate Scraper — Flask Backend
"""

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


def _write_transposed_section(ws, title, headers, data_rows, start_row):
    """Write a section transposed: col A = field label, cols B+ = values per entry."""
    if not data_rows:
        return start_row

    # Section title
    ws.cell(row=start_row, column=1, value=title).font = Font(bold=True, color="FFFFFF", size=10)
    ws.cell(row=start_row, column=1).fill = HEADER_FILL
    start_row += 1

    for hi, header in enumerate(headers):
        row_idx = start_row + hi
        # Label cell
        label_cell = ws.cell(row=row_idx, column=1, value=header)
        label_cell.font = Font(bold=True, size=10)
        label_cell.fill = PatternFill("solid", fgColor="D0D7E3")
        label_cell.border = THIN
        # Value cells
        for ci, row_data in enumerate(data_rows):
            val = row_data[hi] if hi < len(row_data) else ""
            cell = ws.cell(row=row_idx, column=2 + ci, value=val)
            cell.fill = ROW_ODD_FILL if ci % 2 == 0 else ROW_EVEN_FILL
            cell.font = BODY_FONT
            cell.border = THIN

    return start_row + len(headers) + 1  # +1 blank gap


def build_per_model_excel(all_data, platform):
    """One sheet per model, all sections transposed (fields as rows, entries as columns)."""
    platform_name = PLATFORM_NAMES.get(str(platform), f"Platform {platform}")
    wb = Workbook()
    wb.remove(wb.active)  # remove default sheet

    for entry in all_data:
        username = entry["username"]
        data = entry["data"]
        p = data.get("profile", {})
        tables = data.get("tables", {})
        charts = data.get("charts", {})

        # Sheet name max 31 chars, strip invalid chars
        safe_name = username[:31].replace("/", "-").replace("\\", "-").replace("?", "").replace("*", "").replace("[", "").replace("]", "")
        ws = wb.create_sheet(title=safe_name)
        ws.column_dimensions["A"].width = 22

        cur_row = 1

        # ── Profile ──
        cur_row = _write_transposed_section(ws, "PROFILE",
            ["Username", "Platform", "Status", "Type", "Last Online", "Last Month USD", "All Time USD"],
            [[username, platform_name, data.get("status",""), p.get("type",""),
              p.get("last_online",""), p.get("last_month_usd",""), p.get("all_time_usd","")]],
            cur_row)

        # ── Last 30 days ──
        income = tables.get("searchIncome") or []
        if income:
            cur_row = _write_transposed_section(ws, "LAST 30 DAYS",
                ["Date", "Dons", "Tips", "Avg USD", "Total USD"],
                [[r.get("date",""), r.get("dons",""), r.get("tips",""),
                  r.get("avg_usd",""), r.get("total_usd","")] for r in income],
                cur_row)

        # ── Recent tips ──
        tips = _get_tip_rows(tables.get("incomeDetails"))
        if tips:
            cur_row = _write_transposed_section(ws, "RECENT TIPS",
                ["Date", "Donator", "Tokens", "USD"],
                [[r.get("date",""), r.get("don_name",""), r.get("tokens",""), r.get("usd","")] for r in tips],
                cur_row)

        # ── Top monthly ──
        mons = tables.get("donsMonth") or []
        if mons:
            cur_row = _write_transposed_section(ws, "TOP MONTHLY TIPPERS",
                ["Rank", "Donator", "Tokens", "USD"],
                [[i+1, r.get("name",""),
                  round(r.get("total_usd",0)/TOKEN_COST) if r.get("total_usd") else "",
                  r.get("total_usd","")] for i, r in enumerate(mons)],
                cur_row)

        # ── Top all-time ──
        alltime = tables.get("donsAll") or []
        if alltime:
            cur_row = _write_transposed_section(ws, "TOP ALL-TIME TIPPERS",
                ["Rank", "Donator", "Tokens", "USD"],
                [[i+1, r.get("name",""),
                  round(r.get("total_usd",0)/TOKEN_COST) if r.get("total_usd") else "",
                  r.get("total_usd","")] for i, r in enumerate(alltime)],
                cur_row)

        # ── Biggest tips ──
        bigtips = tables.get("top100tips") or []
        if bigtips:
            cur_row = _write_transposed_section(ws, "BIGGEST TIPS",
                ["Date", "Donator", "Tokens", "USD"],
                [[r.get("date",""), r.get("don_name",""), r.get("tokens",""), r.get("usd","")] for r in bigtips],
                cur_row)

        # ── Earnings chart ──
        earn = chart_to_rows(charts.get("earnings_cumulative", []), "cumulative_usd")
        if earn:
            cur_row = _write_transposed_section(ws, "EARNINGS CHART (CUMULATIVE)",
                ["Date", "Cumulative USD"],
                [[r["date"], r["cumulative_usd"]] for r in earn],
                cur_row)

        # ── Daily chart ──
        daily = chart_to_rows(charts.get("daily_income", []), "daily_usd")
        if daily:
            cur_row = _write_transposed_section(ws, "DAILY INCOME CHART",
                ["Date", "Daily USD"],
                [[r["date"], r["daily_usd"]] for r in daily],
                cur_row)

        # ── Tippers chart ──
        seen = {}
        for pt in (charts.get("tippers_cumulative") or []):
            if len(pt) >= 2:
                d = datetime.datetime.utcfromtimestamp(pt[0]/1000).strftime("%Y-%m-%d")
                seen[d] = pt[1]
        if seen:
            cur_row = _write_transposed_section(ws, "TIPPERS CHART (CUMULATIVE)",
                ["Date", "Cumulative Tippers"],
                [[d, c] for d, c in sorted(seen.items())],
                cur_row)

        # Auto-width all columns
        auto_width(ws)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


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
        buf = build_per_model_excel(all_data, platform)
        filename = f"statbate_{platform_name}_{ts}_per_model.xlsx"
        mimetype = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
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
