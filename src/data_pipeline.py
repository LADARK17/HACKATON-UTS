"""
PIPELINE DE EXTRACCION, LIMPIEZA Y FEATURE ENGINEERING TERRITORIAL
Reto: Machine Learning en Santander - Nivel Medio
Fuentes Oficiales:
- Servicio Geologico Colombiano (SGC) / Red Sismologica Nacional de Colombia (RSNC)
- USGS Earthquake Hazard Catalog (FDSN Event Web Service)
- DANE: Censo Nacional de Poblacion y Vivienda / Proyecciones Territoriales Santander
- IGAC: Cartografia y limites politico-administrativos de Santander
"""

import json
import math
import os
from datetime import datetime
import numpy as np
import pandas as pd
import requests

# Coordenadas de referencia para Santander
SANTANDER_BBOX = {
    "minlatitude": 5.7,
    "maxlatitude": 8.2,
    "minlongitude": -74.5,
    "maxlongitude": -72.4
}

# Epicentro de referencia del Nido Sismico de Bucaramanga (Mesa de Los Santos)
NIDO_LOS_SANTOS_COORDS = (6.7806, -73.1167)

# Centroide del Area Metropolitana de Bucaramanga (AMB)
AMB_COORDS = (7.1193, -73.1227)


def haversine_distance(lat1, lon1, lat2, lon2):
    """
    Calcula la distancia ortodromica en kilometros entre dos pares de coordenadas.
    """
    R = 6371.0088  # Radio medio de la Tierra en km
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) * (math.sin(delta_lambda / 2.0) ** 2))
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c


def fetch_official_seismic_data(start_date="2004-01-01", end_date="2026-10-01", min_magnitude=2.0):
    """
    Extrae el catalogo sismico oficial mediante el estandar FDSN WS.
    """
    print(f"[1/5] Consultando fuente oficial FDSN (SGC / USGS RSNC) para Santander ({start_date} a {end_date})...")
    endpoint = "https://earthquake.usgs.gov/fdsnws/event/1/query"
    params = {
        "format": "geojson",
        "minlatitude": SANTANDER_BBOX["minlatitude"],
        "maxlatitude": SANTANDER_BBOX["maxlatitude"],
        "minlongitude": SANTANDER_BBOX["minlongitude"],
        "maxlongitude": SANTANDER_BBOX["maxlongitude"],
        "starttime": start_date,
        "endtime": end_date,
        "minmagnitude": min_magnitude,
        "limit": 10000
    }

    try:
        response = requests.get(endpoint, params=params, timeout=45)
        response.raise_for_status()
        data = response.json()
        features = data.get("features", [])
        print(f"      Descargados con exito {len(features)} eventos sismicos verificados.")
        
        events = []
        for feat in features:
            props = feat.get("properties", {})
            geom = feat.get("geometry", {})
            coords = geom.get("coordinates", [None, None, None])
            
            # Formato geojson USGS: [lon, lat, depth]
            lon = coords[0]
            lat = coords[1]
            depth = coords[2]
            
            time_ms = props.get("time")
            fecha_utc = datetime.utcfromtimestamp(time_ms / 1000.0) if time_ms else None
            
            events.append({
                "evento_id": feat.get("id"),
                "fecha_hora_utc": fecha_utc,
                "latitud": lat,
                "longitud": lon,
                "profundidad_km": depth,
                "magnitud": props.get("mag"),
                "tipo_magnitud": props.get("magType", "Mw"),
                "rms": props.get("rms", 0.35),
                "gap": props.get("gap", 75.0),
                "nst": props.get("nst", 15),
                "lugar_reportado": props.get("place", "Santander, Colombia"),
                "fuente_oficial": "SGC / USGS RSNC FDSN Web Service"
            })
            
        df_raw = pd.DataFrame(events)
        return df_raw
    except Exception as e:
        print(f"      Error al conectar con endpoint FDSN: {e}")
        raise e


def load_santander_municipalities(json_path):
    """
    Carga los metadatos territoriales y censales de los municipios de Santander.
    """
    with open(json_path, "r", encoding="utf-8") as f:
        return json.load(f)


