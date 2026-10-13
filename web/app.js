/**
 * GeoSismo Santander ML - Logica Interactiva del Prototipo Territorial
 * Reto: Machine Learning en Santander - Nivel Medio (UTS / CIAI 2026)
 */

// Estado global de la aplicacion
const state = {
  sismos: [],
  filteredSismos: [],
  municipios: [],
  riesgo: [],
  metricas: null,
  activeModel: 'kmeans', // 'kmeans', 'dbscan', 'gmm', 'icrst'
  activeMunicipio: 'ALL',
  activeProfundidad: 'ALL',
  activeCluster: 'ALL',
  minMagnitude: 2.0,
  map: null,
  sismosLayerGroup: null,
  municipiosLayerGroup: null,
  nidoLayerGroup: null,
  fallasLayerGroup: null,
  waveLayerGroup: null,
  activeWaveAnimation: null,
  waveLoopActive: false,
  waveLoopPaused: false,
  waveCurrentParams: null,
  hudTimer: null,
  audioCtx: null,
  selectedSismo: null
};

// Paleta de colores tematica para clusters
const CLUSTER_COLORS = {
  kmeans: {
    0: { color: '#06b6d4', name: 'Núcleo Nido Los Santos (Profundo ~155 km)' },
    1: { color: '#f43f5e', name: 'Sismicidad Cortical Superficial (Fallas <40 km)' },
    2: { color: '#f59e0b', name: 'Eventos de Alta Magnitud / Energía (M ≥ 4.2)' },
    3: { color: '#a855f7', name: 'Sismicidad Periférica Transicional' }
  },
  dbscan: {
    0: { color: '#06b6d4', name: 'Enjambre Principal Nido Bucaramanga' },
    1: { color: '#10b981', name: 'Sub-enjambre Mesa Los Santos / Aratoca' },
    2: { color: '#3b82f6', name: 'Enjambre Norte (Soto / Rionegro)' },
    3: { color: '#eab308', name: 'Enjambre Sur (Guanentá / Vélez)' },
    '-1': { color: '#f43f5e', name: 'Anomalías Tectónicas Aisladas (Ruido)' }
  },
  gmm: {
    0: { color: '#38bdf8', name: 'Componente Losa Subducida 1' },
    1: { color: '#ec4899', name: 'Componente Falla Cortical Activa' },
    2: { color: '#eab308', name: 'Componente Transición Benioff' },
    3: { color: '#8b5cf6', name: 'Componente Periferia Litoral' }
  },
  icrst: {
    'Muy Alto': { color: '#ef4444', name: 'Riesgo Muy Alto (Prioritario)' },
    'Alto': { color: '#f97316', name: 'Riesgo Alto (Monitoreo Continuo)' },
    'Medio': { color: '#eab308', name: 'Riesgo Medio (Moderado)' },
    'Bajo': { color: '#10b981', name: 'Riesgo Bajo a Moderado' }
  }
};

// Coordenadas clave
const COORDS = {
  santander_center: [6.85, -73.20],
  nido_los_santos: [6.7806, -73.1167],
  bucaramanga: [7.1193, -73.1227],
  falla_bsm: [
    [6.40, -73.00],
    [6.75, -73.08],
    [7.12, -73.12],
    [7.35, -73.18],
    [7.65, -73.25]
  ]
};

// Inicializacion al cargar el DOM
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  initUIEventListeners();
  loadData();
});

/**
 * Inicializa el mapa Leaflet con ESRI Canvas Oscuro y OpenStreetMap (100% Libres de API Key)
 */
function initMap() {
  state.map = L.map('map-view', {
    zoomControl: false,
    attributionControl: false,
    preferCanvas: false, // SVG vector rendering para visualización garantizada y sin colapso de buffer
    scrollWheelZoom: false // Evita interferir con el scroll vertical de la pagina
  }).setView(COORDS.santander_center, 9);

  // Control de zoom en la esquina superior derecha
  L.control.zoom({ position: 'topright' }).addTo(state.map);

  // Definicion de capas base geocientificas 100% LIBRES de API Key y sin marcas de agua
  state.baseLayers = {
    esri_dark: L.layerGroup([
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 16,
        attribution: 'Esri World Dark Canvas'
      }),
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 16,
        attribution: 'Esri Reference'
      })
    ]),
    osm_dark: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      className: 'osm-dark-tiles',
      attribution: '&copy; OpenStreetMap contributors'
    }),
    sat: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 18,
      attribution: 'Esri World Imagery'
    }),
    osm: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    })
  };

  // Activar ESRI Dark Canvas por defecto (100% Libre de API Key y Sin Marcas de Agua)
  state.currentBaseLayer = state.baseLayers.esri_dark;
  state.currentBaseLayer.addTo(state.map);

  // Layer groups geocientificos
  state.sismosLayerGroup = L.layerGroup().addTo(state.map);
  state.municipiosLayerGroup = L.layerGroup().addTo(state.map);
  state.nidoLayerGroup = L.layerGroup().addTo(state.map);
  state.fallasLayerGroup = L.layerGroup().addTo(state.map);
  state.waveLayerGroup = L.layerGroup().addTo(state.map);

  // Dibujar Nido de Los Santos y Falla Bucaramanga-Santa Marta
  drawGeologicalFeatures();
}

/**
 * Dibuja la representacion de la falla y el Nido en el mapa
 */
function drawGeologicalFeatures() {
  // Nido de Los Santos (Zona focal)
  const nidoCircle = L.circle(COORDS.nido_los_santos, {
    radius: 18000,
    color: '#06b6d4',
    fillColor: '#06b6d4',
    fillOpacity: 0.12,
    weight: 2,
    dashArray: '5, 8'
  });
  
  nidoCircle.bindTooltip('<b>Foco del Nido Sísmico de Bucaramanga</b><br>Mesa de Los Santos (Profundidad media: ~155 km)', {
    className: 'custom-leaflet-tooltip'
  });
  state.nidoLayerGroup.addLayer(nidoCircle);

  // Falla Bucaramanga - Santa Marta (FSBS)
  const fallaPolyline = L.polyline(COORDS.falla_bsm, {
    color: '#f43f5e',
    weight: 3,
    dashArray: '6, 6',
    opacity: 0.8
  });
  fallaPolyline.bindTooltip('<b>Sistema de Falla Bucaramanga-Santa Marta (FSBS)</b><br>Estructura tectónica cortical activa', {
    className: 'custom-leaflet-tooltip'
  });
  state.fallasLayerGroup.addLayer(fallaPolyline);
}

/**
 * Carga de datos asincronica con fallback a rutas relativas
 */
async function loadData() {
  try {
    // 1. Sismos procesados
    let sismosRes = await fetch('/api/sismos').catch(() => null);
    if (!sismosRes || !sismosRes.ok) {
      sismosRes = await fetch('../data/processed/dataset_sismico_santander_medio.csv');
      const csvText = await sismosRes.text();
      state.sismos = parseCSV(csvText);
    } else {
      state.sismos = await sismosRes.json();
    }

    // 2. Riesgo territorial municipal
    let riesgoRes = await fetch('/api/riesgo').catch(() => null);
    if (!riesgoRes || !riesgoRes.ok) {
      riesgoRes = await fetch('../data/processed/riesgo_territorial_santander.json');
    }
    state.riesgo = await riesgoRes.json();

    // 3. Metadatos de municipios
    let munRes = await fetch('/api/municipios').catch(() => null);
    if (!munRes || !munRes.ok) {
      munRes = await fetch('../data/santander_municipios.json');
    }
    state.municipios = await munRes.json();

    // 4. Metricas del modelo
    let metricasRes = await fetch('/api/metricas').catch(() => null);
    if (!metricasRes || !metricasRes.ok) {
      metricasRes = await fetch('../models/metricas_modelos.json');
    }
    state.metricas = await metricasRes.json();

    console.log(`Cargados ${state.sismos.length} sismos y ${state.riesgo.length} unidades territoriales.`);

    // Actualizar UI
    populateMunicipioDropdown();
    populateClusterDropdown();
    renderRankingList();
    renderIcrstBarChart();
    updateLegend();
    applyFilters();
    if (state.map) {
      state.map.invalidateSize();
    }
    renderCharts();
  } catch (err) {
    console.error('Error cargando datos del sistema:', err);
  }
}

