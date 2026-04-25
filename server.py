from __future__ import annotations

import cgi
import json
import mimetypes
import os
import re
import shutil
import time
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parent
DB_DIR = ROOT / "本機資料庫"
METADATA_FILE = DB_DIR / "metadata.json"
HOST = "127.0.0.1"
PORT = 8088


def ensure_database() -> None:
    DB_DIR.mkdir(exist_ok=True)
    if not METADATA_FILE.exists():
        METADATA_FILE.write_text("[]", encoding="utf-8")


def read_metadata() -> list[dict]:
    ensure_database()
    try:
        return json.loads(METADATA_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []


def write_metadata(records: list[dict]) -> None:
    ensure_database()
    METADATA_FILE.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")


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


class GreenhouseHandler(SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
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

    def handle_list_files(self) -> None:
        records = sorted(read_metadata(), key=lambda item: (item.get("date", ""), item.get("createdAt", "")), reverse=True)
        public_records = [{key: value for key, value in record.items() if key != "path"} for record in records]
        json_response(self, public_records)

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