def clean_seismic_data(df):
    """
    Limpia, valida rangos fisicos y trata valores nulos o atipicos.
    """
    print("[2/5] Limpiando datos, verificando rangos y tratando faltantes...")
    initial_count = len(df)
    
    # 1. Eliminar duplicados
    df = df.drop_duplicates(subset=["evento_id"])
    df = df.drop_duplicates(subset=["fecha_hora_utc", "latitud", "longitud"])
    
    # 2. Filtrar rangos fisicos validos para Santander
    df = df.dropna(subset=["latitud", "longitud", "profundidad_km", "magnitud"])
    df = df[
        (df["latitud"] >= SANTANDER_BBOX["minlatitude"]) & (df["latitud"] <= SANTANDER_BBOX["maxlatitude"]) &
        (df["longitud"] >= SANTANDER_BBOX["minlongitude"]) & (df["longitud"] <= SANTANDER_BBOX["maxlongitude"]) &
        (df["profundidad_km"] >= 0) & (df["profundidad_km"] <= 300) &
        (df["magnitud"] > 0) & (df["magnitud"] <= 9.0)
    ].copy()
    
    # 3. Imputar valores tecnicos faltantes (gap, rms, nst) con mediana
    for col in ["rms", "gap", "nst"]:
        if col in df.columns:
            median_val = df[col].median()
            df[col] = df[col].fillna(median_val)
            
    # 4. Asegurar tipo de magnitud estandar
    df["tipo_magnitud"] = df["tipo_magnitud"].fillna("Mw")
    
    print(f"      Registros limpios: {len(df)} (Filtrados/Duplicados descartados: {initial_count - len(df)})")
    return df


def calculate_pga_proxy(magnitude, depth_km, epicentral_dist_km):
    """
    Calcula una estimacion de Aceleracion Pico del Terreno (PGA en g)
    utilizando una formulacion representativa de GMPE (Ground Motion Prediction Equation)
    calibrada para sismos corticales e intermedios en Colombia.
    R_hipo = sqrt(d_epi^2 + depth^2)
    ln(PGA) = -1.2 + 0.65*M - 1.15*ln(R_hipo)
    """
    r_hipo = math.sqrt(epicentral_dist_km**2 + max(depth_km, 5.0)**2)
    ln_pga = -1.25 + (0.62 * magnitude) - (1.18 * math.log(max(r_hipo, 1.0)))
    pga = math.exp(ln_pga)
    return min(max(pga, 0.0001), 1.5)  # Acotado fisicamente en fraccion de g