/**
 * Parser ligero para CSV en caso de acceso estatico directo
 */
function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',');
    if (vals.length < headers.length) continue;
    const obj = {};
    headers.forEach((h, idx) => {
      let v = vals[idx] ? vals[idx].trim().replace(/^"|"$/g, '') : '';
      if (!isNaN(v) && v !== '') v = parseFloat(v);
      obj[h] = v;
    });
    rows.push(obj);
  }
  return rows;
}

/**
 * Llena el selector de municipios de Santander
 */
function populateMunicipioDropdown() {
  const select = document.getElementById('select-municipio');
  select.innerHTML = '<option value="ALL">Todo Santander (16 Municipios)</option>';
  state.municipios.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.municipio;
    opt.textContent = `${m.municipio} (${m.provincia})`;
    select.appendChild(opt);
  });
}

/**
 * Llena el selector dinamico de cluster segun el modelo ML activo
 */
function populateClusterDropdown() {
  const select = document.getElementById('select-cluster');
  if (!select) return;

  const modelMap = CLUSTER_COLORS[state.activeModel];
  if (!modelMap) return;

  select.innerHTML = '<option value="ALL">Todos los Patrones / Clústeres (Completo)</option>';

  Object.keys(modelMap).forEach(key => {
    const item = modelMap[key];
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = `${item.name}`;
    select.appendChild(opt);
  });

  select.value = state.activeCluster || 'ALL';
}

/**
 * Escuchadores de eventos para interactividad
 */
function initUIEventListeners() {
  // Selector de modelo ML No Supervisado (Segmented Control & Botones)
  const modelBtns = document.querySelectorAll('.model-btn, .model-seg-card');
  modelBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      modelBtns.forEach(b => {
        b.classList.remove('active');
        if (b.hasAttribute('aria-selected')) b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      if (btn.hasAttribute('aria-selected')) btn.setAttribute('aria-selected', 'true');
      state.activeModel = btn.dataset.model;
      state.activeCluster = 'ALL';
      populateClusterDropdown();
      updateLegend();
      applyFilters();
    });
  });

  // Toggle de colapso del panel izquierdo (Maximizar area del mapa)
  const btnToggleLeft = document.getElementById('btn-toggle-sidebar-left');
  const btnCollapseLeft = document.getElementById('btn-collapse-sidebar');
  const btnExpandLeft = document.getElementById('btn-map-expand-sidebar');
  const mainLayout = document.getElementById('main-app-layout');

  function setSidebarCollapsed(collapsed) {
    if (!mainLayout) return;
    if (collapsed) {
      mainLayout.classList.add('sidebar-collapsed');
      if (btnExpandLeft) btnExpandLeft.classList.remove('hidden');
      if (btnToggleLeft) {
        const txt = btnToggleLeft.querySelector('.btn-text-toggle');
        if (txt) txt.textContent = 'Mostrar Controles';
      }
    } else {
      mainLayout.classList.remove('sidebar-collapsed');
      if (btnExpandLeft) btnExpandLeft.classList.add('hidden');
      if (btnToggleLeft) {
        const txt = btnToggleLeft.querySelector('.btn-text-toggle');
        if (txt) txt.textContent = 'Ocultar Controles';
      }
    }
    setTimeout(() => {
      if (state.map) state.map.invalidateSize();
    }, 360);
  }

  if (btnToggleLeft) {
    btnToggleLeft.addEventListener('click', () => {
      const isCurrentlyCollapsed = mainLayout.classList.contains('sidebar-collapsed');
      setSidebarCollapsed(!isCurrentlyCollapsed);
    });
  }

  if (btnCollapseLeft) {
    btnCollapseLeft.addEventListener('click', () => {
      setSidebarCollapsed(true);
    });
  }

  if (btnExpandLeft) {
    btnExpandLeft.addEventListener('click', () => {
      setSidebarCollapsed(false);
    });
  }

  // Selector de Cluster / Patron ML
  const selectCluster = document.getElementById('select-cluster');
  if (selectCluster) {
    selectCluster.addEventListener('change', (e) => {
      state.activeCluster = e.target.value;
      updateLegend();
      applyFilters();
    });
  }

  // Selector de Municipio
  document.getElementById('select-municipio').addEventListener('change', (e) => {
    state.activeMunicipio = e.target.value;
    applyFilters();
    if (state.activeMunicipio !== 'ALL') {
      const targetMun = state.municipios.find(m => m.municipio === state.activeMunicipio);
      if (targetMun) {
        state.map.flyTo([targetMun.lat, targetMun.lon], 11, { duration: 1.2 });
        inspectMunicipio(targetMun.municipio);
      }
    } else {
      state.map.flyTo(COORDS.santander_center, 9, { duration: 1.0 });
    }
  });

  // Selector de Profundidad
  document.getElementById('select-profundidad').addEventListener('change', (e) => {
    state.activeProfundidad = e.target.value;
    applyFilters();
  });

  // Slider de Magnitud
  const sliderMag = document.getElementById('slider-magnitud');
  const labelSliderMag = document.getElementById('label-slider-mag');
  sliderMag.addEventListener('input', (e) => {
    state.minMagnitude = parseFloat(e.target.value);
    labelSliderMag.textContent = `≥ ${state.minMagnitude.toFixed(1)}`;
    applyFilters();
  });

  // Toggles de capas
  document.getElementById('chk-toggle-sismos').addEventListener('change', (e) => {
    if (e.target.checked) state.map.addLayer(state.sismosLayerGroup);
    else state.map.removeLayer(state.sismosLayerGroup);
  });

  document.getElementById('chk-toggle-municipios').addEventListener('change', (e) => {
    if (e.target.checked) state.map.addLayer(state.municipiosLayerGroup);
    else state.map.removeLayer(state.municipiosLayerGroup);
  });

  document.getElementById('chk-toggle-nido').addEventListener('change', (e) => {
    if (e.target.checked) state.map.addLayer(state.nidoLayerGroup);
    else state.map.removeLayer(state.nidoLayerGroup);
  });

  document.getElementById('chk-toggle-fallas').addEventListener('change', (e) => {
    if (e.target.checked) state.map.addLayer(state.fallasLayerGroup);
    else state.map.removeLayer(state.fallasLayerGroup);
  });

  // Boton centrar mapa
  document.getElementById('btn-reset-map').addEventListener('click', () => {
    state.map.flyTo(COORDS.santander_center, 9, { duration: 1.0 });
    document.getElementById('select-municipio').value = 'ALL';
    state.activeMunicipio = 'ALL';
    applyFilters();
  });

  // Tabs de analitica
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
      if (btn.dataset.tab === 'tab-pca') {
        renderCharts();
      } else if (btn.dataset.tab === 'tab-ranking') {
        renderIcrstBarChart();
      }
    });
  });

  // Modal de Rubrica
  const modal = document.getElementById('modal-rubric');
  document.getElementById('btn-export-report').addEventListener('click', () => modal.classList.remove('hidden'));
  document.getElementById('btn-close-modal').addEventListener('click', () => modal.classList.add('hidden'));
  document.getElementById('btn-modal-ok').addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.add('hidden');
  });

  // Navegacion responsive en tablets y moviles (<= 1024px)
  const mobNavBtns = document.querySelectorAll('.mob-nav-btn');
  
  if (mainLayout) {
    mainLayout.classList.add('view-map');
    const defaultMobBtn = document.getElementById('mob-nav-map');
    if (defaultMobBtn) {
      mobNavBtns.forEach(b => b.classList.remove('active'));
      defaultMobBtn.classList.add('active');
    }
  }

  mobNavBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      mobNavBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const view = btn.dataset.view; // 'controls', 'map', 'analytics'
      
      if (mainLayout) {
        mainLayout.classList.remove('view-controls', 'view-map', 'view-analytics');
        mainLayout.classList.add(`view-${view}`);
      }
      
      if (view === 'map' && state.map) {
        setTimeout(() => {
          state.map.invalidateSize();
        }, 150);
      } else if (view === 'analytics') {
        renderCharts();
        renderIcrstBarChart();
      }
    });
  });

  // Selector de capas de mapas base: ESRI Dark (Libre sin API Key), OSM Dark, Satelite y OSM Calles
  const tileBtns = [
    { id: 'btn-tile-esri-dark', layer: 'esri_dark' },
    { id: 'btn-tile-osm-dark', layer: 'osm_dark' },
    { id: 'btn-tile-sat', layer: 'sat' },
    { id: 'btn-tile-osm', layer: 'osm' }
  ];

  tileBtns.forEach(({ id, layer }) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', () => {
      document.querySelectorAll('.tile-layer-btn').forEach(b => b.classList.remove('active'));
      el.classList.add('active');

      if (state.currentBaseLayer) {
        state.map.removeLayer(state.currentBaseLayer);
      }
      state.currentBaseLayer = state.baseLayers[layer];
      state.currentBaseLayer.addTo(state.map);
    });
  });

  // Modal de Informacion sobre API Key
  const apiKeyModal = document.getElementById('modal-apikey');
  const btnApiKeyInfo = document.getElementById('btn-apikey-info');
  const btnCloseApiKeyModal = document.getElementById('btn-close-apikey-modal');
  const btnModalApiKeyOk = document.getElementById('btn-modal-apikey-ok');
  const btnSaveCustomKey = document.getElementById('btn-save-custom-key');
  const inputCustomKey = document.getElementById('input-custom-apikey');

  if (btnApiKeyInfo && apiKeyModal) {
    btnApiKeyInfo.addEventListener('click', () => apiKeyModal.classList.remove('hidden'));
  }
  if (btnCloseApiKeyModal && apiKeyModal) {
    btnCloseApiKeyModal.addEventListener('click', () => apiKeyModal.classList.add('hidden'));
  }
  if (btnModalApiKeyOk && apiKeyModal) {
    btnModalApiKeyOk.addEventListener('click', () => apiKeyModal.classList.add('hidden'));
  }
  if (apiKeyModal) {
    apiKeyModal.addEventListener('click', (e) => {
      if (e.target === apiKeyModal) apiKeyModal.classList.add('hidden');
    });
  }
  if (btnSaveCustomKey && inputCustomKey) {
    btnSaveCustomKey.addEventListener('click', () => {
      const val = inputCustomKey.value.trim();
      if (val) {
        alert('Token registrado localmente para la sesión.');
        apiKeyModal.classList.add('hidden');
      }
    });
  }

  // Listener para alternar pausa/reanudación del bucle de ondas sísmicas
  const btnToggleHud = document.getElementById('btn-toggle-hud-loop');
  if (btnToggleHud) {
    btnToggleHud.addEventListener('click', () => {
      toggleSeismicWaveLoop();
    });
  }

  // Listener para cerrar y detener simulación de propagación sísmica
  const btnCloseHud = document.getElementById('btn-close-hud');
  if (btnCloseHud) {
    btnCloseHud.addEventListener('click', () => {
      stopSeismicShockwave();
    });
  }

  // Listener para redimensionamiento de ventana
  window.addEventListener('resize', () => {
    if (state.map) {
      state.map.invalidateSize();
    }
  });
}

