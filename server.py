from __future__ import annotations

import cgi
import json
import mimetypes
import os
import re
import shutil
import time
import urllib.parse
import urllib.request
import urllib.error
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parent
DB_DIR = ROOT / "本機資料庫"
METADATA_FILE = DB_DIR / "metadata.json"
STATE_FILE = DB_DIR / "app-state.json"
CWA_CONFIG_FILE = ROOT / "cwa_config.json"
HOST = "127.0.0.1"
PORT = 8088
CWA_WARNING_URL = "https://opendata.cwa.gov.tw/api/v1/rest/datastore/W-C0033-001"
CWA_DETAIL_URL = "https://opendata.cwa.gov.tw/api/v1/rest/datastore/W-C0033-002"
WEATHER_CACHE_TTL = 600
weather_cache: dict[str, object] = {
    "expiresAt": 0.0,
    "payload": None,
}
DEFAULT_STATE = {
    "dailyLogs": [
        {
            "date": "2026-04-25",
            "type": "巡檢",
            "owner": "溫室管理員",
            "status": "觀察中",
            "note": "上午確認單一溫室感測測試狀態，資料記錄正常，待下午再次檢查。",
        },
        {
            "date": "2026-04-24",
            "type": "灌溉",
            "owner": "王同學",
            "status": "已完成",
            "note": "完成溫室灌溉作業登錄，已補上照片與負責人簽核。",
        },
    ],
    "systemLogs": [
        {
            "time": "2026-04-25T09:12",
            "level": "警告",
            "message": "感測測試資料匯出尚未確認，已標記給管理者追蹤。",
        },
        {
            "time": "2026-04-25T07:40",
            "level": "資訊",
            "message": "管理網站部署完成，表單資料已可匯出備份。",
        },
        {
            "time": "2026-04-24T16:30",
            "level": "注意",
            "message": "本週灌溉排程尚有 1 筆待管理者確認。",
        },
    ],
    "tasks": [
        {"id": 1, "text": "確認今日感測測試資料", "done": False},
        {"id": 2, "text": "補登 0424 測試紀錄", "done": False},
        {"id": 3, "text": "確認本週巡檢人員分工", "done": True},
    ],
    "progress": [
        {"name": "本機資料備份流程", "value": 82},
        {"name": "感測測試資料整理", "value": 68},
        {"name": "每日管理流程數位化", "value": 45},
        {"name": "實驗室電腦搬移準備", "value": 56},
    ],
    "calendarEvents": {
        "2026-04-08": [{"title": "0408 溫室資料分析", "type": "排程", "note": ""}],
        "2026-04-17": [{"title": "0417 感測測試紀錄", "type": "排程", "note": ""}],
        "2026-04-18": [{"title": "0418 合併資料檢核", "type": "排程", "note": ""}],
        "2026-04-21": [{"title": "感測測試資料檢核", "type": "提醒", "note": ""}],
        "2026-04-23": [{"title": "0423 作業資料歸檔", "type": "排程", "note": ""}],
        "2026-04-25": [{"title": "系統日誌整理", "type": "提醒", "note": ""}],
        "2026-04-28": [{"title": "灌溉策略檢討", "type": "會議", "note": ""}],
    },
}


def ensure_database() -> None:
    DB_DIR.mkdir(exist_ok=True)
    if not METADATA_FILE.exists():
        METADATA_FILE.write_text("[]", encoding="utf-8")
    if not STATE_FILE.exists():
        STATE_FILE.write_text(json.dumps(DEFAULT_STATE, ensure_ascii=False, indent=2), encoding="utf-8")


