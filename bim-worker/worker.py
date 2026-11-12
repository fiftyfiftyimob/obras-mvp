"""Poll private IFC imports and persist extracted elements and declared quantities."""
import json
import os
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from extrair_ifc import extract

BASE = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
HEADERS = {"apikey": KEY, "Authorization": "Bearer " + KEY}
BATCH = 200


def request(method, path, data=None, headers=None):
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(
        BASE + path, data=body, method=method,
        headers={**HEADERS, **({"Content-Type": "application/json"} if body else {}), **(headers or {})},
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as response:
            raw = response.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        detail = error.read(1000).decode("utf-8", "replace")
        raise RuntimeError(f"HTTP {error.code}: {detail}") from error


def table_path(table, query=""):
    return "/rest/v1/" + table + ("?" + query if query else "")


def process(job):
    job_id = job["id"]
    file_path = urllib.parse.quote(job["caminho_arquivo"], safe="/")
    with tempfile.TemporaryDirectory(prefix="obras-ifc-") as directory:
        local = Path(directory) / "modelo.ifc"
        req = urllib.request.Request(
            BASE + "/storage/v1/object/modelos-bim/" + file_path,
            headers=HEADERS,
        )
        with urllib.request.urlopen(req, timeout=600) as source, local.open("wb") as target:
            while chunk := source.read(1024 * 1024):
                target.write(chunk)
        if local.stat().st_size != job["tamanho_bytes"]:
            raise ValueError("Tamanho do arquivo diverge do cadastro.")
        result = extract(local)
    request("DELETE", table_path("bim_elementos", "importacao_id=eq." + job_id))
    pending = 0
    elements = result["elementos"]
    for start in range(0, len(elements), BATCH):
        subset = elements[start:start + BATCH]
        rows = [{
            "importacao_id": job_id, "obra_id": job["obra_id"],
            "global_id": item["global_id"], "classe": item["classe"],
            "nome": item["nome"], "local": item["local"],
            "local_global_id": item["local_global_id"],
            "pendencias": item["pendencias"],
        } for item in subset]
        created = request(
            "POST", table_path("bim_elementos"), rows,
            {"Prefer": "return=representation"},
        )
        quantities = []
        for item, row in zip(subset, created, strict=True):
            pending += len(item["pendencias"])
            for quantity in item["quantidades"]:
                if quantity["pendencia"]:
                    pending += 1
                quantities.append({
                    "elemento_id": row["id"], "importacao_id": job_id,
                    "obra_id": job["obra_id"], **quantity,
                })
        for offset in range(0, len(quantities), BATCH):
            request("POST", table_path("bim_quantidades"), quantities[offset:offset + BATCH],
                    {"Prefer": "return=minimal"})
    request("PATCH", table_path("bim_importacoes", "id=eq." + job_id), {
        "estado": "concluida", "schema_ifc": result["schema"],
        "total_elementos": len(elements), "total_pendencias": pending,
        "erro": None, "lease_ate": None,
        "concluido_em": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    })


def main():
    while True:
        try:
            claimed = request("POST", "/rest/v1/rpc/bim_reivindicar_importacao", {})
            if claimed:
                job = claimed[0]
                try:
                    process(job)
                except Exception as error:
                    attempts = job["tentativas"]
                    retry = attempts < 3
                    request("PATCH", table_path("bim_importacoes", "id=eq." + job["id"]), {
                        "estado": "pendente" if retry else "falha",
                        "erro": str(error)[:500],
                        "lease_ate": None,
                        "processar_apos": time.strftime(
                            "%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + 60 * attempts)
                        ),
                    })
                    print(json.dumps({"importacao": job["id"], "erro": str(error)[:500]}), flush=True)
            else:
                time.sleep(10)
        except Exception as error:
            print(json.dumps({"worker": str(error)[:500]}), flush=True)
            time.sleep(30)


if __name__ == "__main__":
    main()