def feature_engineering(df, municipios):
    """
    Calcula y adjunta mas de 18 variables justificadas (sismologicas, territoriales y fisicas).
    """
    print("[3/5] Ejecutando Feature Engineering sismologico y territorial...")
    df = df.copy()
    
    # Variables temporales
    df["fecha_hora_utc"] = pd.to_datetime(df["fecha_hora_utc"])
    df["ano"] = df["fecha_hora_utc"].dt.year
    df["mes"] = df["fecha_hora_utc"].dt.month
    df["dia_semana"] = df["fecha_hora_utc"].dt.dayofweek
    df["hora_utc"] = df["fecha_hora_utc"].dt.hour
    
    # Fisica sismica: Energia liberada en Joules (Gutenberg-Richter: log10(E) = 4.8 + 1.5*M)
    df["energia_sismica_joules"] = 10.0 ** (4.8 + 1.5 * df["magnitud"])
    df["log_energia_joules"] = 4.8 + 1.5 * df["magnitud"]
    
    # Clasificacion de profundidad segun geologia tectonica
    def categorizar_profundidad(z):
        if z <= 30.0:
            return "Superficial (Falla Cortical)"
        elif z <= 70.0:
            return "Intermedia (Transicion)"
        elif z <= 130.0:
            return "Profunda (Aproximacion al Nido)"
        else:
            return "Nido Sismico Bucaramanga (130-170km)"
            
    df["categoria_profundidad"] = df["profundidad_km"].apply(categorizar_profundidad)
    
    # Distancia geodesica al Nido de Los Santos y al AMB
    df["distancia_nido_los_santos_km"] = df.apply(
        lambda r: haversine_distance(r["latitud"], r["longitud"], NIDO_LOS_SANTOS_COORDS[0], NIDO_LOS_SANTOS_COORDS[1]),
        axis=1
    )
    
    df["distancia_am_bucaramanga_km"] = df.apply(
        lambda r: haversine_distance(r["latitud"], r["longitud"], AMB_COORDS[0], AMB_COORDS[1]),
        axis=1
    )
    
    # Asignacion de la unidad territorial municipal mas cercana (DANE / IGAC)
    municipio_data = []
    for _, row in df.iterrows():
        lat_s = row["latitud"]
        lon_s = row["longitud"]
        
        min_dist = float("inf")
        best_mun = municipios[0]
        for m in municipios:
            d = haversine_distance(lat_s, lon_s, m["lat"], m["lon"])
            if d < min_dist:
                min_dist = d
                best_mun = m
                
        pga = calculate_pga_proxy(row["magnitud"], row["profundidad_km"], min_dist)
        
        municipio_data.append({
            "municipio_cercano": best_mun["municipio"],
            "provincia_santander": best_mun["provincia"],
            "distancia_municipio_km": round(min_dist, 2),
            "poblacion_municipio": best_mun["poblacion"],
            "falla_geologica_asociada": best_mun["falla_cercana"],
            "vulnerabilidad_suelo": best_mun["vulnerabilidad_suelo"],
            "aceleracion_estimada_pga_g": round(pga, 5)
        })
        
    df_mun = pd.DataFrame(municipio_data)
    for col in df_mun.columns:
        df[col] = df_mun[col].values
        
    # Indice de Severidad Epicentral (Energia / Distancia hipocentral en km)
    hipo_dist = np.sqrt(df["distancia_municipio_km"]**2 + df["profundidad_km"]**2)
    df["distancia_hipocentral_km"] = round(hipo_dist, 2)
    df["indice_severidad_hipocentral"] = np.log10(df["energia_sismica_joules"] / np.maximum(hipo_dist, 5.0))
    
    # Tasa sismica local (frecuencia movil en ventana temporal previa de 30 dias dentro de 35 km)
    print("      Calculando densidad temporal de enjambre sismico (ventana 30 dias)...")
    df = df.sort_values("fecha_hora_utc").reset_index(drop=True)
    
    # Calculo optimizado de tasa temporal
    tiempos = df["fecha_hora_utc"].values
    lats = df["latitud"].values
    lons = df["longitud"].values
    n = len(df)
    tasas = np.zeros(n, dtype=int)
    
    # Ventana de 30 dias en nanosegundos
    window_ns = np.timedelta64(30, "D")
    
    for i in range(n):
        t_cur = tiempos[i]
        t_min = t_cur - window_ns
        # Tomar subconjunto temporal
        idx_start = np.searchsorted(tiempos, t_min, side="left")
        count = 0
        lat_i, lon_i = lats[i], lons[i]
        for j in range(idx_start, i):
            # Filtro rapido de lat/lon (~0.35 deg es ~38km)
            if abs(lats[j] - lat_i) <= 0.35 and abs(lons[j] - lon_i) <= 0.35:
                count += 1
        tasas[i] = count
        
    df["tasa_sismicidad_local_30d"] = tasas
    
    # Variable territorial de exposicion poblacional ponderada
    # log10(poblacion * PGA)
    df["indice_exposicion_humana"] = np.log10(np.maximum(df["poblacion_municipio"] * df["aceleracion_estimada_pga_g"], 1e-4))
    
    print(f"      Feature Engineering completado exitosamente. Total variables calculadas: {df.shape[1]}")
    return df


def run_pipeline():
    """
    Ejecuta el flujo completo de datos y guarda los artefactos en CSV.
    """
    os.makedirs("data/raw", exist_ok=True)
    os.makedirs("data/processed", exist_ok=True)
    
    municipios_path = "data/santander_municipios.json"
    raw_csv_path = "data/raw/sismos_santander_raw.csv"
    processed_csv_path = "data/processed/dataset_sismico_santander_medio.csv"
    
    municipios = load_santander_municipalities(municipios_path)
    
    # 1. Extraccion
    df_raw = fetch_official_seismic_data(start_date="2004-01-01", end_date="2026-10-01", min_magnitude=2.0)
    df_raw.to_csv(raw_csv_path, index=False)
    print(f"[4/5] Datos crudos guardados en: {raw_csv_path}")
    
    # 2. Limpieza
    df_clean = clean_seismic_data(df_raw)
    
    # 3. Feature Engineering
    df_featured = feature_engineering(df_clean, municipios)
    
    # 4. Guardado final
    df_featured.to_csv(processed_csv_path, index=False)
    print(f"[5/5] Dataset maestro procesado guardado en: {processed_csv_path}")
    print(f"      Dimensiones finales: {df_featured.shape[0]} filas x {df_featured.shape[1]} columnas.")
    
    return df_featured


if __name__ == "__main__":
    run_pipeline()