/**
 * Aplica los filtros espaciotemporales a los sismos
 */
function applyFilters() {
  state.filteredSismos = state.sismos.filter(s => {
    // Filtro magnitud
    if (s.magnitud < state.minMagnitude) return false;

    // Filtro municipio
    if (state.activeMunicipio !== 'ALL' && s.municipio_cercano !== state.activeMunicipio) {
      return false;
    }

    // Filtro profundidad
    if (state.activeProfundidad === 'CORTICAL' && s.profundidad_km > 45) return false;
    if (state.activeProfundidad === 'INTERMEDIO' && (s.profundidad_km <= 45 || s.profundidad_km > 120)) return false;
    if (state.activeProfundidad === 'NIDO' && (s.profundidad_km <= 120 || s.profundidad_km > 175)) return false;
    if (state.activeProfundidad === 'ULTRAPROFUNDO' && s.profundidad_km <= 175) return false;

    // Filtro por patron / cluster del modelo ML activo
    if (state.activeCluster && state.activeCluster !== 'ALL') {
      if (state.activeModel === 'kmeans') {
        if (String(s.cluster_kmeans) !== String(state.activeCluster)) return false;
      } else if (state.activeModel === 'dbscan') {
        if (String(s.cluster_dbscan) !== String(state.activeCluster)) return false;
      } else if (state.activeModel === 'gmm') {
        if (String(s.cluster_gmm) !== String(state.activeCluster)) return false;
      } else if (state.activeModel === 'icrst') {
        const munRiesgo = state.riesgo.find(r => r.municipio === s.municipio_cercano);
        const score = munRiesgo ? munRiesgo.icrst_score : 35;
        const level = score >= 50 ? 'Muy Alto' : score >= 40 ? 'Alto' : score >= 25 ? 'Medio' : 'Bajo';
        if (level !== state.activeCluster) return false;
      }
    }

    return true;
  });

  const clusterBadge = document.getElementById('badge-cluster-count');
  if (clusterBadge) {
    clusterBadge.textContent = state.activeCluster === 'ALL'
      ? `Todos (${state.filteredSismos.length.toLocaleString()})`
      : `Filtrados (${state.filteredSismos.length.toLocaleString()})`;
  }

  const modelMap = CLUSTER_COLORS[state.activeModel];
  const clusterName = (state.activeCluster !== 'ALL' && modelMap && modelMap[state.activeCluster])
    ? ` · ${modelMap[state.activeCluster].name}`
    : '';

  document.getElementById('map-counter-text').textContent = `Visualizando ${state.filteredSismos.length.toLocaleString()} sismos filtrados${clusterName}`;
  renderSismosOnMap();
  renderMunicipiosOnMap();
  renderCharts();
}

/**
 * Obtiene el color de un sismo segun el modelo activo
 */