def read_metadata() -> list[dict]:
    ensure_database()
    try:
        return json.loads(METADATA_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []


def write_metadata(records: list[dict]) -> None:
    ensure_database()
    METADATA_FILE.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")


def normalize_calendar_events(events: dict | None) -> dict[str, list[dict]]:
    normalized: dict[str, list[dict]] = {}
    if not isinstance(events, dict):
        return normalized
    for key, items in events.items():
        if not isinstance(key, str):
            continue
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", key):
            target_key = key
        elif key.isdigit():
            target_key = f"2026-04-{int(key):02d}"
        else:
            continue

        normalized_items: list[dict] = []
        if isinstance(items, list):
            for item in items:
                if isinstance(item, str):
                    normalized_items.append({"title": item, "type": "排程", "note": ""})
                elif isinstance(item, dict) and item.get("title"):
                    normalized_items.append({
                        "title": str(item.get("title", "")).strip(),
                        "type": str(item.get("type", "排程")).strip() or "排程",
                        "note": str(item.get("note", "")).strip(),
                    })
        if normalized_items:
            normalized[target_key] = normalized_items
    return normalized


def normalize_app_state(raw_state: dict | None) -> dict:
    state = json.loads(json.dumps(DEFAULT_STATE, ensure_ascii=False))
    if isinstance(raw_state, dict):
        for key in ("dailyLogs", "systemLogs", "tasks", "progress"):
            if isinstance(raw_state.get(key), list):
                state[key] = raw_state[key]
        state["calendarEvents"] = normalize_calendar_events(raw_state.get("calendarEvents"))
    state["dailyLogs"] = sorted(state["dailyLogs"], key=lambda item: item.get("date", ""), reverse=True)
    return state


def read_app_state() -> dict:
    ensure_database()
    try:
        raw_state = json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        raw_state = DEFAULT_STATE
    return normalize_app_state(raw_state)


def write_app_state(state: dict) -> dict:
    ensure_database()
    normalized = normalize_app_state(state)
    STATE_FILE.write_text(json.dumps(normalized, ensure_ascii=False, indent=2), encoding="utf-8")
    return normalized


def safe_filename(filename: str) -> str:
    name = Path(filename).name.strip() or "uploaded-file"
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name)
    return name[:160]


def extension_group(filename: str) -> str:
    ext = Path(filename).suffix.lower().lstrip(".")
    return ext if ext in {"xlsx", "xls", "csv"} else "other"


def json_response(handler: SimpleHTTPRequestHandler, payload: object, status: int = 200) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def read_cwa_config() -> dict:
    config = {
        "authorization": os.environ.get("CWA_AUTH_CODE", "").strip(),
        "city": "高雄市",
        "district": "鳳山區",
    }
    if CWA_CONFIG_FILE.exists():
        try:
            file_config = json.loads(CWA_CONFIG_FILE.read_text(encoding="utf-8"))
            config.update({key: value for key, value in file_config.items() if value})
        except json.JSONDecodeError:
            config["configError"] = "cwa_config.json 格式錯誤。"
    return config


