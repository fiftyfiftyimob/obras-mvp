import json
import os
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler

from extrair_ifc import extract

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
HEADERS = {"apikey": SERVICE_KEY, "Authorization": "Bearer " + SERVICE_KEY}
BATCH = 200

def api(method, path, data=None, extra=None):
    payload = json.dumps(data).encode() if data is not None else None
    request = urllib.request.Request(
        SUPABASE_URL + path, data=payload, method=method,
        headers={**HEADERS, **({"Content-Type": "application/json"} if payload else {}), **(extra or {})},
    )
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            raw = response.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        raise RuntimeError("Supabase HTTP %s: %s" % (error.code, error.read(800).decode("utf-8", "replace")))

def table_path(table, query=""):
    return "/rest/v1/" + table + ("?" + query if query else "")

def process(job):
    job_id = job["id"]
    path = urllib.parse.quote(job["caminho_arquivo"], safe="/")
    with tempfile.TemporaryDirectory(prefix="obras-ifc-") as directory:
        local = os.path.join(directory, "modelo.ifc")
        request = urllib.request.Request(
            SUPABASE_URL + "/storage/v1/object/modelos-bim/" + path, headers=HEADERS
        )
        with urllib.request.urlopen(request, timeout=600) as source, open(local, "wb") as target:
            while chunk := source.read(1024 * 1024):
                target.write(chunk)
        if os.path.getsize(local) != job["tamanho_bytes"]:
            raise ValueError("Tamanho do arquivo diverge do cadastro.")
        result = extract(local)
    api("DELETE", table_path("bim_elementos", "importacao_id=eq." + job_id))
    pending = sum(len(item["pendencias"]) + sum(1 for q in item["quantidades"] if q["pendencia"])
                  for item in result["elementos"])
    for start in range(0, len(result["elementos"]), BATCH):
        subset = result["elementos"][start:start + BATCH]
        rows = [{
            "importacao_id": job_id, "obra_id": job["obra_id"],
            "global_id": item["global_id"], "classe": item["classe"], "nome": item["nome"],
            "local": item["local"], "local_global_id": item["local_global_id"],
            "pendencias": item["pendencias"],
        } for item in subset]
        created = api("POST", table_path("bim_elementos"), rows,
                      {"Prefer": "return=representation"})
        quantities = []
        for item, row in zip(subset, created):
            quantities.extend({
                "elemento_id": row["id"], "importacao_id": job_id,
                "obra_id": job["obra_id"], **quantity
            } for quantity in item["quantidades"])
        for offset in range(0, len(quantities), BATCH):
            api("POST", table_path("bim_quantidades", ""),
                quantities[offset:offset + BATCH], {"Prefer": "return=minimal"})
    api("PATCH", table_path("bim_importacoes", "id=eq." + job_id), {
        "estado": "concluida", "schema_ifc": result["schema"],
        "total_elementos": len(result["elementos"]), "total_pendencias": pending,
        "erro": None, "lease_ate": None,
        "concluido_em": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    })

def claim():
    rows = api("POST", "/rest/v1/rpc/bim_reivindicar_importacao", {})
    return rows[0] if rows else None

def authorized(request):
    expected = os.environ.get("BIM_WORKER_SECRET") or os.environ.get("CRON_SECRET")
    supplied = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
    return bool(expected and supplied and supplied == expected)

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.run()
    def do_POST(self):
        self.run()
    def run(self):
        if not authorized(self):
            self.send_response(401)
            self.end_headers()
            self.wfile.write(b'{"error":"unauthorized"}')
            return
        job = None
        try:
            job = claim()
            if not job:
                self.respond(200, {"ok": True, "status": "empty"})
                return
            try:
                process(job)
                self.respond(200, {"ok": True, "id": job["id"], "status": "concluida"})
            except Exception as error:
                attempts = int(job["tentativas"])
                api("PATCH", table_path("bim_importacoes", "id=eq." + job["id"]), {
                    "estado": "pendente" if attempts < 3 else "falha",
                    "erro": str(error)[:500], "lease_ate": None,
                    "processar_apos": time.strftime(
                        "%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + 60 * max(attempts, 1))
                    ),
                })
                self.respond(500, {"ok": False, "id": job["id"], "error": str(error)[:500]})
        except Exception as error:
            self.respond(500, {"ok": False, "error": str(error)[:500]})

    def respond(self, status, body):
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(payload)
