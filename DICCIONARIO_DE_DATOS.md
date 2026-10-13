# Diccionario de Datos Oficial - Reto Sísmico Santander (Nivel Medio)

## 1. Identificación y Metadatos de la Fuente Oficial

| Parámetro | Detalle Institucional |
| :--- | :--- |
| **Entidad Emisora** | Servicio Geológico Colombiano (SGC) - Red Sismológica Nacional de Colombia (RSNC) en colaboración con el catálogo global sismológico FDSN / USGS Earthquake Hazards Program. |
| **Dirección Web Oficial** | [http://bdrsnc.sgc.gov.co/paginas1/catalogo/](http://bdrsnc.sgc.gov.co/paginas1/catalogo/) · [https://sismo.sgc.gov.co/](https://sismo.sgc.gov.co/) · [https://earthquake.usgs.gov/fdsnws/event/1/](https://earthquake.usgs.gov/fdsnws/event/1/) |
| **Fuentes Territoriales Complementarias** | DANE (Censo Nacional de Población y Vivienda / Proyecciones Municipales) e IGAC (Cartografía básica y límites municipales de Santander). |
| **Fecha de Extracción** | 13 de Octubre de 2026. |
| **Periodo Temporal Evaluado** | 1 de Enero de 2004 al 1 de Octubre de 2026 (Comportamiento sísmico de los últimos 20+ años). |
| **Filtros Geográficos Aplicados** | Polígono envolvente del Departamento de Santander: Latitud [5.7° N a 8.2° N], Longitud [-74.5° W a -72.4° W]. |
| **Filtros Sismológicos Aplicados** | Magnitud instrumental $M \ge 2.0$, profundidad hipocentral $[0 \text{ km}, 300 \text{ km}]$, calidad de localización con residual RMS y GAP azimutal verificados. |
| **Estructura del Dataset** | Archivo CSV tabular único (`dataset_sismico_santander_medio.csv`), donde cada fila representa un sismo verificado y cada columna una variable física o territorial. |

---

## 2. Variables del Dataset Maestro (32 Variables)

El dataset contiene **32 variables** (superando con amplitud las 15 requeridas para el Nivel Medio), distribuidas entre variables sismológicas directas, variables territoriales geodésicas y variables derivadas físico-geotécnicas debidamente justificadas.

| # | Nombre de la Variable | Tipo de Dato | Unidad de Medida | Fuente Oficial | Justificación Sismológica / Territorial |
| :-: | :--- | :--- | :--- | :--- | :--- |
| **1** | `evento_id` | String | Adimensional | SGC / USGS | Identificador unívoco del evento sísmico para trazabilidad, reproducibilidad y auditoría técnica. |
| **2** | `fecha_hora_utc` | Datetime (ISO 8601) | AAAA-MM-DD HH:MM:SS | SGC / RSNC | Registro cronológico en Tiempo Universal Coordinado (UTC), estándar internacional en sismología. |
| **3** | `ano` | Entero | Años | SGC | Permite evaluar la sismicidad histórica multianual en el rango de los últimos 20 años de Santander. |
| **4** | `mes` | Entero | Mes (1-12) | SGC | Variable de estacionalidad temporal para verificar patrones cíclicos tectónicos. |
| **5** | `dia_semana` | Entero | Día (0-6) | SGC | Control de periodicidad y verificación de consistencia en el monitoreo continuo de la red. |
| **6** | `hora_utc` | Entero | Horas (0-23) | SGC | Variable para discriminar ruido antropogénico diurno de eventos tectónicos puros. |
| **7** | `latitud` | Decimal Float | Grados Norte (°N) | SGC / RSNC | Coordenada geográfica del hipocentro proyectada en el elipsoide WGS84 para georreferenciación espacial. |
| **8** | `longitud` | Decimal Float | Grados Oeste (°W) | SGC / RSNC | Coordenada geográfica del hipocentro para mapeo y delimitación territorial en Santander. |
| **9** | `profundidad_km` | Decimal Float | Kilómetros (km) | SGC / RSNC | **Variable sismológica crítica**. Permite discriminar la sismicidad intermedia del **Nido Sísmico de Bucaramanga** (~140-165 km) de las fallas superficiales corticales (<35 km). |
| **10** | `magnitud` | Decimal Float | Escala de Momento (Mw / Ml) | SGC / RSNC | Cuantificación física directa de la energía liberada en la fuente sismogénica. |
| **11** | `tipo_magnitud` | String | Categórica (Mw, mb, ml) | SGC / RSNC | Homogeneización y aseguramiento de la consistencia entre distintas fases de adquisición histórica. |
| **12** | `rms` | Decimal Float | Segundos (s) | SGC / RSNC | Error medio cuadrático en los tiempos de viaje de las ondas P y S; indicador de precisión hipocentral. |
| **13** | `gap` | Decimal Float | Grados azimutales (°) | SGC / RSNC | Mayor ángulo azimutal desprovisto de estaciones sismológicas; valida la confiabilidad del epicentro. |
| **14** | `nst` | Entero | Número de estaciones | SGC / RSNC | Robustez geométrica de la inversión hipocentral según estaciones sismológicas empleadas. |
| **15** | `lugar_reportado` | String | Texto descriptivo | SGC / RSNC | Descripción toponímica de referencia oficial generada por el centro sismológico. |
| **16** | `energia_sismica_joules` | Decimal Float | Joules (J) | Ecuación Gutenberg-Richter | Energía física real disipada en la corteza terrestre calculada mediante $\log_{10}(E) = 4.8 + 1.5 M$. |
| **17** | `log_energia_joules` | Decimal Float | Log Joules | Gutenberg-Richter | Transformación logarítmica para escalamiento simétrico en modelos de Machine Learning no supervisados. |
| **18** | `categoria_profundidad` | String (Categórica) | Clasificación geológica | SGC / Geología Estructural | Clasificación geocientífica en: Superficial (0-30 km), Intermedia (30-70 km), Profunda (70-130 km) y Nido de Bucaramanga (130-170+ km). |
| **19** | `distancia_nido_los_santos_km` | Decimal Float | Kilómetros (km) | Geodesia Haversine | Distancia espacial al epicentro núcleo de la Mesa de Los Santos (Lat 6.7806°, Lon -73.1167°), foco de máxima densidad sísmica. |
| **20** | `distancia_am_bucaramanga_km` | Decimal Float | Kilómetros (km) | Geodesia Haversine | Distancia al Área Metropolitana de Bucaramanga; pondera el potencial impacto sobre la mayor aglomeración urbana de Santander. |
| **21** | `municipio_cercano` | String (Categórica) | Nombre territorial | DANE / IGAC | **Variable territorial esencial**. Unidad político-administrativa municipal más próxima al epicentro del sismo. |
| **22** | `provincia_santander` | String (Categórica) | Subregión territorial | Gobernación de Santander | Subregión provincial (Metropolitana, Guanentá, Mares, Soto Norte, Comunera, Vélez, García Rovira) para análisis multiescalar. |
| **23** | `distancia_municipio_km` | Decimal Float | Kilómetros (km) | Geodesia Haversine | Distancia geodésica del evento a la cabecera municipal habitada más cercana. |
| **24** | `poblacion_municipio` | Entero | Habitantes | DANE Censo 2018 | Población residente expuesta a la aceleración del terreno generada por el sismo. |
| **25** | `falla_geologica_asociada` | String | Estructura Geológica | SGC Mapa Geológico | Falla tectónica activa predominante (Falla Bucaramanga-Santa Marta, Falla del Suárez, Falla Los Santos, Falla Lebrija, etc.). |
| **26** | `vulnerabilidad_suelo` | String | Descripción geotécnica | IGAC / SGC Microzonificación | Comportamiento del depósito de suelo (roca competente, abanico aluvial, laderas con inestabilidad, o suelos blandos de licuefacción). |
| **27** | `aceleracion_estimada_pga_g` | Decimal Float | Fracción de gravedad ($g$) | GMPE Modelo de Atenuación | Estimación de la Aceleración Pico del Terreno (PGA) en superficie a partir de la distancia hipocentral y la magnitud. Proxy de destructividad. |
| **28** | `distancia_hipocentral_km` | Decimal Float | Kilómetros (km) | Geometría 3D | Distancia en el espacio tridimensional entre el foco del sismo y la superficie $R = \sqrt{D_{epi}^2 + z^2}$. |
| **29** | `indice_severidad_hipocentral` | Decimal Float | Índice Logarítmico | Formulación Geofísica | Relación de severidad entre energía liberada y distancia tridimensional ($\log_{10}(E / R_{hipo})$). |
| **30** | `tasa_sismicidad_local_30d` | Entero | Eventos / mes | RSNC SGC | Frecuencia de sismos en una ventana móvil de 30 días en un radio de 35 km; cuantifica la intensidad del enjambre sísmico. |
| **31** | `indice_exposicion_humana` | Decimal Float | Índice Logarítmico | Cálculo Integrado | Combinación ponderada entre volumen poblacional municipal y aceleración del terreno esperada ($\log_{10}(\text{Pob} \times PGA)$). |
| **32** | `fuente_oficial` | String | Identificador Institucional | SGC / USGS | Registro de procedencia de la consulta de datos abiertos para auditoría del jurado. |

---

## 3. Variable Objetivo Territorial Derivada (Sin Cálculo Trivial)
En cumplimiento de la rúbrica del Nivel Medio:
- **Variable de Interpretación de Grupos**: `cluster_kmeans`, `cluster_dbscan`, `cluster_gmm` y `cluster_jerarquico`.
- **Variable de Clasificación del Riesgo Territorial**: `nivel_riesgo_territorial` e `icrst_score` (Índice Compuesto de Riesgo Sísmico Territorial). No se calcula trivialmente a partir de una sola variable de entrada, sino que integra de manera no lineal la energía física liberada, la tasa de sismicidad profunda vs. superficial, la aceleración esperada del terreno ($PGA$), la exposición demográfica censal (DANE) y la susceptibilidad geotécnica del suelo (IGAC/SGC).