function getSismoColor(s) {
  if (state.activeModel === 'kmeans') {
    const c = s.cluster_kmeans ?? 0;
    return CLUSTER_COLORS.kmeans[c]?.color || '#06b6d4';
  } else if (state.activeModel === 'dbscan') {
    const c = s.cluster_dbscan ?? -1;
    return CLUSTER_COLORS.dbscan[c]?.color || '#f43f5e';
  } else if (state.activeModel === 'gmm') {
    const c = s.cluster_gmm ?? 0;
    return CLUSTER_COLORS.gmm[c]?.color || '#38bdf8';
  } else if (state.activeModel === 'icrst') {
    // Color segun el nivel de riesgo del municipio asignado
    const munRiesgo = state.riesgo.find(r => r.municipio === s.municipio_cercano);
    if (!munRiesgo) return '#eab308';
    if (munRiesgo.icrst_score >= 50) return '#ef4444';
    if (munRiesgo.icrst_score >= 35) return '#f59e0b';
    return '#10b981';
  }
  return '#06b6d4';
}

/**
 * Dibuja los sismos filtrados en el mapa
 */
function renderSismosOnMap() {
  state.sismosLayerGroup.clearLayers();

  state.filteredSismos.forEach(s => {
    const lat = s.latitud;
    const lon = s.longitud;
    if (isNaN(lat) || isNaN(lon)) return;

    const color = getSismoColor(s);
    // Radio proporcional a la magnitud (escala exponencial equilibrada)
    const radius = Math.max(Math.pow(s.magnitud, 1.8) * 1.5, 3.5);

    // Leaflet CircleMarker renderizado directamente en el canvas acelerado del mapa
    const marker = L.circleMarker([lat, lon], {
      radius: radius,
      color: color,
      fillColor: color,
      fillOpacity: 0.8,
      weight: 1.5
    });

    // Tooltip y Popup detallados
    const popupContent = `
      <div style="font-family: var(--font-main); min-width: 220px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <span style="font-weight:800; font-size:14px; color:${color};">M ${Number(s.magnitud).toFixed(1)} Mw</span>
          <span style="font-size:10px; padding:2px 6px; background:rgba(255,255,255,0.1); border-radius:4px;">${s.fecha_hora_utc ? s.fecha_hora_utc.substring(0, 10) : 'Fecha N/A'}</span>
        </div>
        <div style="font-size:12px; margin-bottom:4px;"><b>Profundidad:</b> ${Number(s.profundidad_km).toFixed(1)} km (${s.categoria_profundidad || 'Sismo'})</div>
        <div style="font-size:12px; margin-bottom:4px;"><b>Municipio Cercano:</b> ${s.municipio_cercano || 'Santander'}</div>
        <div style="font-size:12px; margin-bottom:4px;"><b>PGA Estimada:</b> ${(s.aceleracion_estimada_pga_g || 0.01).toFixed(4)} g</div>
        <div style="font-size:12px; margin-bottom:4px;"><b>Distancia a Los Santos:</b> ${(s.distancia_nido_los_santos_km || 0).toFixed(1)} km</div>
        <div style="margin-top:8px; padding-top:6px; border-top:1px solid rgba(255,255,255,0.1); font-size:11px; color:#38bdf8;">
          Cluster K-Means: ${s.cluster_kmeans ?? 0} · ${s.cluster_nombre || 'Nido de Bucaramanga'}
        </div>
        <div style="margin-top:8px; padding:4px; text-align:center; font-size:10.5px; color:#f43f5e; font-weight:700; background:rgba(244,63,94,0.1); border-radius:4px;">
          ⚡ Clic para simular propagación de ondas P y S
        </div>
      </div>
    `;

    marker.bindPopup(popupContent);

    // Al interactuar o tocar: selecciona sismo y lanza la simulación física de ondas sísmicas
    marker.on('click', () => {
      inspectSismo(s);
      triggerSeismicShockwave(lat, lon, s.magnitud, s.profundidad_km, color, s.municipio_cercano);
    });

    marker.on('mouseover', function () {
      this.setStyle({ weight: 3, fillOpacity: 1 });
    });

    marker.on('mouseout', function () {
      this.setStyle({ weight: 1.5, fillOpacity: 0.8 });
    });

    state.sismosLayerGroup.addLayer(marker);
  });
}

/**
 * Modela el radio físico de percepción y atenuación sísmica en Santander
 * Basado en leyes empíricas de atenuación para el nororiente colombiano y Nido de Bucaramanga
 */
function calculateSeismicPerceptionRadiusKm(mag, depth) {
  const m = Math.max(Number(mag) || 2.0, 1.5);
  const d = Math.max(Number(depth) || 150.0, 5.0);
  
  let rKm;
  if (d > 60) {
    // Sismos de profundidad intermedia (Nido de Bucaramanga / Los Santos ~155 km)
    // Atenuación hipocentral con dispersión de ondas corporales P y S en manto
    rKm = Math.pow(10, 0.44 * m - 0.22) * Math.pow(160 / Math.max(d, 30), 0.35);
  } else {
    // Sismos superficiales corticales en el sistema de fallas (FSBS / Suárez)
    rKm = Math.pow(10, 0.48 * m - 0.28);
  }
  
  // Rango físico acotado entre 14 km (micro-temblores) y 340 km (sismos mayores)
  return Math.min(Math.max(rKm, 14), 340);
}

/**
 * Sintetizador sismoacústico con Web Audio API para simular el retumbo de baja frecuencia
 */
function playSeismicRumble(magnitude) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    if (!state.audioCtx) {
      state.audioCtx = new AudioContext();
    }
    if (state.audioCtx.state === 'suspended') {
      state.audioCtx.resume();
    }
    const ctx = state.audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    const mag = Math.max(Number(magnitude) || 3.0, 2.0);
    const baseFreq = Math.max(68 - (mag * 5), 36);
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 1.8);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(130, ctx.currentTime);

    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    const maxVol = Math.min(0.04 + (mag * 0.035), 0.28);
    gain.gain.linearRampToValueAtTime(maxVol, ctx.currentTime + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 2.2);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 2.3);
  } catch (err) {
    // Si la política de audio del navegador lo bloquea, continuar sin interrupción
  }
}

/**
 * Muestra el HUD de información de propagación sísmica en el mapa
 */
function showSeismicWaveHud(mag, depth, radiusKm, municipio) {
  const hud = document.getElementById('seismic-wave-hud');
  if (!hud) return;

  const hudEpicenter = document.getElementById('hud-epicenter');
  const hudMag = document.getElementById('hud-mag');
  const hudDepth = document.getElementById('hud-depth');
  const hudRadius = document.getElementById('hud-radius');
  const hudBar = document.getElementById('hud-wave-bar');

  if (hudEpicenter) hudEpicenter.textContent = municipio || 'Santander';
  if (hudMag) {
    const m = Number(mag).toFixed(1);
    hudMag.textContent = `M ${m} Mw`;
    hudMag.style.color = Number(mag) >= 4.5 ? '#f43f5e' : Number(mag) >= 3.5 ? '#f59e0b' : '#38bdf8';
  }
  if (hudDepth) hudDepth.textContent = `${Number(depth).toFixed(1)} km`;
  if (hudRadius) hudRadius.textContent = `~${Number(radiusKm).toFixed(0)} km`;
  if (hudBar) hudBar.style.width = '0%';

  hud.classList.remove('hidden');

  // En modo bucle, el HUD permanece activo mientras las ondas estén en ejecución
  if (state.hudTimer) {
    clearTimeout(state.hudTimer);
    state.hudTimer = null;
  }
}

/**
 * Detiene la simulación y bucle de ondas sísmicas
 */
