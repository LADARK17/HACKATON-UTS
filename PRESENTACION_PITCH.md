# Estructura del Pitch y Presentación Final (Rúbrica: 20 Puntos)
## Reto de Machine Learning: Nivel Medio - Clasificación e Interpretación Territorial
### Universitaria Tecnológica de Santander (UTS) · Centro de Innovación e Inteligencia Artificial (CIAI)
**Sala de Sustentación:** 315A  
**Tiempo Límite del Pitch:** 4 a 5 minutos + 2 minutos de preguntas del jurado.

---

## 1. Guión Estratégico de Exposición por Integrantes (Trabajo en Equipo)

```mermaid
gantt
    title Cronograma de Exposición del Pitch (4 Minutos)
    dateFormat  m:s
    axisFormat  %M:%S
    section Integrante 1
    El Problema & Fuentes Oficiales (SGC/DANE)  :0:00, 0:50
    section Integrante 2
    Modelos No Supervisados & Métricas (K-Means/DBSCAN/PCA) :0:50, 1:50
    section Integrante 3
    Prototipo en Vivo & Comparación Territorial (ICRST) :1:50, 3:00
    section Integrante 4 (o Equipo)
    Impacto, Innovación para Santander & Cierre :3:00, 4:00
```

---

### Minuto 0:00 – 0:50 | Bloque 1: El Problema y la Rigurosidad de los Datos Oficiales
**Expositor: Integrante 1 (Líder de Datos y Geociencias)**

> *"Buenos días, estimados miembros del jurado del CIAI y profesores de las UTS. Santander es el epicentro sísmico de Colombia: concentra más del 60% de los sismos del país debido al Nido Sísmico de Bucaramanga bajo la Mesa de Los Santos. Sin embargo, los modelos tradicionales cometen un error crítico: asumen que a mayor número de sismos, mayor es el peligro en superficie.*
>
> *Para resolver esto con rigor, construimos un dataset unificado con datos 100% reales de fuentes oficiales: la Red Sismológica Nacional del Servicio Geológico Colombiano (SGC) y el catálogo FDSN, analizando 20 años de sismicidad instrumental (2004 a 2026) con más de 1,080 eventos verificados.*
>
> *No usamos 15 variables; construimos **32 variables justificadas**, cruzando la física de Gutenberg-Richter, la atenuación de onda PGA, las proyecciones demográficas del DANE y las tipologías de suelo del IGAC."*

---

### Minuto 0:50 – 1:50 | Bloque 2: Modelos No Supervisados y Validación Rigurosa
**Expositor: Integrante 2 (Líder de Machine Learning)**

> *"En estricto cumplimiento de la regla habilitante del Nivel Medio, implementamos **únicamente modelos de aprendizaje no supervisado**, sin etiquetas previas ni trampas supervisadas.*
>
> *Comparamos 4 enfoques fundamentales:*
> 1. * **K-Means (k=4)**: optimizado mediante el método del codo y Silhouette, que agrupó nítidamente los sismos por profundidad y liberación energética, logrando un **Silhouette Score de 0.2834** y un **Calinski-Harabasz de 335.28**.*
> 2. * **DBSCAN**: basado en densidad espacial, que descubrió el núcleo denso del enjambre de Los Santos y aisló con éxito **100 eventos anómalos (ruido tectónico)** que corresponden a sismos corticales raros fuera del nido.*
> 3. * **Gaussian Mixture Models (GMM)**: que modeló con covarianzas elipsoidales la geometría inclinada de la losa de Benioff.*
> 4. * **Clustering Jerárquico Ward**.*
>
> *Además, aplicamos **PCA**, logrando explicar el **74.62% de la varianza total** en 3 componentes principales, demostrando que la profundidad hipocentral, la energía liberada y la distancia al Área Metropolitana son las dimensiones que gobiernan la sismicidad en Santander."*

---

### Minuto 1:50 – 3:00 | Bloque 3: Demostración en Vivo del Prototipo Territorial
**Expositor: Integrante 3 (Líder de Software y Prototipo)**

> *(Se proyecta la pantalla del prototipo interactivo en vivo en `http://localhost:8000`)*
>
> *"Les presentamos **GeoSismo Santander ML**, nuestro prototipo interactivo totalmente funcional y reproducible.*
>
> *Aquí pueden observar el mapa de calor y la distribución espacial de los 1,082 sismos sobre Santander. Podemos cambiar en tiempo real entre K-Means, DBSCAN y GMM, filtrando por régimen de profundidad o magnitud mínima.*
>
> *Pero el corazón del proyecto es nuestra respuesta a la rúbrica de innovación: **El Índice Compuesto de Riesgo Sísmico Territorial (ICRST)**, evaluado en 16 municipios de Santander.*
>
> *Observen esta paradoja geocientífica revelada por nuestro modelo: **Los Santos y Aratoca** registran más de 800 sismos, pero tienen una puntuación de riesgo moderada (~34-47 pts) porque su profundidad media es de 155 km y la roca atenúa la energía.*
>
> *En cambio, **Barrancabermeja (61.4 pts)** y el **Área Metropolitana de Bucaramanga (Bucaramanga 56.2, Piedecuesta 55.5, Girón 54.1, Floridablanca 53.5)** encabezan el riesgo real debido a la combinación de alta exposición humana (>1.3 millones de habitantes), proximidad a la falla activa Bucaramanga-Santa Marta y suelos aluviales susceptibles a amplificación y licuefacción."*

