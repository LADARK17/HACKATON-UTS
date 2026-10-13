"""
MODULO DE ESTIMACION DEL INDICE COMPUESTO DE RIESGO SISMICO TERRITORIAL (ICRST)
Reto: Machine Learning en Santander - Nivel Medio
Objetivo: Transformar los grupos no supervisados de sismicidad en una explicacion
cuantitativa y territorial util para la gestion del riesgo (CDGRD Santander / UNGRD).
"""

import json
import numpy as np
import pandas as pd


def compute_territorial_risk_index(
    dataset_path="data/processed/dataset_sismico_santander_medio.csv",
    municipios_path="data/santander_municipios.json"
):
    """
    Calcula el ICRST por municipio integrando amenaza fisica, exposicion y vulnerabilidad.
    """
    print("[1/3] Cargando dataset con clusters y metadatos territoriales...")
    df_sismos = pd.read_csv(dataset_path)
    with open(municipios_path, "r", encoding="utf-8") as f:
        municipios = json.load(f)
        
    df_mun = pd.DataFrame(municipios)
    
    # Agregacion sismica por municipio
    # 1. Total de eventos asociados
    # 2. Magnitud maxima y promedio
    # 3. Profundidad media y minima
    # 4. Energia sismica liberada acumulada (Joules)
    # 5. Aceleracion PGA maxima estimada
    # 6. Distribucion de clusters por municipio
    print("[2/3] Agregando metricas sismologicas y de clusters a nivel municipal...")
    
    stats_list = []
    total_sismos = len(df_sismos)
    
    for _, mun_row in df_mun.iterrows():
        nombre_m = mun_row["municipio"]
        df_sub = df_sismos[df_sismos["municipio_cercano"] == nombre_m]
        
        n_events = len(df_sub)
        if n_events > 0:
            mag_max = df_sub["magnitud"].max()
            mag_mean = df_sub["magnitud"].mean()
            prof_min = df_sub["profundidad_km"].min()
            prof_mean = df_sub["profundidad_km"].mean()
            pga_max = df_sub["aceleracion_estimada_pga_g"].max()
            pga_mean = df_sub["aceleracion_estimada_pga_g"].mean()
            energia_total = df_sub["energia_sismica_joules"].sum()
            log_energia_total = np.log10(max(energia_total, 1.0))
            
            # Sismos superficiales criticos (profundidad <= 40 km)
            sismos_superficiales = int((df_sub["profundidad_km"] <= 40.0).sum())
            pct_superficial = (sismos_superficiales / n_events) * 100.0
            
            # Conteo de cluster dominante
            cluster_dom = int(df_sub["cluster_kmeans"].mode()[0])
            cluster_nombre_dom = df_sub[df_sub["cluster_kmeans"] == cluster_dom]["cluster_nombre"].iloc[0]
            
            # Anomalías DBSCAN en este municipio
            anomalias_dbscan = int((df_sub["cluster_dbscan"] == -1).sum())
        else:
            mag_max = 0.0
            mag_mean = 0.0
            prof_min = 150.0
            prof_mean = 150.0
            pga_max = 0.001
            pga_mean = 0.001
            energia_total = 0.0
            log_energia_total = 0.0
            sismos_superficiales = 0
            pct_superficial = 0.0
            cluster_dom = 3
            cluster_nombre_dom = "Sismicidad Periferica Transicional"
            anomalias_dbscan = 0
            
        stats_list.append({
            "municipio": nombre_m,
            "provincia": mun_row["provincia"],
            "lat": mun_row["lat"],
            "lon": mun_row["lon"],
            "poblacion": mun_row["poblacion"],
            "falla_cercana": mun_row["falla_cercana"],
            "vulnerabilidad_suelo": mun_row["vulnerabilidad_suelo"],
            "total_sismos_registrados": n_events,
            "porcentaje_sismicidad_dpto": round((n_events / total_sismos) * 100.0, 2),
            "magnitud_maxima": round(mag_max, 2),
            "magnitud_promedio": round(mag_mean, 2),
            "profundidad_minima_km": round(prof_min, 1),
            "profundidad_promedio_km": round(prof_mean, 1),
            "aceleracion_pga_maxima_g": round(pga_max, 4),
            "aceleracion_pga_promedio_g": round(pga_mean, 4),
            "log_energia_sismica_total": round(log_energia_total, 2),
            "sismos_superficiales_destructivos": sismos_superficiales,
            "pct_sismicidad_superficial": round(pct_superficial, 1),
            "cluster_dominante": cluster_dom,
            "cluster_nombre_dominante": cluster_nombre_dom,
            "anomalias_tectonicas_dbscan": anomalias_dbscan
        })
        
    df_territorial = pd.DataFrame(stats_list)
    
    # 3. Calculo del Indice Compuesto Normalizado (ICRST) de 0 a 100
    print("[3/3] Calculando el Indice Compuesto ICRST (Peligro, Exposicion, Vulnerabilidad)...")
    
    # Normalizacion MinMax de subindices
    def min_max(series):
        rng = series.max() - series.min()
        return (series - series.min()) / (rng if rng > 0 else 1.0)
        
    # Subindice de Peligro Sismico Fisico (Hazard):
    # Combina log de energia, tasa de eventos, PGA maxima y sismos superficiales
    sub_amenaza = (
        0.30 * min_max(df_territorial["log_energia_sismica_total"]) +
        0.25 * min_max(df_territorial["total_sismos_registrados"]) +
        0.25 * min_max(df_territorial["aceleracion_pga_maxima_g"]) +
        0.20 * min_max(df_territorial["sismos_superficiales_destructivos"])
    )
    
    # Subindice de Exposicion Humana (Exposure):
    # Logaritmo de la poblacion censada DANE
    sub_exposicion = min_max(np.log10(df_territorial["poblacion"]))
    
    # Subindice de Vulnerabilidad Geotecnica y Estructural (Vulnerability):
    # Asignacion segun tipo de suelo y patrimonio construido
    def factor_vulnerabilidad(row):
        score = 0.5
        v_suelo = row["vulnerabilidad_suelo"].lower()
        if "aluvial" in v_suelo or "blando" in v_suelo or "ladera" in v_suelo or "escarpe" in v_suelo:
            score += 0.3
        if "tapia" in v_suelo or "patrimonio" in v_suelo:
            score += 0.2
        return min(score, 1.0)
        
    sub_vulnerabilidad = df_territorial.apply(factor_vulnerabilidad, axis=1)
    
    # ICRST Ponderado:
    # 40% Peligro Fisico + 35% Exposicion Humana + 25% Vulnerabilidad Territorial
    icrst = (0.40 * sub_amenaza + 0.35 * sub_exposicion + 0.25 * sub_vulnerabilidad) * 100.0
    df_territorial["subindice_peligro_fisico"] = np.round(sub_amenaza * 100.0, 1)
    df_territorial["subindice_exposicion"] = np.round(sub_exposicion * 100.0, 1)
    df_territorial["subindice_vulnerabilidad"] = np.round(sub_vulnerabilidad * 100.0, 1)
    df_territorial["icrst_score"] = np.round(icrst, 1)
    
    # Categorizacion del riesgo
    def categorizar_icrst(score):
        if score >= 70.0:
            return "Muy Alto (Atencion Prioritaria)"
        elif score >= 50.0:
            return "Alto (Monitoreo Continuo)"
        elif score >= 35.0:
            return "Medio (Riesgo Moderado)"
        else:
            return "Bajo a Moderado (Baja Exposicion)"
            
    df_territorial["nivel_riesgo_territorial"] = df_territorial["icrst_score"].apply(categorizar_icrst)
    df_territorial = df_territorial.sort_values("icrst_score", ascending=False).reset_index(drop=True)
    
    # Guardar resultados
    csv_out = "data/processed/riesgo_territorial_santander.csv"
    json_out = "data/processed/riesgo_territorial_santander.json"
    df_territorial.to_csv(csv_out, index=False)
    
    records = df_territorial.to_dict(orient="records")
    with open(json_out, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2, ensure_ascii=False)
        
    print("\n--- CLASIFICACION DEL RIESGO SISMICO TERRITORIAL DE SANTANDER (ICRST) ---")
    print(df_territorial[["municipio", "provincia", "total_sismos_registrados", "magnitud_maxima", "aceleracion_pga_maxima_g", "icrst_score", "nivel_riesgo_territorial"]].to_string(index=False))
    print(f"\n[OK] Resultados territoriales guardados en {csv_out} y {json_out}.")
    return df_territorial


if __name__ == "__main__":
    compute_territorial_risk_index()