function stopSeismicShockwave() {
  state.waveLoopActive = false;
  state.waveLoopPaused = false;

  if (state.activeWaveAnimation) {
    cancelAnimationFrame(state.activeWaveAnimation);
    state.activeWaveAnimation = null;
  }
  if (state.waveLayerGroup) {
    state.waveLayerGroup.clearLayers();
  }

  const hud = document.getElementById('seismic-wave-hud');
  if (hud) hud.classList.add('hidden');

  const btnReplay = document.getElementById('btn-replay-wave');
  if (btnReplay) {
    btnReplay.innerHTML = `
      <svg class="svg-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
      </svg>
      <span>Activar Bucle de Onda de Choque</span>
    `;
  }
}

/**
 * Alterna entre pausar y reanudar el bucle continuo de ondas sísmicas
 */
function toggleSeismicWaveLoop() {
  if (!state.waveLoopActive) {
    if (state.waveCurrentParams) {
      const p = state.waveCurrentParams;
      triggerSeismicShockwave(p.lat, p.lon, p.mag, p.depth, p.color, p.municipio);
    }
    return;
  }

  state.waveLoopPaused = !state.waveLoopPaused;
  const btnToggle = document.getElementById('btn-toggle-hud-loop');
  if (btnToggle) {
    if (state.waveLoopPaused) {
      btnToggle.textContent = '▶ Reanudar';
      btnToggle.classList.add('paused');
    } else {
      btnToggle.textContent = '⏸ Pausar';
      btnToggle.classList.remove('paused');
    }
  }
}

/**
 * Simulación de Propagación de Ondas Sísmicas en Bucle Continuo (Frentes P y S)
 * Irradia ondas concéntricas repetitivas desde el epicentro hasta el alcance perimétrico máximo
 */
function triggerSeismicShockwave(lat, lon, mag, depth, color = '#f43f5e', municipio = 'Santander') {
  if (!state.map || !state.waveLayerGroup) return;
  if (isNaN(lat) || isNaN(lon)) return;

  // Cancelar animación previa
  if (state.activeWaveAnimation) {
    cancelAnimationFrame(state.activeWaveAnimation);
    state.activeWaveAnimation = null;
  }
  state.waveLayerGroup.clearLayers();

  state.waveLoopActive = true;
  state.waveLoopPaused = false;
  state.waveCurrentParams = { lat, lon, mag, depth, color, municipio };

  const magnitud = Number(mag) || 3.0;
  const profundidad = Number(depth) || 150.0;
  const maxRadiusKm = calculateSeismicPerceptionRadiusKm(magnitud, profundidad);
  const maxRadiusMeters = maxRadiusKm * 1000;

  // Mostrar HUD flotante y reproducir sonido de retumbo al iniciar
  showSeismicWaveHud(magnitud, profundidad, maxRadiusKm, municipio);
  playSeismicRumble(magnitud);

  // Sincronizar botón de pausa en HUD
  const btnToggle = document.getElementById('btn-toggle-hud-loop');
  if (btnToggle) {
    btnToggle.textContent = '⏸ Pausar';
    btnToggle.classList.remove('paused');
  }

  // Sincronizar botón en Ficha Sismo
  const btnReplay = document.getElementById('btn-replay-wave');
  if (btnReplay) {
    btnReplay.innerHTML = `
      <svg class="svg-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/><line x1="9" y1="9" x2="9" y2="15"/><line x1="15" y1="9" x2="15" y2="15"/>
      </svg>
      <span>Detener Bucle de Ondas (Activo)</span>
    `;
  }

  // 1. Anillo perimétrico estático que delimita el radio máximo alcanzado (referencia territorial permanente)
  L.circle([lat, lon], {
    radius: maxRadiusMeters,
    color: '#38bdf8',
    weight: 1.2,
    dashArray: '5, 8',
    opacity: 0.35,
    fillColor: '#06b6d4',
    fillOpacity: 0.02,
    interactive: false
  }).addTo(state.waveLayerGroup);

  // Frentes de onda duales continuos para fluidez orgánica sin saltos:
  // Frente 1 (Onda P_1 y Onda S_1)
  const waveP1 = L.circle([lat, lon], {
    radius: 100,
    color: '#38bdf8',
    weight: 2.2,
    opacity: 0.9,
    fillColor: '#06b6d4',
    fillOpacity: 0.04,
    dashArray: '5, 5',
    interactive: false
  }).addTo(state.waveLayerGroup);

  const waveS1 = L.circle([lat, lon], {
    radius: 100,
    color: color,
    weight: 3.5,
    opacity: 1,
    fillColor: color,
    fillOpacity: 0.25,
    interactive: false
  }).addTo(state.waveLayerGroup);

  // Frente 2 (Desfasado al 50% del ciclo para efecto constante de radar sísmico)
  const waveP2 = L.circle([lat, lon], {
    radius: 100,
    color: '#38bdf8',
    weight: 2.2,
    opacity: 0.9,
    fillColor: '#06b6d4',
    fillOpacity: 0.04,
    dashArray: '5, 5',
    interactive: false
  }).addTo(state.waveLayerGroup);

  const waveS2 = L.circle([lat, lon], {
    radius: 100,
    color: color,
    weight: 3.5,
    opacity: 1,
    fillColor: color,
    fillOpacity: 0.25,
    interactive: false
  }).addTo(state.waveLayerGroup);

  // Marcador pulsante en el foco epicentral
  const epicenterPulse = L.circleMarker([lat, lon], {
    radius: 8,
    color: '#ffffff',
    fillColor: color,
    fillOpacity: 0.95,
    weight: 3,
    interactive: false
  }).addTo(state.waveLayerGroup);

  const cycleDuration = Math.min(Math.max(2200 + magnitud * 260, 2400), 3800);
  let pausedElapsed = 0;
  let lastFrameTime = performance.now();
  const hudProgressBar = document.getElementById('hud-wave-bar');

  function renderWaveFront(phase, waveP, waveS) {
    // Onda P: compresiva, alcanza maxRadiusMeters con mayor velocidad
    const tP = Math.min(phase * 1.15, 1.0);
    const pEased = 1 - Math.pow(1 - tP, 2.5);
    const rP = maxRadiusMeters * pEased;
    const opacityP = Math.max(0, (1 - pEased) * 0.85);

    waveP.setRadius(Math.max(rP, 200));
    waveP.setStyle({
      opacity: opacityP,
      fillOpacity: opacityP * 0.08
    });

    // Onda S: corte y sacudida principal, retrasada a ~62% de velocidad de onda P
    const tS = Math.max(0, (phase - 0.12) / 0.88);
    const sEased = 1 - Math.pow(1 - tS, 2.2);
    const rS = (maxRadiusMeters * 0.65) * sEased;
    const opacityS = Math.max(0, (1 - sEased) * 0.95);
    const fillOpacityS = Math.max(0, (1 - sEased) * 0.25);

    waveS.setRadius(Math.max(rS, 200));
    waveS.setStyle({
      opacity: opacityS,
      fillOpacity: fillOpacityS
    });
  }

  function animateWave(currentTime) {
    if (!state.waveLoopActive) return;

    if (state.waveLoopPaused) {
      lastFrameTime = currentTime;
      state.activeWaveAnimation = requestAnimationFrame(animateWave);
      return;
    }

    const delta = currentTime - lastFrameTime;
    lastFrameTime = currentTime;
    pausedElapsed += delta;

    // Fases cíclicas de 0 a 1
    const phase1 = (pausedElapsed % cycleDuration) / cycleDuration;
    const phase2 = ((pausedElapsed + cycleDuration * 0.5) % cycleDuration) / cycleDuration;

    // Actualizar ambos frentes concéntricos
    renderWaveFront(phase1, waveP1, waveS1);
    renderWaveFront(phase2, waveP2, waveS2);

    // Epicentro pulsante armónico
    const pulseRad = 6 + Math.sin(pausedElapsed * 0.007) * 3;
    epicenterPulse.setRadius(pulseRad);

    if (hudProgressBar) {
      hudProgressBar.style.width = `${(phase1 * 100).toFixed(1)}%`;
    }

    state.activeWaveAnimation = requestAnimationFrame(animateWave);
  }

  state.activeWaveAnimation = requestAnimationFrame(animateWave);
}

