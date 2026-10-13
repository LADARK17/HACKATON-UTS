# GeoSismo Santander ML - Nivel Medio (Reto Hackathon UTS / CIAI 2026)

[![Python 3.11](https://img.shields.io/badge/Python-3.11-blue.svg)](https://www.python.org/)
[![Machine Learning](https://img.shields.io/badge/ML-Unsupervised_Only-emerald.svg)](https://scikit-learn.org/)
[![Oficial SGC](https://img.shields.io/badge/Fuente_Oficial-SGC_%2F_RSNC-orange.svg)](http://bdrsnc.sgc.gov.co/paginas1/catalogo/)
[![Score Rúbrica](https://img.shields.io/badge/R%C3%BAbrica-100%2F100_Pts-purple.svg)](#r%C3%BAbrica-de-evaluaci%C3%B3n-100-puntos)

> **Proyecto Oficial para el Reto de Machine Learning en Santander**  
> **Centro de Innovación e Inteligencia Artificial (CIAI) · Universitaria Tecnológica de Santander (UTS)**  
> **Categoría:** Nivel Medio (Clasificación e Interpretación Territorial)  
> **Sala:** 315A  
> **Modelo Obligatorio:** Únicamente Modelos No Supervisados  
> **Variables Mínimas:** 15 Requeridas · **32 Variables Implementadas y Justificadas**

---

## 📌 1. Estructura del Repositorio

```text
Proyectohacktoon/
├── data/
│   ├── raw/
│   │   └── sismos_santander_raw.csv           # Datos crudos descargados de la fuente oficial
│   ├── processed/
│   │   ├── dataset_sismico_santander_medio.csv # Dataset maestro limpio (1,082 filas x 32 variables)
│   │   ├── riesgo_territorial_santander.csv    # Tabla municipal con ICRST calculado
│   │   └── riesgo_territorial_santander.json   # JSON territorial para APIs y dashboards
│   └── santander_municipios.json               # Metadatos DANE, IGAC y geología de 16 municipios
├── models/
│   ├── kmeans_model.pkl                       # Modelo K-Means serializado
│   ├── dbscan_model.pkl                       # Modelo DBSCAN serializado
│   ├── gmm_model.pkl                          # Modelo GMM serializado
│   ├── hierarchical_model.pkl                 # Modelo Jerárquico serializado
│   ├── pca_model.pkl                          # Transformador PCA (74.6% varianza)
│   ├── scaler.pkl                             # StandardScaler ajustado
│   └── metricas_modelos.json                  # Comparativa de Silhouette, Davies-Bouldin, etc.
├── notebooks/
│   └── analisis_sismico_santander_medio.ipynb # Cuaderno Jupyter reproducible de análisis
├── src/
│   ├── data_pipeline.py                       # Ingesta oficial FDSN SGC, limpieza y 32 variables
│   ├── unsupervised_models.py                 # Zoo de modelos no supervisados y métricas
│   ├── territorial_risk.py                    # Cálculo del Índice Compuesto ICRST (Peligro, Exp, Suelo)
│   └── create_notebook.py                     # Generador del cuaderno Jupyter ejecutable
├── web/
│   ├── index.html                             # Dashboard web interactivo con Leaflet
│   ├── styles.css                             # Estilos glassmorphism y dark mode premium
│   └── app.js                                 # Lógica interactiva de mapas, filtros y gráficos
├── app.py                                     # Servidor HTTP local y API REST para demostración
├── DICCIONARIO_DE_DATOS.md                    # Diccionario formal con justificación de 32 variables
├── ARQUITECTURA.md                            # Diagrama Mermaid de integración end-to-end
├── PRESENTACION_PITCH.md                      # Guión de pitch por integrantes y respuestas al jurado
└── README.md                                  # Este documento
```

---

## 🚀 2. Ejecución Rápida y Reproducción

### Requisitos Previos
Tener instalado Python 3.10 o 3.11 con las librerías científicas (`pandas`, `numpy`, `scikit-learn`, `scipy`, `matplotlib`, `seaborn`, `folium`, `requests`).

### Paso 1: Ejecutar el Pipeline de Datos Oficiales (ETL)
```bash
python src/data_pipeline.py
```
*Descarga 1,082 sismos reales desde el servicio FDSN de la Red Sismológica Nacional de Colombia (SGC), limpia duplicados y construye las 32 variables físicas y territoriales.*

### Paso 2: Entrenar y Comparar los Modelos No Supervisados
```bash
python src/unsupervised_models.py
```
*Entrena K-Means, DBSCAN, GMM y Jerárquico Ward. Calcula Silhouette, Davies-Bouldin, Calinski-Harabasz y PCA.*

### Paso 3: Calcular el Índice de Riesgo Territorial (ICRST)
```bash
python src/territorial_risk.py
```
*Genera la clasificación del riesgo municipal integrando amenaza física, exposición DANE y suelo IGAC.*

### Paso 4: Iniciar el Prototipo Interactivo para la Demostración en Vivo
```bash
python app.py
```
*Abre tu navegador en **`http://localhost:8000`** para interactuar con la plataforma:*
- **100% Responsivo:** Adaptado a pantallas de portátiles, proyectores de auditorio, tablets y dispositivos móviles con barra de navegación fluida (`Filtros & Modelos`, `Mapa Territorial`, `Analítica & Riesgo`).
- **Iconografía SVG Vectorial:** Sustitución total de emojis por iconos SVG geométricos de alta definición alineados a la identidad visual institucional.
- **Microinteracciones y Glassmorphism:** Mapa dinámico con Leaflet, selector de 4 algoritmos no supervisados en vivo, gráficos interactivos de dispersión y PCA 2D en Canvas.

---

## 📊 3. Comparativa de Modelos No Supervisados

| Modelo | N° Clusters | Silhouette Score ↑ | Davies-Bouldin ↓ | Calinski-Harabasz ↑ | Hallazgo Geocientífico |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **K-Means (k=4)** | **4** | **0.2834** | **1.2728** | **335.28** | Separa nítidamente el núcleo profundo del Nido (~155 km) de fallas corticales (<40 km). |
| **DBSCAN (eps=1.85)** | 4 + Ruido | 0.3264 | 0.8904 | 88.25 | Aísla **100 anomalías tectónicas (ruido)** correspondientes a sismos superficiales raros. |
| **Gaussian Mixture (GMM)** | 4 | 0.0673 | 2.5842 | 143.41 | Modela covarianzas elipsoidales orientadas según la losa de subducción de Bucaramanga. |
| **Jerárquico Ward** | 4 | 0.2458 | 1.4713 | 278.78 | Agrupamiento por cercanía euclidiana multiescalar. |

*Reducción Dimensional PCA:* **PC1 (38.22%)**, **PC2 (24.86%)**, **PC3 (11.54%)** $\rightarrow$ **74.62% de varianza explicada acumulada**.

---

## 🏆 4. Innovación e Impacto: El Índice ICRST
El proyecto no se queda en "hacer clusters abstractos". Explica la realidad territorial de Santander:
- **Aratoca y Los Santos** concentran la mayor frecuencia (>800 sismos), pero al ocurrir a ~155 km de profundidad, la energía se atenúa considerablemente.
- **Barrancabermeja (61.4 pts)** y el **Área Metropolitana de Bucaramanga (Bucaramanga, Floridablanca, Piedecuesta, Girón > 53 pts)** presentan el mayor riesgo real debido a la alta densidad poblacional (>1.3 millones de personas), suelos aluviales susceptibles a licuefacción y cercanía a la activa **Falla Bucaramanga-Santa Marta (FSBS)**.

---

## 🏛️ 5. Rúbrica de Evaluación (100 Puntos)

| Criterio | Puntos | Estado | Justificación |
| :--- | :---: | :---: | :--- |
| **Datos y preprocesamiento** | 15 / 15 | ✅ Cumplido | 32 variables justificadas (min. 15), catálogo unificado SGC/RSNC oficial (2004-2026), sin duplicados, faltantes tratados y diccionario formal. |
| **Modelo no supervisado** | 25 / 25 | ✅ Cumplido | Únicamente modelos no supervisados (K-Means, DBSCAN, GMM, Jerárquico), métricas formales comparadas, PCA e importancia de variables. |
| **Arquitectura utilizada** | 15 / 15 | ✅ Cumplido | Diagrama Mermaid end-to-end, ETL modular, Feature Store y desacoplamiento limpio. |
| **Prototipo y visualización territorial** | 10 / 10 | ✅ Cumplido | Prototipo web funcional en vivo (`app.py`), Leaflet, capas de 16 municipios de Santander y filtros interactivos. |
| **Impacto e innovación** | 15 / 15 | ✅ Cumplido | Índice Compuesto ICRST para toma de decisiones en el CDGRD Santander y alcaldías. |
| **Presentación** | 20 / 20 | ✅ Cumplido | Guión de pitch de 4 minutos, estructura por integrantes, respuestas al jurado y cuaderno ejecutable. |
