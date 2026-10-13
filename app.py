"""
SERVIDOR LOCAL Y API REST PARA EL PROTOTIPO DE MACHINE LEARNING TERRITORIAL
Reto: Machine Learning en Santander - Nivel Medio (UTS / CIAI 2026)
Ejecucion: python app.py
Acceso: http://localhost:8000
"""

import http.server
import json
import os
import socketserver
import urllib.parse

PORT = 8000
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(BASE_DIR, "web")
DATA_DIR = os.path.join(BASE_DIR, "data", "processed")
MODELS_DIR = os.path.join(BASE_DIR, "models")


class GeoSismoHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        if path == "/api/sismos":
            self.serve_sismos_json()
        elif path == "/api/riesgo":
            self.serve_file_json(os.path.join(DATA_DIR, "riesgo_territorial_santander.json"))
        elif path == "/api/metricas":
            self.serve_file_json(os.path.join(MODELS_DIR, "metricas_modelos.json"))
        elif path == "/api/municipios":
            self.serve_file_json(os.path.join(BASE_DIR, "data", "santander_municipios.json"))
        else:
            super().do_GET()

    def serve_file_json(self, file_path):
        if not os.path.exists(file_path):
            self.send_error(404, f"Archivo no encontrado: {file_path}")
            return
        with open(file_path, "r", encoding="utf-8") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(data.encode("utf-8"))

    def serve_sismos_json(self):
        csv_path = os.path.join(DATA_DIR, "dataset_sismico_santander_medio.csv")
        if not os.path.exists(csv_path):
            self.send_error(404, "Dataset procesado no encontrado.")
            return

        try:
            import pandas as pd
            df = pd.read_csv(csv_path)
            records = df.to_dict(orient="records")
        except ImportError:
            import csv
            def _parse_val(val):
                if val is None or val == "":
                    return None
                try:
                    ival = int(val)
                    if str(ival) == val:
                        return ival
                except ValueError:
                    pass
                try:
                    return float(val)
                except ValueError:
                    return val

            records = []
            with open(csv_path, mode="r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    records.append({k: _parse_val(v) for k, v in row.items()})

        json_str = json.dumps(records, ensure_ascii=False)

        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json_str.encode("utf-8"))


def run_server():
    os.chdir(BASE_DIR)
    with socketserver.TCPServer(("", PORT), GeoSismoHandler) as httpd:
        print("=" * 70)
        print("[+] SERVIDOR DEL PROTOTIPO GEOSISMO SANTANDER EN VIVO")
        print(f"[*] Acceso web en navegador: http://localhost:{PORT}")
        print("[*] Sala 315A - Universitaria Tecnologica de Santander (UTS) / CIAI")
        print("=" * 70)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServidor detenido por el usuario.")


if __name__ == "__main__":
    run_server()