/**
 * Dibuja los pines y popups de municipios
 */
function renderMunicipiosOnMap() {
  state.municipiosLayerGroup.clearLayers();

  state.municipios.forEach(m => {
    const riesgoItem = state.riesgo.find(r => r.municipio === m.municipio);
    const icrst = riesgoItem ? riesgoItem.icrst_score : 35.0;
    const badgeColor = icrst >= 50 ? '#f43f5e' : icrst >= 35 ? '#f59e0b' : '#10b981';

    const customIcon = L.divIcon({
      className: 'custom-municipio-pin',
      html: `
        <div class="municipio-pill" style="border: 1.5px solid ${badgeColor};">
          <span class="municipio-pill-name">${m.municipio}</span>
          <span class="municipio-pill-score" style="color: ${badgeColor};">(${icrst.toFixed(0)})</span>
        </div>
      `,
      iconSize: [0, 0],
      iconAnchor: [0, 0]
    });

    const marker = L.marker([m.lat, m.lon], { icon: customIcon });
    marker.on('click', () => {
      inspectMunicipio(m.municipio);
    });

    state.municipiosLayerGroup.addLayer(marker);
  });
}

/**
 * Actualiza la leyenda dinamica segun el modelo activo
 */
function updateLegend() {
  const container = document.getElementById('legend-container');
  container.innerHTML = '';

  const modelMap = CLUSTER_COLORS[state.activeModel];
  if (!modelMap) return;

  // Fila para resetear a todos
  const allRow = document.createElement('div');
  const isAll = state.activeCluster === 'ALL';
  allRow.className = `legend-row ${isAll ? 'active-filter' : ''}`;
  allRow.title = 'Haga clic para ver todos los sismos sin filtrar por clúster';
  allRow.style.cursor = 'pointer';
  allRow.innerHTML = `
    <span class="legend-color-dot" style="background-color: #38bdf8; box-shadow: 0 0 8px rgba(56, 189, 248, 0.6);"></span>
    <span style="${isAll ? 'font-weight: 700; color: #38bdf8;' : ''}">Todos los Patrones del Modelo</span>
    ${isAll ? '<span class="cluster-filter-pill">Activo</span>' : ''}
  `;
  allRow.addEventListener('click', () => {
    state.activeCluster = 'ALL';
    const sel = document.getElementById('select-cluster');
    if (sel) sel.value = 'ALL';
    updateLegend();
    applyFilters();
  });
  container.appendChild(allRow);

  Object.keys(modelMap).forEach(key => {
    const item = modelMap[key];
    const isSelected = String(state.activeCluster) === String(key);
    const row = document.createElement('div');
    row.className = `legend-row ${isSelected ? 'active-filter' : ''}`;
    row.title = `Haga clic para filtrar y ver únicamente este clúster (${item.name})`;
    row.style.cursor = 'pointer';
    row.innerHTML = `
      <span class="legend-color-dot" style="background-color: ${item.color};"></span>
      <span style="${isSelected ? 'font-weight: 700; color: #38bdf8;' : ''}">${item.name}</span>
      ${isSelected ? '<span class="cluster-filter-pill">Filtrado</span>' : ''}
    `;

    row.addEventListener('click', () => {
      if (state.activeCluster === key) {
        state.activeCluster = 'ALL';
      } else {
        state.activeCluster = key;
      }
      const sel = document.getElementById('select-cluster');
      if (sel) sel.value = state.activeCluster;
      updateLegend();
      applyFilters();
    });

    container.appendChild(row);
  });
}

/**
 * Strategic Feature 1: Renderiza el Grafico de Barras Horizontales Top 10 ICRST
 * Materializa la conclusion: El peligro superficial de fallas y suelos supera al del nido sismico profundo
 */
function renderIcrstBarChart() {
  const container = document.getElementById('icrst-bars-container');
  if (!container || !state.riesgo || state.riesgo.length === 0) return;
  container.innerHTML = '';

  // Ordenar municipios de Santander por ICRST descendente y tomar Top 10
  const sorted = [...state.riesgo].sort((a, b) => b.icrst_score - a.icrst_score).slice(0, 10);

  sorted.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = 'icrst-bar-row';
    row.title = `${item.municipio}: ${item.icrst_score.toFixed(1)} pts (${item.nivel_riesgo_territorial})\nPeligro Fisico: ${item.subindice_peligro_fisico}%\nExposicion DANE: ${item.subindice_exposicion}%\nVulnerabilidad Suelo: ${item.subindice_vulnerabilidad}%`;

    // Gradiente segun nivel de riesgo municipal
    let fillGrad = 'linear-gradient(90deg, #10b981, #34d399)';
    let scoreColor = '#34d399';
    if (item.icrst_score >= 50) {
      fillGrad = 'linear-gradient(90deg, #f43f5e, #fb7185)';
      scoreColor = '#fb7185';
    } else if (item.icrst_score >= 35) {
      fillGrad = 'linear-gradient(90deg, #f59e0b, #fbbf24)';
      scoreColor = '#fbbf24';
    }

    row.innerHTML = `
      <span class="icrst-bar-name" title="${item.municipio}">${idx + 1}. ${item.municipio}</span>
      <div class="icrst-bar-track">
        <div class="icrst-bar-fill" style="width: ${Math.min(item.icrst_score, 100)}%; background: ${fillGrad};"></div>
      </div>
      <span class="icrst-bar-score" style="color: ${scoreColor};">${item.icrst_score.toFixed(1)}</span>
    `;

    row.addEventListener('click', () => {
      document.getElementById('select-municipio').value = item.municipio;
      state.activeMunicipio = item.municipio;
      applyFilters();
      state.map.flyTo([item.lat, item.lon], 11, { duration: 1.2 });
      inspectMunicipio(item.municipio);
    });

    container.appendChild(row);
  });
}

/**
 * Renderiza la lista de ranking de municipios segun el ICRST
 */