---

### Minuto 3:00 – 4:00 | Bloque 4: Impacto, Aplicabilidad y Conclusión
**Expositor: Integrante 4 / Cierre Grupal**

> *"¿Cuál es el impacto real de nuestro desarrollo?*
>
> *Este sistema no es solo un ejercicio académico; es una herramienta operativa reproducible para el Consejo Departamental de Gestión del Riesgo de Desastres (CDGRD Santander) y las alcaldías locales.*
>
> *Permite a los tomadores de decisiones:*
> 1. * **Priorizar el reforzamiento estructural** en centros históricos vulnerables como Girón y Barichara.*
> 2. * **Calibrar planes de contingencia** en Barrancabermeja frente a infraestructura crítica petrolera.*
> 3. * **Monitorear en tiempo real** enjambres anómalos detectados por el modelo DBSCAN.*
>
> *Entregamos el código modular, el cuaderno Jupyter ejecutable, el dataset con 32 variables y el diccionario de datos oficial. Estamos listos para sus preguntas. ¡Muchas gracias!"*

---

## 2. Preguntas Anticipadas del Jurado y Respuestas Clave

| Posible Pregunta del Jurado | Respuesta Técnica Contundente |
| :--- | :--- |
| **¿Por qué usaron K-Means con k=4 y no otro número de clusters?** | *"Evaluamos K desde 2 hasta 7 con curvas de inercia y Silhouette Score. Si bien k=3 tenía buena cohesión, k=4 tiene la máxima interpretabilidad sismotectónica: separa 1) el núcleo profundo del Nido (~155 km), 2) los sismos corticales someros (<40 km), 3) los eventos de moderada/alta magnitud ($M \ge 4.2$), y 4) la sismicidad periférica transicional."* |
| **¿Cómo garantizan que la variable objetivo del riesgo no se calculó trivialmente de las entradas?** | *"El ICRST no es una fórmula directa de las variables individuales. Es un índice compuesto multidimensional que normaliza y pondera no linealmente la amenaza física generada por los clusters no supervisados (40%), la exposición poblacional oficial del Censo DANE (35%) y la vulnerabilidad geotécnica del suelo según el IGAC (25%)."* |
| **¿Por qué DBSCAN clasificó 100 puntos como ruido (-1)?** | *"En DBSCAN, el ruido no significa un error de medición, sino un 'outlier espacial'. En sismología, estos 100 eventos corresponden a sismos corticales aislados que ocurren lejos del enjambre denso del Nido de Los Santos (por ejemplo en Vélez, Málaga o en fallas secundarias). Esto demuestra que DBSCAN es ideal para detectar sismicidad intraplaca anómala."* |
| **¿Cómo aseguran que los datos son 100% oficiales?** | *"Consumimos el protocolo internacional FDSN Web Service directamente vinculado a la Red Sismológica Nacional del SGC (con estaciones CM) y al catálogo global USGS. Cada registro cuenta con ID de evento oficial, coordenadas WGS84, profundidad focal, RMS y GAP azimutal verificado."* |

---

## 3. Checklist de Requisitos Habilitantes Verificados para el Jurado

- [x] **Modelo funcional entrenado demostrado en vivo**: Sí, ejecutable en tiempo real en `python app.py` y en el cuaderno Jupyter.
- [x] **Tipo de modelo obligatorio cumplido**: **Únicamente no supervisado** (K-Means, DBSCAN, GMM, Jerárquico Ward). Cero modelos supervisados en Nivel Medio.
- [x] **Datos reales de fuente oficial citada**: Servicio Geológico Colombiano (SGC / RSNC) y USGS FDSN Web Service (2004 - 2026).
- [x] **Número mínimo de variables cumplido**: **32 variables justificadas** (el requisito del Nivel Medio era mínimo 15).
- [x] **Prototipo y visualización territorial reproducible**: Dashboard interactivo Leaflet con 16 municipios de Santander y visualización territorial en capas.
- [x] **Entregables completos**: CSV limpio, Diccionario de Datos Markdown, Cuaderno Jupyter ejecutable, Código fuente modular, y Diapositivas/Pitch.
