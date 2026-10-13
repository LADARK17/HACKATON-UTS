"""
MODULO DE MODELOS DE APRENDIZAJE NO SUPERVISADO
Reto: Machine Learning en Santander - Nivel Medio (Sismicidad y Riesgo Territorial)
Modelos implementados y comparados:
1. K-Means Clustering (con optimizacion de K via Codo y Silhouette)
2. DBSCAN (Density-Based Spatial Clustering of Applications with Noise)
3. Gaussian Mixture Models (GMM - Modelado Probabilistico Elipsoidal)
4. Agglomerative Hierarchical Clustering (Enlace Ward)

Metricas de evaluacion no supervisadas:
- Silhouette Score
- Davies-Bouldin Index
- Calinski-Harabasz Index
- Analisis de Componentes Principales (PCA) y Cargas Factoriales (Feature Importance)
"""

import json
import os
import joblib
import numpy as np
import pandas as pd
from sklearn.cluster import DBSCAN, AgglomerativeClustering, KMeans
from sklearn.decomposition import PCA
from sklearn.metrics import (
    calinski_harabasz_score,
    davies_bouldin_score,
    silhouette_score,
)
from sklearn.mixture import GaussianMixture
from sklearn.preprocessing import StandardScaler

# Variables clave para el modelado no supervisado territorial y sismico
FEATURE_COLUMNS = [
    "latitud",
    "longitud",
    "profundidad_km",
    "magnitud",
    "log_energia_joules",
    "distancia_nido_los_santos_km",
    "distancia_am_bucaramanga_km",
    "distancia_municipio_km",
    "aceleracion_estimada_pga_g",
    "distancia_hipocentral_km",
    "indice_severidad_hipocentral",
    "tasa_sismicidad_local_30d",
    "indice_exposicion_humana"
]


def prepare_features(df):
    """
    Selecciona las variables numericas explicativas y aplica escalado estandar.
    """
    X = df[FEATURE_COLUMNS].copy()
    
    # Manejar posibles NaNs o infinitos si existieran
    X = X.replace([np.inf, -np.inf], np.nan)
    X = X.fillna(X.median())
    
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)
    
    return X, X_scaled, scaler


def evaluate_clustering(X_scaled, labels, model_name):
    """
    Calcula metricas formales de evaluacion no supervisada.
    """
    # Filtrar ruido (-1 en DBSCAN) para metricas si es necesario
    mask = labels != -1
    unique_labels = set(labels[mask])
    
    if len(unique_labels) < 2:
        return {
            "modelo": model_name,
            "n_clusters": len(unique_labels),
            "silhouette": -1.0,
            "davies_bouldin": 999.0,
            "calinski_harabasz": 0.0,
            "ruido_puntos": int(np.sum(labels == -1))
        }
        
    sil = silhouette_score(X_scaled[mask], labels[mask])
    db = davies_bouldin_score(X_scaled[mask], labels[mask])
    ch = calinski_harabasz_score(X_scaled[mask], labels[mask])
    
    return {
        "modelo": model_name,
        "n_clusters": len(unique_labels),
        "silhouette": round(sil, 4),
        "davies_bouldin": round(db, 4),
        "calinski_harabasz": round(ch, 2),
        "ruido_puntos": int(np.sum(labels == -1))
    }


def find_optimal_kmeans_k(X_scaled, k_range=range(2, 8)):
    """
    Explora el rango de K para K-Means y selecciona el optimo segun Silhouette.
    """
    best_k = 3
    best_sil = -1
    elbow_data = []
    
    for k in k_range:
        km = KMeans(n_clusters=k, random_state=42, n_init=10)
        labels = km.fit_predict(X_scaled)
        sil = silhouette_score(X_scaled, labels)
        elbow_data.append({
            "k": k,
            "inertia": round(km.inertia_, 2),
            "silhouette": round(sil, 4)
        })
        if sil > best_sil:
            best_sil = sil
            best_k = k
            
    return best_k, elbow_data