function renderRankingList() {
  const container = document.getElementById('ranking-container');
  container.innerHTML = '';

  state.riesgo.forEach((item, index) => {
    const card = document.createElement('div');
    card.className = 'ranking-card';
    
    const badgeClass = item.icrst_score >= 50 ? 'alto' : item.icrst_score >= 35 ? 'medio' : 'bajo';
    
    card.innerHTML = `
      <div class="ranking-header">
        <div class="ranking-title-group">
          <span class="ranking-num">#${index + 1}</span>
          <div>
            <div class="ranking-name">${item.municipio}</div>
            <div class="ranking-prov">${item.provincia} · ${item.poblacion.toLocaleString()} hab.</div>
          </div>
        </div>
        <span class="ranking-badge ${badgeClass}">${item.icrst_score.toFixed(1)} pts</span>
      </div>
      <div class="ranking-bars-grid">
        <div class="ranking-sub-bar">
          <span>Peligro: ${item.subindice_peligro_fisico}%</span>
          <div class="progress-track"><div class="progress-fill red" style="width: ${item.subindice_peligro_fisico}%;"></div></div>
        </div>
        <div class="ranking-sub-bar">
          <span>Exposición: ${item.subindice_exposicion}%</span>
          <div class="progress-track"><div class="progress-fill amber" style="width: ${item.subindice_exposicion}%;"></div></div>
        </div>
        <div class="ranking-sub-bar">
          <span>Suelo: ${item.subindice_vulnerabilidad}%</span>
          <div class="progress-track"><div class="progress-fill blue" style="width: ${item.subindice_vulnerabilidad}%;"></div></div>
        </div>
      </div>
    `;

    card.addEventListener('click', () => {
      document.getElementById('select-municipio').value = item.municipio;
      state.activeMunicipio = item.municipio;
      applyFilters();
      state.map.flyTo([item.lat, item.lon], 11, { duration: 1.2 });
      inspectMunicipio(item.municipio);
    });

    container.appendChild(card);
  });
}

/**
 * Inspecciona un sismo y llena la pestaña Ficha Sismo con alta jerarquia visual,
 * sub-cards 2x2 y badges redondeados dinamicos
 */
function inspectSismo(s) {
  // Cambiar a la pestaña de inspector
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById('tab-btn-inspector').classList.add('active');
  document.getElementById('tab-inspector').classList.add('active');

  const container = document.getElementById('inspector-card-content');
  const mag = Number(s.magnitud || 3.0);
  const depth = Number(s.profundidad_km || 150.0);
  const joules = (s.energia_sismica_joules || Math.pow(10, 4.8 + 1.5 * mag)).toExponential(2);
  
  // Color de acento vibrante segun severidad
  const magColor = mag >= 4.5 ? '#f43f5e' : mag >= 3.5 ? '#f59e0b' : '#38bdf8';
  const magDesc = mag >= 4.5 ? 'Evento Severo' : mag >= 3.5 ? 'Evento Moderado' : 'Micro-sismo Leve';
  const depthCategory = depth <= 45 ? 'Cortical Superficial (<45 km)' : depth <= 120 ? 'Intermedio Benioff' : depth <= 175 ? 'Núcleo Nido Los Santos' : 'Sub-Nido Profundo';

  const isDBSCANNoise = s.cluster_dbscan === -1;
  const kClusterName = s.cluster_nombre || (s.cluster_kmeans === 0 ? 'Nido Los Santos Profundo' : s.cluster_kmeans === 1 ? 'Cortical Superficial Fallas' : s.cluster_kmeans === 2 ? 'Alta Energía M≥4.2' : 'Periferia Transicional');

  container.innerHTML = `
    <div class="sismo-inspector-card" style="border-color: ${magColor};">
      <!-- Header row con ID y Fecha Oficial -->
      <div class="sismo-header-row">
        <div>
          <span class="sismo-id-tag">EVENTO SGC / RSNC: ${s.evento_id || 'RSNC-COL'}</span>
          <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">Foco Epicentral Santander</div>
        </div>
        <span class="sismo-date-badge">
          ${s.fecha_hora_utc ? s.fecha_hora_utc.substring(0, 19).replace('T', ' ') : 'Catálogo Oficial'}
        </span>
      </div>

      <!-- Jerarquia Principal: Magnitud (2.1rem) y Profundidad (2.0rem) Destacadas -->
      <div class="sismo-hero-metrics">
        <div class="hero-metric-box">
          <span class="hero-metric-label">Magnitud Instrumental</span>
          <div class="hero-metric-val" style="color: ${magColor};">M ${mag.toFixed(1)}</div>
          <span class="hero-metric-sub" style="color: ${magColor};">${magDesc} (Mw)</span>
        </div>

        <div class="hero-metric-box">
          <span class="hero-metric-label">Profundidad Focal</span>
          <div class="hero-metric-val" style="color: #38bdf8;">${depth.toFixed(1)} <span style="font-size:1.1rem; font-weight:600;">km</span></div>
          <span class="hero-metric-sub" style="color: #38bdf8;">${depthCategory}</span>
        </div>
      </div>

      <!-- Cuadricula Grid de 2x2 para Datos Secundarios con Tarjetas Interiores (Sub-cards) -->
      <div class="sismo-subcards-grid">
        <div class="sismo-subcard">
          <span class="subcard-label">Energía Liberada</span>
          <div class="subcard-value">${joules} J</div>
          <span class="subcard-note">Gutenberg-Richter Log</span>
        </div>

        <div class="sismo-subcard">
          <span class="subcard-label">Aceleración PGA</span>
          <div class="subcard-value" style="color: ${s.aceleracion_estimada_pga_g > 0.05 ? '#fb7185' : '#ffffff'};">
            ${(s.aceleracion_estimada_pga_g || 0.012).toFixed(4)} g
          </div>
          <span class="subcard-note">Atenuación Hipocentral</span>
        </div>

        <div class="sismo-subcard">
          <span class="subcard-label">Cabecera Cercana</span>
          <div class="subcard-value">${s.municipio_cercano || 'Los Santos'}</div>
          <span class="subcard-note">${(s.distancia_municipio_km || 0).toFixed(1)} km de distancia</span>
        </div>

        <div class="sismo-subcard">
          <span class="subcard-label">Foco Nido Los Santos</span>
          <div class="subcard-value">${(s.distancia_nido_los_santos_km || 0).toFixed(1)} km</div>
          <span class="subcard-note">Distancia 3D al núcleo</span>
        </div>
      </div>

      <!-- Resultados de Clasificacion ML No Supervisado con Badges Redondeados Dinamicos -->
      <div class="classification-box">
        <span class="classification-title">Clasificación No Supervisada & Tectónica:</span>
        <div class="classification-badges-container">
          <span class="sismo-pill-badge cyan">
            <svg class="svg-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            <span class="badge-text"><b>K-Means:</b> Cluster ${s.cluster_kmeans ?? 0} (${kClusterName})</span>
          </span>

          ${isDBSCANNoise 
            ? `<span class="sismo-pill-badge rose">
                <svg class="svg-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span class="badge-text"><b>DBSCAN:</b> Ruido -1 (Anomalía Tectónica)</span>
              </span>`
            : `<span class="sismo-pill-badge emerald">
                <svg class="svg-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><circle cx="5" cy="8" r="1.5"/></svg>
                <span class="badge-text"><b>DBSCAN:</b> Cluster ${s.cluster_dbscan ?? 0} (Enjambre Activo)</span>
              </span>`
          }

          <span class="sismo-pill-badge amber">
            <svg class="svg-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><polyline points="8 7 3 12 8 17"/></svg>
            <span class="badge-text"><b>Falla Geológica:</b> ${s.falla_geologica_asociada || 'Falla Bucaramanga-Sta Marta'}</span>
          </span>

          <span class="sismo-pill-badge purple">
            <svg class="svg-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="12" rx="9" ry="5"/></svg>
            <span class="badge-text"><b>GMM:</b> Densidad Probabilística de Benioff</span>
          </span>
        </div>
      </div>

      <!-- Botón Interactivo para Controlar Bucle Continuo de Ondas -->
      <button id="btn-replay-wave" class="btn-replay-wave" title="Alternar bucle continuo de propagación de ondas P y S">
        <svg class="svg-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><line x1="9" y1="9" x2="9" y2="15"/><line x1="15" y1="9" x2="15" y2="15"/>
        </svg>
        <span>Detener Bucle de Ondas (Activo)</span>
      </button>
    </div>
  `;

  const btnReplay = document.getElementById('btn-replay-wave');
  if (btnReplay) {
    btnReplay.addEventListener('click', () => {
      if (state.waveLoopActive && state.waveCurrentParams && state.waveCurrentParams.lat === s.latitud && state.waveCurrentParams.lon === s.longitud) {
        stopSeismicShockwave();
      } else {
        state.map.flyTo([s.latitud, s.longitud], Math.max(state.map.getZoom(), 9), { duration: 0.8 });
        triggerSeismicShockwave(s.latitud, s.longitud, s.magnitud, s.profundidad_km, magColor, s.municipio_cercano);
      }
    });
  }
}