def fetch_cwa_dataset(dataset_url: str, authorization: str) -> dict:
    query = urllib.parse.urlencode({"Authorization": authorization, "format": "JSON"})
    request = urllib.request.Request(f"{dataset_url}?{query}", headers={"User-Agent": "greenhouse-local-manager/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        if error.code in {401, 403}:
            raise RuntimeError("氣象署授權碼驗證失敗，請確認授權碼已啟用且可讀取天氣警特報資料。") from error
        raise RuntimeError(f"氣象署資料讀取失敗：HTTP {error.code}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"無法連線到氣象署開放資料平台：{error.reason}") from error
    except json.JSONDecodeError as error:
        raise RuntimeError("氣象署回傳資料格式無法解析。") from error


def warning_severity(text: str) -> dict:
    critical_keywords = ["颱風", "海上陸上", "超大豪雨", "大豪雨"]
    high_keywords = ["豪雨", "大雷雨", "劇烈天氣", "淹水"]
    medium_keywords = ["大雨", "強風", "大風", "低溫", "高溫", "濃霧"]

    if any(keyword in text for keyword in critical_keywords):
        return {"level": "嚴重", "severity": "critical"}
    if any(keyword in text for keyword in high_keywords):
        return {"level": "警戒", "severity": "high"}
    if any(keyword in text for keyword in medium_keywords):
        return {"level": "注意", "severity": "medium"}
    return {"level": "提醒", "severity": "watch"}


def severity_rank(severity: str) -> int:
    ranks = {
        "critical": 4,
        "high": 3,
        "medium": 2,
        "watch": 1,
    }
    return ranks.get(severity, 0)


def operational_guidance(severity: str) -> str:
    guidance_map = {
        "critical": "請立即檢查溫室結構、固定物、排水與備援電力，必要時暫停非必要作業並通知值班人員。",
        "high": "建議提前完成巡檢、加強排水與設施固定，並留意田區積水與感測設備狀態。",
        "medium": "請將今日巡檢列為優先項目，確認排風、遮棚與資料備份是否正常。",
        "watch": "建議持續觀察中央氣象署更新，並在日誌中註記可能影響作業的天氣變化。",
    }
    return guidance_map.get(severity, "請持續留意中央氣象署最新天氣警特報。")


def summarize_hazard(hazard: dict) -> dict:
    info = hazard.get("info", {})
    phenomena = info.get("phenomena") or info.get("phenomenon") or "天氣特報"
    significance = info.get("significance") or ""
    title = "".join(str(part) for part in [phenomena, significance] if part).strip() or "天氣特報"
    start_time = info.get("effective") or info.get("onset") or ""
    end_time = info.get("expires") or ""
    description = info.get("description") or info.get("instruction") or "請留意中央氣象署最新警特報。"
    severity = warning_severity(f"{title} {description}")
    return {
        "title": title,
        "type": phenomena,
        "description": str(description).strip(),
        "startTime": start_time,
        "endTime": end_time,
        **severity,
    }


def build_weather_alert_payload() -> dict:
    config = read_cwa_config()
    city = str(config.get("city") or "高雄市")
    district = str(config.get("district") or "鳳山區")
    authorization = str(config.get("authorization") or "").strip()

    now = time.time()
    cached_payload = weather_cache.get("payload")
    if isinstance(cached_payload, dict) and now < float(weather_cache.get("expiresAt", 0)):
        return cached_payload

    base_payload = {
        "location": f"{city}{district}",
        "city": city,
        "district": district,
        "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "alerts": [],
        "source": "中央氣象署開放資料平台 W-C0033-001",
        "headline": "一般管理狀態",
        "severity": "clear",
        "level": "正常",
        "guidance": "維持例行巡檢與資料登錄。",
    }

    if config.get("configError"):
        payload = {**base_payload, "status": "error", "message": config["configError"], "severity": "medium", "level": "設定提醒"}
        weather_cache.update({"expiresAt": now + 60, "payload": payload})
        return payload
    if not authorization:
        payload = {**base_payload, "status": "error", "message": "尚未設定中央氣象署授權碼。", "severity": "medium", "level": "設定提醒"}
        weather_cache.update({"expiresAt": now + 60, "payload": payload})
        return payload

    warning_data = fetch_cwa_dataset(CWA_WARNING_URL, authorization)
    locations = warning_data.get("records", {}).get("location", [])
    city_record = next((item for item in locations if item.get("locationName") == city), None)
    hazards = []
    if city_record:
        raw_hazards = city_record.get("hazardConditions", {}).get("hazards", [])
        if isinstance(raw_hazards, dict):
            hazards = raw_hazards.get("hazard", [])
        elif isinstance(raw_hazards, list):
            hazards = raw_hazards
        if isinstance(hazards, dict):
            hazards = [hazards]

    alerts = [summarize_hazard(hazard) for hazard in hazards]
    alerts.sort(key=lambda item: severity_rank(str(item.get("severity"))), reverse=True)
    message = "目前無高雄市鳳山區警特報。"
    headline = "目前無警特報"
    severity = "clear"
    level = "正常"
    guidance = "維持例行巡檢、感測測試與資料備份即可。"

    if alerts:
        detail_data = fetch_cwa_dataset(CWA_DETAIL_URL, authorization)
        detail_records = detail_data.get("records", {}).get("record", [])
        detail_text = "\n".join(
            str(record.get("contents", {}).get("content", {}).get("contentText", "")).strip()
            for record in detail_records
        ).strip()
        if detail_text:
            for alert in alerts:
                alert["description"] = detail_text
        message = "請依警特報等級調整溫室巡檢與固定作業。"
        top_alert = alerts[0]
        severity = str(top_alert.get("severity") or "watch")
        level = str(top_alert.get("level") or "提醒")
        headline = str(top_alert.get("title") or "天氣特報")
        guidance = operational_guidance(severity)

    payload = {
        **base_payload,
        "status": "ok",
        "alerts": alerts,
        "message": message,
        "headline": headline,
        "severity": severity,
        "level": level,
        "guidance": guidance,
    }
    weather_cache.update({"expiresAt": now + WEATHER_CACHE_TTL, "payload": payload})
    return payload


class GreenhouseHandler(SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/app-state":
            self.handle_get_app_state()
            return
        if parsed.path == "/api/weather-alerts":
            self.handle_weather_alerts(parsed.query)
            return
        if parsed.path == "/api/files":
            self.handle_list_files()
            return
        if parsed.path.startswith("/api/files/") and parsed.path.endswith("/download"):
            self.handle_download_file(parsed.path)
            return
        super().do_GET()

    def do_POST(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/files":
            self.handle_upload_file()
            return
        json_response(self, {"error": "Not found"}, 404)

    def do_DELETE(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith("/api/files/"):
            self.handle_delete_file(parsed.path)
            return
        json_response(self, {"error": "Not found"}, 404)

    def do_PUT(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/app-state":
            self.handle_put_app_state()
            return
        json_response(self, {"error": "Not found"}, 404)

    def handle_get_app_state(self) -> None:
        json_response(self, read_app_state())

    def handle_put_app_state(self) -> None:
        content_length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(content_length) if content_length > 0 else b""
        try:
            payload = json.loads(body.decode("utf-8"))
        except json.JSONDecodeError:
            json_response(self, {"error": "資料格式錯誤。"}, 400)
            return
        json_response(self, write_app_state(payload))

    def handle_list_files(self) -> None:
        records = sorted(read_metadata(), key=lambda item: (item.get("date", ""), item.get("createdAt", "")), reverse=True)
        public_records = [{key: value for key, value in record.items() if key != "path"} for record in records]
        json_response(self, public_records)

    def handle_weather_alerts(self, query_string: str) -> None:
        try:
            params = urllib.parse.parse_qs(query_string)
            if params.get("refresh") == ["1"]:
                weather_cache.update({"expiresAt": 0.0, "payload": None})
            json_response(self, build_weather_alert_payload())
        except RuntimeError as error:
            config = read_cwa_config()
            json_response(self, {
                "status": "error",
                "location": f"{config.get('city', '高雄市')}{config.get('district', '鳳山區')}",
                "city": config.get("city", "高雄市"),
                "district": config.get("district", "鳳山區"),
                "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
                "alerts": [],
                "source": "中央氣象署開放資料平台 W-C0033-001",
                "message": str(error),
            })

    def handle_upload_file(self) -> None:
        content_type = self.headers.get("Content-Type", "")
        if not content_type.startswith("multipart/form-data"):
            json_response(self, {"error": "請使用 multipart/form-data 上傳檔案。"}, 400)
            return

        form = cgi.FieldStorage(
            fp=self.rfile,
            headers=self.headers,
            environ={
                "REQUEST_METHOD": "POST",
                "CONTENT_TYPE": content_type,
            },
        )
        file_item = form["file"] if "file" in form else None
        if file_item is None or not getattr(file_item, "filename", ""):
            json_response(self, {"error": "沒有收到檔案。"}, 400)
            return

        date = str(form.getfirst("date", "")).strip() or time.strftime("%Y-%m-%d")
        note = str(form.getfirst("note", "")).strip()
        original_name = safe_filename(file_item.filename)
        group = extension_group(original_name)
        target_dir = DB_DIR / group / date
        target_dir.mkdir(parents=True, exist_ok=True)

        file_id = f"{int(time.time() * 1000)}-{os.urandom(4).hex()}"
        stored_name = f"{file_id}_{original_name}"
        target_path = target_dir / stored_name
        with target_path.open("wb") as output:
            shutil.copyfileobj(file_item.file, output)

        record = {
            "id": file_id,
            "date": date,
            "name": original_name,
            "storedName": stored_name,
            "extension": group,
            "size": target_path.stat().st_size,
            "note": note,
            "createdAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "path": str(target_path.relative_to(DB_DIR)),
        }
        records = read_metadata()
        records.append(record)
        write_metadata(records)
        json_response(self, {key: value for key, value in record.items() if key != "path"}, 201)

    def handle_download_file(self, path: str) -> None:
        file_id = urllib.parse.unquote(path.removeprefix("/api/files/").removesuffix("/download"))
        record = next((item for item in read_metadata() if item.get("id") == file_id), None)
        if not record:
            json_response(self, {"error": "找不到檔案。"}, 404)
            return

        file_path = (DB_DIR / record["path"]).resolve()
        if not file_path.is_file() or not str(file_path).startswith(str(DB_DIR.resolve())):
            json_response(self, {"error": "檔案不存在。"}, 404)
            return

        content_type = mimetypes.guess_type(record["name"])[0] or "application/octet-stream"
        encoded_name = urllib.parse.quote(record["name"])
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(file_path.stat().st_size))
        self.send_header("Content-Disposition", f"attachment; filename*=UTF-8''{encoded_name}")
        self.end_headers()
        with file_path.open("rb") as source:
            shutil.copyfileobj(source, self.wfile)

    def handle_delete_file(self, path: str) -> None:
        file_id = urllib.parse.unquote(path.removeprefix("/api/files/"))
        records = read_metadata()
        kept_records = []
        deleted = False
        for record in records:
            if record.get("id") != file_id:
                kept_records.append(record)
                continue
            file_path = (DB_DIR / record["path"]).resolve()
            if file_path.is_file() and str(file_path).startswith(str(DB_DIR.resolve())):
                file_path.unlink()
            deleted = True
        if not deleted:
            json_response(self, {"error": "找不到檔案。"}, 404)
            return
        write_metadata(kept_records)
        json_response(self, {"ok": True})


def main() -> None:
    ensure_database()
    os.chdir(ROOT)
    server = ThreadingHTTPServer((HOST, PORT), GreenhouseHandler)
    print(f"智慧溫室管理網站已啟動：http://{HOST}:{PORT}/")
    print(f"資料庫資料夾：{DB_DIR}")
    server.serve_forever()


if __name__ == "__main__":
    main()