def train_and_compare_models(data_path="data/processed/dataset_sismico_santander_medio.csv"):
    """
    Entrena y compara formalmente K-Means, DBSCAN, GMM y Clustering Jerarquico.
    """
    print("[1/4] Cargando dataset y normalizando variables sismicas y territoriales...")
    df = pd.read_csv(data_path)
    X, X_scaled, scaler = prepare_features(df)
    
    os.makedirs("models", exist_ok=True)
    joblib.dump(scaler, "models/scaler.pkl")
    
    # 1. K-Means
    print("[2/4] Optimizando y entrenando K-Means Clustering...")
    best_k, elbow_data = find_optimal_kmeans_k(X_scaled)
    # Por interpretabilidad sismologica territorial en Santander, 4 clusters capturan perfectamente:
    # 1) Nido Profundo Núcleo, 2) Sismicidad Cortical Superficial de Fallas, 3) Alta Magnitud / Severidad, 4) Periferia Regional
    k_selected = 4
    kmeans = KMeans(n_clusters=k_selected, random_state=42, n_init=15)
    kmeans_labels = kmeans.fit_predict(X_scaled)
    joblib.dump(kmeans, "models/kmeans_model.pkl")
    
    # 2. DBSCAN (Densidad de Enjambre Sismico)
    print("      Entrenando DBSCAN (Deteccion por Densidad Espaciotemporal y Ruido Tectonico)...")
    # Parametros calibrados para caracteristicas escaladas
    dbscan = DBSCAN(eps=1.85, min_samples=8)
    dbscan_labels = dbscan.fit_predict(X_scaled)
    joblib.dump(dbscan, "models/dbscan_model.pkl")
    
    # 3. Gaussian Mixture Models (GMM)
    print("      Entrenando Gaussian Mixture Model (GMM - Distribuciones Elipsoidales de Benioff)...")
    gmm = GaussianMixture(n_components=4, covariance_type="full", random_state=42)
    gmm_labels = gmm.fit_predict(X_scaled)
    joblib.dump(gmm, "models/gmm_model.pkl")
    
    # 4. Agglomerative Hierarchical Clustering
    print("      Entrenando Clustering Jerarquico Aglomerativo (Ward Linkage)...")
    hierarchical = AgglomerativeClustering(n_clusters=4, linkage="ward")
    hier_labels = hierarchical.fit_predict(X_scaled)
    joblib.dump(hierarchical, "models/hierarchical_model.pkl")
    
    # Evaluacion y Tabla Comparativa de Rendimiento
    print("[3/4] Evaluando metricas cuantitativas de validacion de clustering...")
    comparison_results = [
        evaluate_clustering(X_scaled, kmeans_labels, "K-Means (k=4)"),
        evaluate_clustering(X_scaled, dbscan_labels, "DBSCAN (eps=1.85, min=8)"),
        evaluate_clustering(X_scaled, gmm_labels, "Gaussian Mixture Model (k=4)"),
        evaluate_clustering(X_scaled, hier_labels, "Jerarquico Ward (k=4)")
    ]
    df_comparison = pd.DataFrame(comparison_results)
    print("\n--- TABLA COMPARATIVA DE ENFOQUES NO SUPERVISADOS ---")
    print(df_comparison.to_string(index=False))
    
    # 5. Reduccion de Dimensionalidad e Importancia de Variables (PCA)
    print("\n[4/4] Calculando PCA para visualizacion y cargas factoriales...")
    pca = PCA(n_components=3, random_state=42)
    X_pca = pca.fit_transform(X_scaled)
    joblib.dump(pca, "models/pca_model.pkl")
    
    explained_variance = pca.explained_variance_ratio_
    print(f"      Varianza explicada por componentes: PC1: {explained_variance[0]:.2%}, PC2: {explained_variance[1]:.2%}, PC3: {explained_variance[2]:.2%}")
    print(f"      Varianza acumulada total (3 PCs): {np.sum(explained_variance):.2%}")
    
    # Cargas factoriales de las variables (Feature Importance)
    pca_loadings = pd.DataFrame(
        pca.components_.T,
        columns=["PC1_Amenaza_Fisica", "PC2_Territorio_Proximidad", "PC3_Densidad_Enjambre"],
        index=FEATURE_COLUMNS
    )
    pca_loadings["Magnitud_Impacto_Abs"] = pca_loadings.abs().mean(axis=1)
    pca_loadings = pca_loadings.sort_values("Magnitud_Impacto_Abs", ascending=False)
    
    print("\n--- IMPORTANCIA DE VARIABLES (CARGAS FACTORIALES PCA) ---")
    print(pca_loadings[["Magnitud_Impacto_Abs", "PC1_Amenaza_Fisica", "PC2_Territorio_Proximidad"]].head(10))
    
    # Asignar resultados al dataframe
    df["cluster_kmeans"] = kmeans_labels
    df["cluster_dbscan"] = dbscan_labels
    df["cluster_gmm"] = gmm_labels
    df["cluster_jerarquico"] = hier_labels
    df["pca_1"] = np.round(X_pca[:, 0], 4)
    df["pca_2"] = np.round(X_pca[:, 1], 4)
    df["pca_3"] = np.round(X_pca[:, 2], 4)
    
    # Interpretacion Geocientifica y Sismologica de los Clusters (K-Means como modelo primario)
    # Analizamos los centroides reales
    cluster_means = df.groupby("cluster_kmeans")[FEATURE_COLUMNS].mean()
    
    # Mapeo semantico de clusters segun fisica de sismos
    cluster_names = {}
    for c_id in range(k_selected):
        row = cluster_means.loc[c_id]
        depth = row["profundidad_km"]
        pga = row["aceleracion_estimada_pga_g"]
        dist_los_santos = row["distancia_nido_los_santos_km"]
        mag = row["magnitud"]
        
        if depth < 50.0:
            nombre = "Sismicidad Cortical Superficial (Fallas Activas Urbanas)"
            nivel_riesgo = "Riesgo Muy Alto (Alta Sacudida Superficial)"
        elif mag >= 4.0 or pga > 0.05:
            nombre = "Eventos de Moderada/Alta Magnitud (Liberación Regional)"
            nivel_riesgo = "Riesgo Alto (Perceptible y Alerta Infraestructura)"
        elif dist_los_santos <= 25.0:
            nombre = "Núcleo del Nido Sísmico de Bucaramanga (Intermedio Típico)"
            nivel_riesgo = "Riesgo Moderado (Recurrente, Atenuación Profunda)"
        else:
            nombre = "Sismicidad Periférica Transicional de Santander"
            nivel_riesgo = "Riesgo Bajo a Moderado (Disperso Regional)"
            
        cluster_names[c_id] = {
            "nombre": nombre,
            "nivel_riesgo": nivel_riesgo
        }
        
    df["cluster_nombre"] = df["cluster_kmeans"].map(lambda x: cluster_names[x]["nombre"])
    df["cluster_nivel_riesgo"] = df["cluster_kmeans"].map(lambda x: cluster_names[x]["nivel_riesgo"])
    
    # Guardar dataset final con asignaciones de cluster
    df.to_csv("data/processed/dataset_sismico_santander_medio.csv", index=False)
    
    # Guardar metadatos y reporte para el informe y dashboard
    report = {
        "k_selected": k_selected,
        "elbow_data": elbow_data,
        "metricas_comparativas": comparison_results,
        "varianza_pca": [float(v) for v in explained_variance],
        "cluster_perfiles": cluster_means.to_dict(orient="index"),
        "cluster_names": cluster_names,
        "variables_utilizadas": FEATURE_COLUMNS,
        "pca_loadings": pca_loadings.reset_index().to_dict(orient="records")
    }
    
    with open("models/metricas_modelos.json", "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
        
    print("\n[OK] Modelos no supervisados, metricas y perfiles guardados exitosamente en 'models/'.")
    return df, report


if __name__ == "__main__":
    train_and_compare_models()