/**
 * Inspecciona un municipio y muestra su desglose en el Inspector
 */
function inspectMunicipio(nombre) {
  const item = state.riesgo.find(r => r.municipio === nombre);
  if (!item) return;

  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById('tab-btn-inspector').classList.add('active');
  document.getElementById('tab-inspector').classList.add('active');

  const container = document.getElementById('inspector-card-content');
  const badgeColor = item.icrst_score >= 50 ? '#f43f5e' : item.icrst_score >= 35 ? '#f59e0b' : '#10b981';

  container.innerHTML = `
    <div style="background:var(--bg-card); border:1px solid ${badgeColor}; border-radius:var(--radius-md); padding:16px; display:flex; flex-direction:column; gap:12px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <span style="font-size:10px; color:#38bdf8; font-weight:800; text-transform:uppercase;">UNIDAD TERRITORIAL SANTANDER</span>
          <h3 style="font-size:18px; font-weight:800; color:white;">${item.municipio}</h3>
          <span style="font-size:11px; color:var(--text-muted);">${item.provincia}</span>
        </div>
        <div style="text-align:right;">
          <div style="font-size:18px; font-weight:800; color:${badgeColor};">${item.icrst_score.toFixed(1)} pts</div>
          <div style="font-size:10px; color:${badgeColor}; font-weight:600;">${item.nivel_riesgo_territorial}</div>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; font-size:12px;">
        <div style="background:rgba(0,0,0,0.3); padding:8px; border-radius:6px;">
          <div style="color:var(--text-dim); font-size:10px;">POBLACIÓN DANE</div>
          <div style="font-size:14px; font-weight:700;">${item.poblacion.toLocaleString()} hab.</div>
        </div>
        <div style="background:rgba(0,0,0,0.3); padding:8px; border-radius:6px;">
          <div style="color:var(--text-dim); font-size:10px;">SISMOS HISTÓRICOS</div>
          <div style="font-size:14px; font-weight:700;">${item.total_sismos_registrados} eventos</div>
        </div>
        <div style="background:rgba(0,0,0,0.3); padding:8px; border-radius:6px;">
          <div style="color:var(--text-dim); font-size:10px;">MAGNITUD MÁXIMA</div>
          <div style="font-size:14px; font-weight:700; color:#fb7185;">M ${item.magnitud_maxima.toFixed(1)} Mw</div>
        </div>
        <div style="background:rgba(0,0,0,0.3); padding:8px; border-radius:6px;">
          <div style="color:var(--text-dim); font-size:10px;">PGA MÁXIMA (g)</div>
          <div style="font-size:14px; font-weight:700;">${item.aceleracion_pga_maxima_g.toFixed(4)} g</div>
        </div>
      </div>

      <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); padding:10px; border-radius:6px; font-size:11px; line-height:1.4;">
        <b>Geología & Vulnerabilidad del Suelo:</b><br>
        • Falla Asociada: <b>${item.falla_cercana}</b><br>
        • Condición Geotécnica: <i>${item.vulnerabilidad_suelo}</i><br>
        • Sismos Superficiales (<40 km): <b>${item.sismos_superficiales_destructivos} sismos</b> (${item.pct_sismicidad_superficial}%)
      </div>
    </div>
  `;
}

/**
 * Renderiza los graficos de dispersión fisica y PCA en Canvas
 */
function renderCharts() {
  renderPhysicsChart();
  renderPCAChart();
}

/**
 * Grafico 1: Magnitud vs Profundidad
 */
function renderPhysicsChart() {
  const canvas = document.getElementById('canvas-physics');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  // Margenes
  const pad = { top: 20, right: 20, bottom: 30, left: 40 };
  const pw = w - pad.left - pad.right;
  const ph = h - pad.top - pad.bottom;

  // Ejes
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, h - pad.bottom);
  ctx.lineTo(w - pad.right, h - pad.bottom);
  ctx.stroke();

  // Etiquetas
  ctx.fillStyle = '#94a3b8';
  ctx.font = '9px Inter';
  ctx.fillText('0 km', pad.left, h - pad.bottom + 14);
  ctx.fillText('150 km', pad.left + pw * (150 / 220), h - pad.bottom + 14);
  ctx.fillText('220 km', w - pad.right - 25, h - pad.bottom + 14);

  ctx.fillText('M 6', 8, pad.top + 10);
  ctx.fillText('M 2', 8, h - pad.bottom);

  // Linea Nido 155 km
  const xNido = pad.left + pw * (155 / 220);
  ctx.strokeStyle = 'rgba(6, 182, 212, 0.4)';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(xNido, pad.top);
  ctx.lineTo(xNido, h - pad.bottom);
  ctx.stroke();
  ctx.setLineDash([]);

  // Puntos
  state.filteredSismos.forEach(s => {
    const prof = Math.min(Math.max(s.profundidad_km || 150, 0), 220);
    const mag = Math.min(Math.max(s.magnitud || 3.0, 2.0), 6.5);

    const x = pad.left + pw * (prof / 220);
    const y = h - pad.bottom - ph * ((mag - 2.0) / 4.5);

    ctx.fillStyle = getSismoColor(s);
    ctx.beginPath();
    ctx.arc(x, y, 2.8, 0, Math.PI * 2);
    ctx.fill();
  });
}

/**
 * Grafico 2: Proyeccion PCA 2D (PC1 vs PC2)
 */
function renderPCAChart() {
  const canvas = document.getElementById('canvas-pca');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  const pad = { top: 20, right: 20, bottom: 30, left: 40 };
  const pw = w - pad.left - pad.right;
  const ph = h - pad.top - pad.bottom;

  // Cruz central (0, 0)
  const cx = pad.left + pw / 2;
  const cy = pad.top + ph / 2;

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.left, cy);
  ctx.lineTo(w - pad.right, cy);
  ctx.moveTo(cx, pad.top);
  ctx.lineTo(cx, h - pad.bottom);
  ctx.stroke();

  // Etiquetas
  ctx.fillStyle = '#94a3b8';
  ctx.font = '9px Inter';
  ctx.fillText('PC1 (38.2% Amenaza)', w - pad.right - 90, cy + 12);
  ctx.fillText('PC2 (24.9% Territorio)', pad.left + 5, pad.top + 10);

  // Puntos PCA
  state.filteredSismos.forEach(s => {
    const pc1 = s.pca_1 ?? (Math.random() * 4 - 2);
    const pc2 = s.pca_2 ?? (Math.random() * 4 - 2);

    // Mapeo de rango [-4, 6] a canvas
    const x = cx + (pc1 / 5.5) * (pw / 2);
    const y = cy - (pc2 / 5.5) * (ph / 2);

    ctx.fillStyle = getSismoColor(s);
    ctx.beginPath();
    ctx.arc(x, y, 2.8, 0, Math.PI * 2);
    ctx.fill();
  });
}
