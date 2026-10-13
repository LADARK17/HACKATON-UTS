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
      sismosRes = await fetch('/data/processed/sismos_santander.json').catch(() => null);
    }
    if (!sismosRes || !sismosRes.ok) {
      sismosRes = await fetch('../data/processed/sismos_santander.json').catch(() => null);
    }
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
      riesgoRes = await fetch('/data/processed/riesgo_territorial_santander.json').catch(() => null);
    }
    if (!riesgoRes || !riesgoRes.ok) {
      riesgoRes = await fetch('../data/processed/riesgo_territorial_santander.json');
    }
    state.riesgo = await riesgoRes.json();

    // 3. Metadatos de municipios
    let munRes = await fetch('/api/municipios').catch(() => null);
    if (!munRes || !munRes.ok) {
      munRes = await fetch('/data/santander_municipios.json').catch(() => null);
    }
    if (!munRes || !munRes.ok) {
      munRes = await fetch('../data/santander_municipios.json');
    }
    state.municipios = await munRes.json();

    // 4. Metricas del modelo
    let metricasRes = await fetch('/api/metricas').catch(() => null);
    if (!metricasRes || !metricasRes.ok) {
      metricasRes = await fetch('/models/metricas_modelos.json').catch(() => null);
    }
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
      setMobileView(btn.dataset.view);
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
    if (threeState.renderer && threeState.camera) {
      const c = document.getElementById('three-container');
      if (c && c.clientWidth && c.clientHeight) {
        threeState.camera.aspect = c.clientWidth / c.clientHeight;
        threeState.camera.updateProjectionMatrix();
        threeState.renderer.setSize(c.clientWidth, c.clientHeight);
      }
    }
  });

  // Listeners del Visualizador 3D Isométrico
  const btnOpen3D = document.getElementById('btn-open-3d-modal');
  if (btnOpen3D) btnOpen3D.addEventListener('click', openThreeJsModal);

  const btnClose3D = document.getElementById('btn-close-3d-modal');
  if (btnClose3D) btnClose3D.addEventListener('click', closeThreeJsModal);

  const btnClose3DFooter = document.getElementById('btn-close-3d-modal-footer');
  if (btnClose3DFooter) btnClose3DFooter.addEventListener('click', closeThreeJsModal);

  const camPresetBtns = document.querySelectorAll('.view-3d-toolbar .btn-tool');
  camPresetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      camPresetBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (btn.id === 'btn-cam-iso') setCameraPreset('iso');
      else if (btn.id === 'btn-cam-ew') setCameraPreset('ew');
      else if (btn.id === 'btn-cam-ns') setCameraPreset('ns');
      else if (btn.id === 'btn-cam-top') setCameraPreset('top');
    });
  });

  const btnCamReset = document.getElementById('btn-cam-reset');
  if (btnCamReset) {
    btnCamReset.addEventListener('click', () => {
      camPresetBtns.forEach(b => b.classList.remove('active'));
      const isoBtn = document.getElementById('btn-cam-iso');
      if (isoBtn) isoBtn.classList.add('active');
      setCameraPreset('iso');
    });
  }

  const chkSlab = document.getElementById('chk-3d-slab');
  if (chkSlab) {
    chkSlab.addEventListener('change', (e) => {
      if (threeState.slabGroup) threeState.slabGroup.visible = e.target.checked;
    });
  }

  const chkNest = document.getElementById('chk-3d-nest');
  if (chkNest) {
    chkNest.addEventListener('change', (e) => {
      if (threeState.nestGroup) threeState.nestGroup.visible = e.target.checked;
    });
  }

  const chkSurface = document.getElementById('chk-3d-surface');
  if (chkSurface) {
    chkSurface.addEventListener('change', (e) => {
      if (threeState.surfaceGroup) threeState.surfaceGroup.visible = e.target.checked;
    });
  }

  const chkAutoRotate = document.getElementById('chk-3d-autorotate');
  if (chkAutoRotate) {
    chkAutoRotate.addEventListener('change', (e) => {
      threeState.isRotating = e.target.checked;
    });
  }

  // Listeners del Exportador de Fichas Técnicas Municipales en PDF
  const btnQuickPdf = document.getElementById('btn-quick-ficha-pdf');
  if (btnQuickPdf) {
    btnQuickPdf.addEventListener('click', () => {
      const mun = state.activeMunicipio === 'ALL' ? 'Bucaramanga' : state.activeMunicipio;
      openMunicipalPdfReport(mun);
    });
  }

  const btnClosePdf = document.getElementById('btn-close-pdf-modal');
  if (btnClosePdf) btnClosePdf.addEventListener('click', closeMunicipalPdfReport);

  const btnClosePdfFooter = document.getElementById('btn-close-pdf-modal-footer');
  if (btnClosePdfFooter) btnClosePdfFooter.addEventListener('click', closeMunicipalPdfReport);

  const btnPrintPdf = document.getElementById('btn-print-pdf');
  if (btnPrintPdf) btnPrintPdf.addEventListener('click', printMunicipalPdf);

  const modalPdf = document.getElementById('modal-ficha-pdf');
  if (modalPdf) {
    modalPdf.addEventListener('click', (e) => {
      if (e.target === modalPdf) closeMunicipalPdfReport();
    });
  }

  const modal3D = document.getElementById('modal-view-3d');
  if (modal3D) {
    modal3D.addEventListener('click', (e) => {
      if (e.target === modal3D) closeThreeJsModal();
    });
  }

}

/**
 * Alterna entre las vistas de panel en dispositivos móviles y tablets (<= 1024px)
 * @param {'controls'|'map'|'analytics'} viewName 
 */
function setMobileView(viewName) {
  const mainLayout = document.getElementById('main-app-layout');
  if (!mainLayout) return;

  mainLayout.classList.remove('view-controls', 'view-map', 'view-analytics');
  mainLayout.classList.add(`view-${viewName}`);

  document.querySelectorAll('.mob-nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  if (viewName === 'map' && state.map) {
    setTimeout(() => {
      state.map.invalidateSize();
    }, 180);
  } else if (viewName === 'analytics') {
    if (typeof renderCharts === 'function') renderCharts();
    if (typeof renderIcrstBarChart === 'function') renderIcrstBarChart();
  }
}
window.setMobileView = setMobileView;

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

    const popupHtml = `
      <div style="font-family: var(--font-main); min-width: 210px; padding: 2px 0;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <b style="font-size:14px; color:#fff;">${m.municipio}</b>
          <span style="font-size:11px; font-weight:800; color:${badgeColor}; background:rgba(255,255,255,0.06); padding:2px 6px; border-radius:4px; border:1px solid ${badgeColor};">${icrst.toFixed(1)} pts</span>
        </div>
        <div style="font-size:11px; color:#94a3b8; margin-bottom:4px;">
          ${riesgoItem ? riesgoItem.nivel_riesgo_territorial : 'Santander'} · ${riesgoItem ? riesgoItem.provincia : ''}
        </div>
        <div style="font-size:11.5px; color:#e2e8f0; margin-bottom:8px;">
          Población: <b>${riesgoItem ? Number(riesgoItem.poblacion).toLocaleString() : 'N/A'}</b> hab.
        </div>
        <div style="display:flex; gap:6px; flex-direction:column;">
          <button onclick="inspectMunicipio('${m.municipio}'); if (window.innerWidth <= 1024) setMobileView('analytics');" class="btn btn-secondary" style="font-size:11px; padding:6px 8px; width:100%; justify-content:center; cursor:pointer;">
            📊 Ver Analítica e Inspector
          </button>
          <button onclick="openMunicipalPdfReport('${m.municipio}');" class="btn btn-primary" style="font-size:11px; padding:6px 8px; width:100%; justify-content:center; cursor:pointer;">
            📄 Ficha Oficial CMGRD
          </button>
        </div>
      </div>
    `;
    marker.bindPopup(popupHtml);

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

      <!-- Botón de Exportación Directa de Ficha Técnica CMGRD (PDF) -->
      <button id="btn-export-municipio-pdf" class="btn btn-primary" style="width:100%; display:flex; align-items:center; justify-content:center; gap:8px; padding:10px 14px; font-size:12px; font-weight:700; background:linear-gradient(135deg, #059669, #10b981); border:1px solid #34d399; box-shadow:0 4px 14px rgba(16,185,129,0.3); cursor:pointer; border-radius:6px; color:#ffffff; transition:all 0.2s ease;">
        <svg class="svg-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
        </svg>
        <span>📄 Generar Ficha Técnica CMGRD (PDF)</span>
      </button>
    </div>
  `;

  const btnExportPdf = document.getElementById('btn-export-municipio-pdf');
  if (btnExportPdf) {
    btnExportPdf.addEventListener('click', () => {
      openMunicipalPdfReport(item);
    });
  }
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

/* ==========================================================================
   10. VISUALIZADOR ISOMÉTRICO 3D DEL NIDO SÍSMICO Y LOSA SUBDUCIDA (THREE.JS)
   ========================================================================== */

const threeState = {
  initialized: false,
  scene: null,
  camera: null,
  renderer: null,
  controls: null,
  animId: null,
  sismosGroup: null,
  slabGroup: null,
  nestGroup: null,
  surfaceGroup: null,
  isRotating: true,
  raycaster: new THREE.Raycaster(),
  mouse: new THREE.Vector2(-9999, -9999),
  hoveredMesh: null,
  originalScale: null,
  centerLon: -73.15,
  centerLat: 6.85
};

/**
 * Convierte coordenadas geográficas y profundidad (km) a coordenadas 3D locales
 */
function to3DCoords(lat, lon, depth) {
  const x = (lon - threeState.centerLon) * 115;
  const z = -(lat - threeState.centerLat) * 115;
  const y = -depth * 0.70; // Superficie Y=0, subsuelo Y < 0
  return { x, y, z };
}

/**
 * Genera un Sprite 3D con texto nítido renderizado en Canvas 2D
 */
function make3DTextSprite(text, color = '#38bdf8', bgColor = 'rgba(10, 15, 29, 0.85)') {
  const canvas = document.createElement('canvas');
  canvas.width = 380;
  canvas.height = 80;
  const ctx = canvas.getContext('2d');

  // Fondo redondeado estilo píldora
  ctx.fillStyle = bgColor;
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(4, 4, 372, 72, 16);
  } else {
    ctx.rect(4, 4, 372, 72);
  }
  ctx.fill();

  // Borde
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Texto
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 190, 40);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.scale.set(22, 4.6, 1);
  return sprite;
}

/**
 * Inicializa la escena Three.js, cámara, renderer, luces y mallas
 */
function initThreeVisualizer() {
  if (typeof THREE === 'undefined') {
    console.error('Three.js no está disponible en el entorno.');
    return;
  }

  const container = document.getElementById('three-container');
  if (!container) return;

  const width = container.clientWidth || 900;
  const height = container.clientHeight || 560;

  // 1. Escena con niebla sutil de alta profundidad
  threeState.scene = new THREE.Scene();
  threeState.scene.background = new THREE.Color(0x060913);
  threeState.scene.fog = new THREE.FogExp2(0x060913, 0.0014);

  // 2. Cámara de perspectiva
  threeState.camera = new THREE.PerspectiveCamera(45, width / height, 1, 2500);
  threeState.camera.position.set(160, 110, 190);

  // 3. Renderer WebGL acelerado
  threeState.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  threeState.renderer.setSize(width, height);
  threeState.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.innerHTML = '';
  container.appendChild(threeState.renderer.domElement);

  // 4. OrbitControls para interacción total
  if (typeof THREE.OrbitControls !== 'undefined') {
    threeState.controls = new THREE.OrbitControls(threeState.camera, threeState.renderer.domElement);
    threeState.controls.enableDamping = true;
    threeState.controls.dampingFactor = 0.06;
    threeState.controls.target.set(0, -65, 0);
    threeState.controls.maxDistance = 750;
    threeState.controls.minDistance = 25;
  }

  // 5. Iluminación escénica
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
  threeState.scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0x38bdf8, 1.3);
  dirLight.position.set(120, 220, 90);
  threeState.scene.add(dirLight);

  const nestGlowLight = new THREE.PointLight(0x06b6d4, 3.5, 320);
  nestGlowLight.position.set(3.8, -108, 7.6);
  threeState.scene.add(nestGlowLight);

  // 6. Construir Capas: Superficie, Columna Nido, Losa Wadati-Benioff, Sismos
  buildSurface3DLayer();
  buildNestColumn3DLayer();
  buildBenioffSlab3DLayer();
  buildEarthquakes3DLayer();

  // 7. Raycaster para inspección al pasar el cursor
  setupThreeRaycaster(container);

  threeState.initialized = true;

  // Iniciar bucle de renderizado
  function animateThreeScene() {
    threeState.animId = requestAnimationFrame(animateThreeScene);
    if (threeState.controls) threeState.controls.update();

    if (threeState.isRotating && threeState.scene) {
      threeState.scene.rotation.y += 0.0022;
    }

    threeState.renderer.render(threeState.scene, threeState.camera);
  }
  animateThreeScene();
}

/**
 * Capa 1: Superficie de Santander a Y = 0 (Plano, Cabeceras, y Falla FSBS)
 */
function buildSurface3DLayer() {
  threeState.surfaceGroup = new THREE.Group();

  // Rejilla de referencia en la cota de superficie (0 km)
  const grid = new THREE.GridHelper(220, 22, 0x0284c7, 0x1e293b);
  grid.position.y = 0;
  threeState.surfaceGroup.add(grid);

  // Eje de profundidad vertical graduado
  const depthAxisPoints = [
    new THREE.Vector3(-100, 0, -100),
    new THREE.Vector3(-100, -200 * 0.70, -100)
  ];
  const depthAxisGeom = new THREE.BufferGeometry().setFromPoints(depthAxisPoints);
  const depthAxisLine = new THREE.Line(depthAxisGeom, new THREE.LineBasicMaterial({ color: 0x64748b, linewidth: 2 }));
  threeState.surfaceGroup.add(depthAxisLine);

  // Ticks y etiquetas de profundidad (0, 50, 100, 150, 200 km)
  [0, 50, 100, 150, 200].forEach(d => {
    const tickGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-103, -d * 0.70, -100),
      new THREE.Vector3(-97, -d * 0.70, -100)
    ]);
    const tickLine = new THREE.Line(tickGeom, new THREE.LineBasicMaterial({ color: 0x38bdf8 }));
    threeState.surfaceGroup.add(tickLine);

    const lbl = make3DTextSprite(`${d} km`, '#94a3b8', 'rgba(15, 23, 42, 0.7)');
    lbl.position.set(-112, -d * 0.70, -100);
    lbl.scale.set(14, 3.2, 1);
    threeState.surfaceGroup.add(lbl);
  });

  // Marcadores de cabeceras municipales en superficie (Y = 0)
  const cities = [
    { name: 'Mesa de Los Santos (Foco)', lat: 6.7806, lon: -73.1167, color: '#06b6d4', pinColor: 0x06b6d4 },
    { name: 'Bucaramanga (AMB)', lat: 7.1193, lon: -73.1227, color: '#38bdf8', pinColor: 0x38bdf8 },
    { name: 'Barrancabermeja', lat: 7.0653, lon: -73.8547, color: '#fbbf24', pinColor: 0xf59e0b },
    { name: 'San Gil', lat: 6.5593, lon: -73.1347, color: '#34d399', pinColor: 0x10b981 },
    { name: 'Socorro', lat: 6.4678, lon: -73.2622, color: '#c084fc', pinColor: 0xa855f7 }
  ];

  cities.forEach(c => {
    const pos = to3DCoords(c.lat, c.lon, 0);

    // Pin cilíndrico invertido
    const pinGeom = new THREE.ConeGeometry(1.6, 5.5, 8);
    const pinMat = new THREE.MeshStandardMaterial({ color: c.pinColor, emissive: c.pinColor, emissiveIntensity: 0.6 });
    const pinMesh = new THREE.Mesh(pinGeom, pinMat);
    pinMesh.rotation.x = Math.PI; // punta hacia el suelo
    pinMesh.position.set(pos.x, 2.75, pos.z);
    threeState.surfaceGroup.add(pinMesh);

    // Sprite de texto flotante encima del pin
    const sprite = make3DTextSprite(c.name, c.color);
    sprite.position.set(pos.x, 7.5, pos.z);
    threeState.surfaceGroup.add(sprite);
  });

  // Traza en superficie de la Falla Bucaramanga-Santa Marta (FSBS)
  if (COORDS.falla_bsm && COORDS.falla_bsm.length > 0) {
    const faultPoints = COORDS.falla_bsm.map(pt => {
      const p = to3DCoords(pt[0], pt[1], 0);
      return new THREE.Vector3(p.x, 0.4, p.z);
    });
    const faultGeom = new THREE.BufferGeometry().setFromPoints(faultPoints);
    const faultMat = new THREE.LineBasicMaterial({ color: 0xf43f5e, linewidth: 3 });
    const faultLine = new THREE.Line(faultGeom, faultMat);
    threeState.surfaceGroup.add(faultLine);

    const faultLabel = make3DTextSprite('Falla Bucaramanga-Sta Marta (FSBS)', '#f43f5e');
    const midPt = faultPoints[Math.floor(faultPoints.length / 2)];
    faultLabel.position.set(midPt.x + 8, 3.5, midPt.z);
    faultLabel.scale.set(24, 4.8, 1);
    threeState.surfaceGroup.add(faultLabel);
  }

  threeState.scene.add(threeState.surfaceGroup);
}

/**
 * Capa 2: Columna Focal Subterránea del Nido Sísmico de Bucaramanga (130 - 175 km)
 */
function buildNestColumn3DLayer() {
  threeState.nestGroup = new THREE.Group();

  const lsPos = to3DCoords(6.7806, -73.1167, 0);
  const minDepthKm = 130;
  const maxDepthKm = 175;
  const height3D = (maxDepthKm - minDepthKm) * 0.70; // ~31.5
  const centerY = -((minDepthKm + maxDepthKm) / 2) * 0.70; // ~ -106.75
  const radius = 17;

  // Cilindro volumétrico translúcido que envuelve el nido
  const cylGeom = new THREE.CylinderGeometry(radius, radius, height3D, 36, 1, true);
  const cylMat = new THREE.MeshStandardMaterial({
    color: 0x06b6d4,
    emissive: 0x0891b2,
    emissiveIntensity: 0.5,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    roughness: 0.2
  });
  const cylMesh = new THREE.Mesh(cylGeom, cylMat);
  cylMesh.position.set(lsPos.x, centerY, lsPos.z);
  threeState.nestGroup.add(cylMesh);

  // Anillos de cota a 130 km, 150 km, y 175 km
  [130, 150, 175].forEach(d => {
    const ringGeom = new THREE.TorusGeometry(radius, 0.45, 8, 36);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const ringMesh = new THREE.Mesh(ringGeom, ringMat);
    ringMesh.rotation.x = Math.PI / 2;
    ringMesh.position.set(lsPos.x, -d * 0.70, lsPos.z);
    threeState.nestGroup.add(ringMesh);
  });

  // Línea guía vertical continua desde Los Santos superficie (0 km) directo a la columna del Nido
  const guidePoints = [
    new THREE.Vector3(lsPos.x, 0, lsPos.z),
    new THREE.Vector3(lsPos.x, centerY - height3D / 2, lsPos.z)
  ];
  const guideGeom = new THREE.BufferGeometry().setFromPoints(guidePoints);
  const guideMat = new THREE.LineDashedMaterial({ color: 0x38bdf8, dashSize: 3, gapSize: 2 });
  const guideLine = new THREE.Line(guideGeom, guideMat);
  guideLine.computeLineDistances();
  threeState.nestGroup.add(guideLine);

  // Rótulo 3D de la Columna Focal
  const nestSprite = make3DTextSprite('Columna Focal: Nido Los Santos (130-175 km)', '#06b6d4');
  nestSprite.position.set(lsPos.x + 24, centerY, lsPos.z);
  nestSprite.scale.set(30, 5.2, 1);
  threeState.nestGroup.add(nestSprite);

  threeState.scene.add(threeState.nestGroup);
}

/**
 * Capa 3: Losa Tectónica de Wadati-Benioff (Placa subducida que buza ~43° hacia el Este bajo Santander)
 */
function buildBenioffSlab3DLayer() {
  threeState.slabGroup = new THREE.Group();

  const slabWidth = 190;   // Extensión Oeste-Este (Dirección de buzamiento)
  const slabLength = 230;  // Extensión Norte-Sur (Rumbo tectónico)
  const segsX = 18;
  const segsZ = 22;

  const slabGeom = new THREE.PlaneGeometry(slabWidth, slabLength, segsX, segsZ);
  slabGeom.rotateX(-Math.PI / 2); // Orientar en plano horizontal

  // Deformar vértices para crear el ángulo de buzamiento geocientífico de ~43° hacia el Este:
  // Al Oeste (vx = -95), la losa se encuentra a ~30 km de profundidad (Y = -21)
  // Al centro (vx = 3.8, Los Santos), la losa intercepta el nido sísmico a ~150 km (Y = -105)
  // Al Este (vx = +95), la losa desciende a >210 km (Y = -147)
  const posAttr = slabGeom.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const depthKm = 30 + ((vx + 95) / 190) * 180;
    posAttr.setY(i, -depthKm * 0.70);
  }
  slabGeom.computeVertexNormals();

  // Superficie translúcida de la placa
  const slabMat = new THREE.MeshStandardMaterial({
    color: 0x1e3a8a,
    emissive: 0x0284c7,
    emissiveIntensity: 0.28,
    transparent: true,
    opacity: 0.32,
    side: THREE.DoubleSide,
    roughness: 0.3
  });
  const slabMesh = new THREE.Mesh(slabGeom, slabMat);
  threeState.slabGroup.add(slabMesh);

  // Malla reticular brillante (Grid isolíneas de la losa)
  const slabWireMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    wireframe: true,
    transparent: true,
    opacity: 0.28
  });
  const slabWireMesh = new THREE.Mesh(slabGeom, slabWireMat);
  threeState.slabGroup.add(slabWireMesh);

  // Rótulo 3D indicando la cinemática de la losa subducida
  const slabSprite = make3DTextSprite('Losa Subducida Wadati-Benioff (Buzamiento ~43° Este)', '#38bdf8');
  slabSprite.position.set(-30, -50 * 0.70, 80);
  slabSprite.scale.set(34, 5.4, 1);
  threeState.slabGroup.add(slabSprite);

  threeState.scene.add(threeState.slabGroup);
}

/**
 * Capa 4: 1,082 Sismos representados como esferas tridimensionales
 */
function buildEarthquakes3DLayer() {
  threeState.sismosGroup = new THREE.Group();

  if (!state.sismos || state.sismos.length === 0) return;

  state.sismos.forEach(s => {
    const lat = s.latitud;
    const lon = s.longitud;
    const depth = s.profundidad_km || 150;
    const mag = s.magnitud || 3.0;
    if (isNaN(lat) || isNaN(lon)) return;

    const coords = to3DCoords(lat, lon, depth);

    // Color según estrato sismotectónico
    let hexColor = 0x06b6d4; // Cyan Nido
    let isNest = false;
    if (depth < 45) {
      hexColor = 0xf43f5e; // Rojo Cortical
    } else if (depth <= 120) {
      hexColor = 0xf59e0b; // Ámbar Intermedio
    } else if (depth <= 175) {
      hexColor = 0x06b6d4; // Cyan Núcleo del Nido
      isNest = true;
    } else {
      hexColor = 0xa855f7; // Púrpura Ultra-profundo
    }

    // Radio proporcional a la magnitud
    const radius = Math.max(0.75 + (mag - 2.0) * 0.9, 0.75);

    const sphereGeom = new THREE.SphereGeometry(radius, 8, 8);
    const sphereMat = new THREE.MeshStandardMaterial({
      color: hexColor,
      emissive: hexColor,
      emissiveIntensity: isNest ? 0.65 : 0.35,
      roughness: 0.25,
      metalness: 0.1
    });

    const mesh = new THREE.Mesh(sphereGeom, sphereMat);
    mesh.position.set(coords.x, coords.y, coords.z);
    mesh.userData = {
      sismo: s,
      origScale: 1.0,
      hexColor: hexColor
    };

    threeState.sismosGroup.add(mesh);
  });

  threeState.scene.add(threeState.sismosGroup);

  const countBadge = document.getElementById('hud-3d-count');
  if (countBadge) {
    countBadge.textContent = `${state.sismos.length} sismos`;
  }
}

/**
 * Configura el Raycaster para detección hover interactiva de sismos en el canvas 3D
 */
function setupThreeRaycaster(container) {
  const tooltip = document.getElementById('three-tooltip');

  container.addEventListener('pointermove', (event) => {
    const rect = container.getBoundingClientRect();
    threeState.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    threeState.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    if (!threeState.camera || !threeState.sismosGroup) return;

    threeState.raycaster.setFromCamera(threeState.mouse, threeState.camera);
    const intersects = threeState.raycaster.intersectObjects(threeState.sismosGroup.children);

    if (intersects.length > 0) {
      const hit = intersects[0].object;
      const s = hit.userData.sismo;

      // Restaurar elemento previo
      if (threeState.hoveredMesh && threeState.hoveredMesh !== hit) {
        threeState.hoveredMesh.scale.set(1, 1, 1);
        if (threeState.hoveredMesh.material.emissiveIntensity) {
          threeState.hoveredMesh.material.emissiveIntensity = 0.35;
        }
      }

      threeState.hoveredMesh = hit;
      hit.scale.set(1.9, 1.9, 1.9);
      hit.material.emissiveIntensity = 1.0;

      // Tooltip flotante con datos geocientíficos
      if (tooltip && s) {
        const mag = Number(s.magnitud || 3.0);
        const prof = Number(s.profundidad_km || 150.0);
        const colorHex = hit.userData.hexColor.toString(16).padStart(6, '0');

        tooltip.innerHTML = `
          <div style="font-size:10px; color:#38bdf8; font-weight:800; text-transform:uppercase;">EVENTO OFICIAL SGC</div>
          <div style="font-size:13px; font-weight:800; color:#${colorHex}; margin:2px 0;">M ${mag.toFixed(1)} Mw · ${prof.toFixed(1)} km</div>
          <div style="font-size:10.5px; color:#cbd5e1;"><b>Régimen:</b> ${prof <= 45 ? 'Cortical (<45 km)' : prof <= 175 ? 'Nido Bucaramanga' : 'Manto Profundo'}</div>
          <div style="font-size:10.5px; color:#94a3b8;"><b>Cabecera:</b> ${s.municipio_cercano || 'Los Santos'} (${(s.distancia_municipio_km || 0).toFixed(1)} km)</div>
          <div style="font-size:9.5px; color:#fbbf24; margin-top:2px;"><b>Falla:</b> ${s.falla_geologica_asociada || 'FSBS'}</div>
        `;
        tooltip.style.left = `${event.clientX - rect.left}px`;
        tooltip.style.top = `${event.clientY - rect.top}px`;
        tooltip.classList.remove('hidden');
      }
    } else {
      if (threeState.hoveredMesh) {
        threeState.hoveredMesh.scale.set(1, 1, 1);
        threeState.hoveredMesh.material.emissiveIntensity = 0.35;
        threeState.hoveredMesh = null;
      }
      if (tooltip) {
        tooltip.classList.add('hidden');
      }
    }
  });

  container.addEventListener('pointerleave', () => {
    if (threeState.hoveredMesh) {
      threeState.hoveredMesh.scale.set(1, 1, 1);
      threeState.hoveredMesh = null;
    }
    if (tooltip) tooltip.classList.add('hidden');
  });
}

/**
 * Abre el modal del Visualizador 3D y recalcula el tamaño del canvas
 */
function openThreeJsModal() {
  const modal = document.getElementById('modal-view-3d');
  if (!modal) return;
  modal.classList.remove('hidden');

  if (!threeState.initialized) {
    initThreeVisualizer();
  }

  setTimeout(() => {
    if (threeState.renderer && threeState.camera) {
      const container = document.getElementById('three-container');
      if (container && container.clientWidth && container.clientHeight) {
        threeState.camera.aspect = container.clientWidth / container.clientHeight;
        threeState.camera.updateProjectionMatrix();
        threeState.renderer.setSize(container.clientWidth, container.clientHeight);
      }
    }
  }, 120);
}

/**
 * Cierra el modal del Visualizador 3D
 */
function closeThreeJsModal() {
  const modal = document.getElementById('modal-view-3d');
  if (modal) modal.classList.add('hidden');
}

/**
 * Establece preajustes de ángulo de cámara para la visualización 3D
 */
function setCameraPreset(type) {
  if (!threeState.camera || !threeState.controls) return;

  threeState.isRotating = false;
  const chkAuto = document.getElementById('chk-3d-autorotate');
  if (chkAuto) chkAuto.checked = false;

  if (type === 'iso') {
    // Vista Isométrica general
    threeState.camera.position.set(160, 110, 190);
    threeState.controls.target.set(0, -65, 0);
  } else if (type === 'ew') {
    // Corte Transversal Oeste-Este (Muestra el buzamiento hacia el Este de la Losa Benioff)
    threeState.camera.position.set(0, -55, 250);
    threeState.controls.target.set(0, -65, 0);
  } else if (type === 'ns') {
    // Corte Longitudinal Norte-Sur (Alineado con el rumbo de la Falla Bucaramanga)
    threeState.camera.position.set(250, -55, 0);
    threeState.controls.target.set(0, -65, 0);
  } else if (type === 'top') {
    // Vista Cenital / Planta de Santander
    threeState.camera.position.set(0, 240, 0);
    threeState.controls.target.set(0, -65, 0);
  }

  threeState.controls.update();
}

/* ==========================================================================
   11. EXPORTADOR DE FICHAS TÉCNICAS MUNICIPALES EN PDF (CMGRD - 1 PÁGINA)
   ========================================================================== */

/**
 * Genera y despliega la Ficha Técnica Oficial de 1 Página para entrega directa al CMGRD
 */
function openMunicipalPdfReport(target) {
  let item = null;
  if (typeof target === 'string') {
    item = state.riesgo.find(r => r.municipio.toLowerCase() === target.toLowerCase());
  } else if (target && target.municipio) {
    item = target;
  }

  // Fallback si no hay selección
  if (!item) {
    item = state.riesgo[0] || {
      municipio: 'Bucaramanga',
      provincia: 'Metropolitana',
      poblacion: 613400,
      icrst_score: 56.2,
      nivel_riesgo_territorial: 'Alto (Monitoreo Continuo)',
      subindice_peligro_fisico: 3.0,
      subindice_exposicion: 100.0,
      subindice_vulnerabilidad: 80.0,
      falla_cercana: 'Falla Bucaramanga-Santa Marta',
      vulnerabilidad_suelo: 'Escarpes y depósitos fluviotorrenciales',
      total_sismos_registrados: 4,
      magnitud_maxima: 4.3,
      aceleracion_pga_maxima_g: 0.0109,
      sismos_superficiales_destructivos: 0,
      pct_sismicidad_superficial: 0.0
    };
  }

  const munMeta = state.municipios.find(m => m.municipio.toLowerCase() === item.municipio.toLowerCase()) || {};
  const codigoDane = munMeta.codigo_dane || item.codigo_dane || '68001';
  const zonaGeologica = munMeta.zona_geologica || 'Cordillera Oriental de Colombia';

  // Configuración cromática y nivel de alerta
  const score = Number(item.icrst_score || 40.0);
  let scoreColor = '#059669';
  let badgeBorder = '#34d399';
  let levelTag = 'Bajo a Moderado';
  let priorityClass = 'media';

  if (score >= 50) {
    scoreColor = '#dc2626';
    badgeBorder = '#f87171';
    levelTag = 'MUY ALTO / PRIORITARIO';
    priorityClass = 'urgente';
  } else if (score >= 35) {
    scoreColor = '#d97706';
    badgeBorder = '#fbbf24';
    levelTag = 'ALTO (MONITOREO CONTINUO)';
    priorityClass = 'alta';
  }

  // Recomendaciones específicas adaptadas a la realidad geofísica del municipio
  const isNestNest = item.municipio.toLowerCase().includes('santos');
  const isRiverPort = item.municipio.toLowerCase().includes('barranca');
  const isMetro = ['bucaramanga', 'floridablanca', 'piedecuesta', 'giron'].includes(item.municipio.toLowerCase());

  let customAdvice1, customAdvice2, customAdvice3, customAdvice4;

  if (isNestNest) {
    customAdvice1 = 'Diferenciación Operativa de Alarmas: El 96% de los sismos son profundos (~155 km) y no generan daño cortical destructivo.';
    customAdvice2 = 'Inspección de Taludes y Miradores: Monitorear escarpes de roca sedimentaria del Cañón del Chicamocha ante sismos M ≥ 5.0.';
    customAdvice3 = 'Zonificación Turística: Exigir anclaje sismorresistente en infraestructura ecoturística, glampings y teleférico.';
    customAdvice4 = 'Actualización EOT: Incorporar mapa de aceleraciones espectrales del Nido Sísmico como insumo estructural municipal.';
  } else if (isRiverPort) {
    customAdvice1 = 'Mitigación de Licuefacción: Estudios de suelos blandos cuaternarios del Río Magdalena en zonas residenciales y refinería.';
    customAdvice2 = 'Protección de Activos Petroquímicos: Planes de contingencia ante aceleraciones locales originadas en fallas Cantagallo/Simití.';
    customAdvice3 = 'Inspección de Puentes y Muelles Fluviales: Ensayos no destructivos en infraestructura de transporte y abastecimiento.';
    customAdvice4 = 'Actualización POT: Prohibición estricta de urbanización en llanuras aluviales de alta susceptibilidad sísmica e inundación.';
  } else if (isMetro) {
    customAdvice1 = 'Monitoreo de la Escarpa de Bucaramanga: Control geotécnico e instrumentación de laderas ante amenaza sísmico-gravitacional.';
    customAdvice2 = 'Refuerzo de Edificaciones Indispensables: Hospitales de III Nivel, Estaciones de Bomberos y Centrales de Mando (NSR-10 Grupo IV).';
    customAdvice3 = 'Microzonificación Sísmica Obligatoria: Aplicación rigurosa del Decreto Municipal para construcciones en altura.';
    customAdvice4 = 'Simulacros de Evacuación Masiva: Preparación ante eventual ruptura del Sistema de Fallas Bucaramanga-Santa Marta (FSBS).';
  } else {
    customAdvice1 = 'Revisión Estructural del Centro Histórico: Diagnóstico y amarre de edificaciones patrimoniales en tapia pisada y adobe.';
    customAdvice2 = 'Actualización del Esquema de Ordenamiento Territorial (EOT) con componente de amenaza sísmica local (NSR-10).';
    customAdvice3 = 'Fortalecimiento del Cuerpo de Bomberos y Defensa Civil con equipos de rescate urbano en estructuras colapsadas.';
    customAdvice4 = 'Capacitación Ciudadana en Gestión del Riesgo: Protocolos de autoprotección en instituciones educativas y rurales.';
  }

  const container = document.getElementById('report-paper-content');
  if (!container) return;

  container.innerHTML = `
    <!-- Encabezado Institucional Departamental -->
    <table class="doc-header-table">
      <tr>
        <td style="width: 65%;">
          <div class="doc-logo-area">
            <img src="logo.jpeg" alt="Logo GeoSismo" class="doc-brand-logo">
            <div class="doc-badge-shield">SGC</div>
            <div class="doc-header-text">
              <h2>República de Colombia · Departamento de Santander</h2>
              <h3>Comité Municipal para la Gestión del Riesgo de Desastres (CMGRD)</h3>
              <p>Sistema Departamental de Gestión del Riesgo · Ley 1523 de 2012 · Red Sismológica Nacional</p>
            </div>
          </div>
        </td>
        <td style="width: 35%;">
          <div class="doc-radicado-box">
            <div><b>RADICADO OFICIAL:</b></div>
            <div class="doc-radicado-num">CMGRD-SAN-2026-${codigoDane}</div>
            <div style="margin-top: 3px;">Fecha: 13 de Octubre de 2026</div>
            <div>Vigencia: Periodo Constitucional 2024 - 2027</div>
          </div>
        </td>
      </tr>
    </table>

    <!-- Barra de Título del Documento -->
    <div class="doc-title-bar">
      <h1>FICHA TÉCNICA EJECUTIVA DE DIAGNÓSTICO SÍSMICO Y VULNERABILIDAD TERRITORIAL</h1>
      <span>MUNICIPIO: ${item.municipio.toUpperCase()}</span>
    </div>

    <!-- Sección Hero: Diagnóstico General y Nivel ICRST -->
    <div class="doc-hero-section">
      <div class="doc-mun-details">
        <h3>${item.municipio} — Provincia de ${item.provincia}</h3>
        <div class="doc-mun-meta">
          <span><b>Código DANE:</b> ${codigoDane}</span>
          <span><b>Población DANE:</b> ${Number(item.poblacion || 0).toLocaleString()} hab.</span>
          <span><b>Zona Geológica:</b> ${zonaGeologica}</span>
        </div>
        <p class="doc-mun-desc">
          <b>Diagnóstico Multivariado:</b> La unidad territorial presenta un índice integral de riesgo sísmico clasificado como 
          <strong style="color: ${scoreColor};">${item.nivel_riesgo_territorial}</strong>. 
          El modelo de Machine Learning determina que el riesgo real en este territorio está modulado por la interacción entre la frecuencia profunda del Nido de Los Santos (~155 km) y la cercanía a la estructura cortical <i>${item.falla_cercana}</i> con suelos geotécnicos caracterizados como <i>${item.vulnerabilidad_suelo}</i>.
        </p>
      </div>

      <div class="doc-score-card" style="border-color: ${badgeBorder};">
        <span style="font-size: 8.5px; font-weight: 700; color: #64748b; text-transform: uppercase;">Índice Compuesto ICRST</span>
        <div class="doc-score-val" style="color: ${scoreColor};">${score.toFixed(1)} <span style="font-size: 11px; font-weight: 700;">/ 100</span></div>
        <div class="doc-score-level" style="color: ${scoreColor};">${levelTag}</div>
        <span style="font-size: 7.5px; color: #94a3b8; margin-top: 2px;">Pesos: Peligro 40% | Exp 35% | Suelo 25%</span>
      </div>
    </div>

    <!-- Desglose de los Tres Pilares del Modelo ICRST -->
    <div class="doc-pilares-grid">
      <!-- Pilar 1: Peligro Físico -->
      <div class="doc-pilar-card">
        <h4>
          <span>1. Peligro Físico Sísmico</span>
          <span class="doc-pilar-val" style="color: #dc2626;">${Number(item.subindice_peligro_fisico || 0).toFixed(1)}%</span>
        </h4>
        <table class="doc-pilar-table">
          <tr><td>Sismos Históricos Registrados:</td><td>${item.total_sismos_registrados} eventos</td></tr>
          <tr><td>Magnitud Instrumental Máxima:</td><td>M ${Number(item.magnitud_maxima || 0).toFixed(1)} Mw</td></tr>
          <tr><td>Aceleración PGA Estimada:</td><td>${Number(item.aceleracion_pga_maxima_g || 0).toFixed(4)} g</td></tr>
          <tr><td>Falla Cortical Asociada:</td><td style="color:#0284c7;">${item.falla_cercana}</td></tr>
        </table>
      </div>

      <!-- Pilar 2: Exposición Poblacional -->
      <div class="doc-pilar-card">
        <h4>
          <span>2. Exposición y Activos</span>
          <span class="doc-pilar-val" style="color: #d97706;">${Number(item.subindice_exposicion || 0).toFixed(1)}%</span>
        </h4>
        <table class="doc-pilar-table">
          <tr><td>Censo Poblacional DANE:</td><td>${Number(item.poblacion || 0).toLocaleString()} hab.</td></tr>
          <tr><td>Densidad de Activos Críticos:</td><td>Hospitales, Redes, Vías</td></tr>
          <tr><td>Régimen Tectónico ML:</td><td style="color:#0284c7;">${item.cluster_nombre_dominante || 'Regional'}</td></tr>
          <tr><td>Peso en el ICRST Municipal:</td><td>35% Ponderado</td></tr>
        </table>
      </div>

      <!-- Pilar 3: Vulnerabilidad del Suelo -->
      <div class="doc-pilar-card">
        <h4>
          <span>3. Vulnerabilidad Geotécnica</span>
          <span class="doc-pilar-val" style="color: #0284c7;">${Number(item.subindice_vulnerabilidad || 0).toFixed(1)}%</span>
        </h4>
        <table class="doc-pilar-table">
          <tr><td>Condición del Suelo:</td><td style="font-size:8px;">${item.vulnerabilidad_suelo}</td></tr>
          <tr><td>Sismos Superficiales (&lt;40 km):</td><td>${item.sismos_superficiales_destructivos} sismos (${item.pct_sismicidad_superficial}%)</td></tr>
          <tr><td>Tipo Geotécnico NSR-10:</td><td>Perfiles C / D / E</td></tr>
          <tr><td>Susceptibilidad a Amplificación:</td><td style="color:#dc2626;">Fallas Activas</td></tr>
        </table>
      </div>
    </div>

    <!-- Matriz de Acciones Operativas Inmediatas para el CMGRD -->
    <div class="doc-section-title">
      <span>Matriz de Recomendaciones Inmediatas de Mitigación (CMGRD)</span>
      <span style="font-size: 8px; font-weight: 600; color: #64748b;">Plan de Acción Municipal · Ley 1523 / 2012</span>
    </div>

    <table class="doc-matrix-table">
      <thead>
        <tr>
          <th style="width: 8%;">Prioridad</th>
          <th style="width: 32%;">Línea de Acción Estratégica</th>
          <th style="width: 42%;">Medida Operativa Concreta para el Territorio</th>
          <th style="width: 18%;">Entidad Responsable</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><span class="doc-priority-tag urgente">Urgente</span></td>
          <td><b>Ordenamiento Territorial & Norma NSR-10</b></td>
          <td>${customAdvice1}</td>
          <td>Secretaría de Planeación</td>
        </tr>
        <tr>
          <td><span class="doc-priority-tag alta">Alta</span></td>
          <td><b>Infraestructura Indispensable (Grupo IV)</b></td>
          <td>${customAdvice2}</td>
          <td>Secretaría de Infraestructura</td>
        </tr>
        <tr>
          <td><span class="doc-priority-tag alta">Alta</span></td>
          <td><b>Preparación y Rutas de Evacuación</b></td>
          <td>${customAdvice3}</td>
          <td>Bomberos · Defensa Civil</td>
        </tr>
        <tr>
          <td><span class="doc-priority-tag media">Media</span></td>
          <td><b>Fondo Municipal de Gestión del Riesgo</b></td>
          <td>${customAdvice4}</td>
          <td>Alcaldía · CMGRD</td>
        </tr>
      </tbody>
    </table>

    <!-- Bloque de Firmas Institucionales para Validez en Sala CMGRD -->
    <div class="doc-signatures-grid">
      <div class="doc-sig-box">
        <div style="height: 28px;"></div>
        <div class="doc-sig-name">COORDINADOR(A) DEL CMGRD</div>
        <div class="doc-sig-role">Comité Municipal de Gestión del Riesgo<br>Alcaldía Municipal de ${item.municipio}</div>
      </div>
      <div class="doc-sig-box">
        <div style="height: 28px;"></div>
        <div class="doc-sig-name">ALCALDE(SA) MUNICIPAL</div>
        <div class="doc-sig-role">Presidente del Consejo Municipal de Gestión del Riesgo<br>Municipio de ${item.municipio}, Santander</div>
      </div>
      <div class="doc-sig-box">
        <div style="height: 28px;"></div>
        <div class="doc-sig-name">DIRECCIÓN CIENTÍFICA GEOSISMO</div>
        <div class="doc-sig-role">Inteligencia Artificial Territorial & Machine Learning<br>Unidades Tecnológicas de Santander (UTS / CIAI)</div>
      </div>
    </div>

    <!-- Pie Legal Oficial -->
    <div class="doc-footer-legal">
      <span>Fuente Primaria: Servicio Geológico Colombiano (RSNC) 2004-2026 · Censo Nacional DANE · Norma Sismorresistente NSR-10.</span>
      <span>Documento técnico válido para PMGRD y EMRE · Generado por GeoSismo Santander ML</span>
    </div>
  `;

  const modal = document.getElementById('modal-ficha-pdf');
  if (modal) modal.classList.remove('hidden');
}

/**
 * Cierra el modal de Ficha Técnica Municipal
 */
function closeMunicipalPdfReport() {
  const modal = document.getElementById('modal-ficha-pdf');
  if (modal) modal.classList.add('hidden');
}

/**
 * Lanza la impresión nativa formateada para 1 página Letter en PDF
 */
function printMunicipalPdf() {
  window.print();
}

// Exportar globalmente para eventos en HTML / Popups Leaflet
window.openMunicipalPdfReport = openMunicipalPdfReport;
window.closeMunicipalPdfReport = closeMunicipalPdfReport;
window.printMunicipalPdf = printMunicipalPdf;
window.inspectMunicipio = inspectMunicipio;
window.inspectSismo = inspectSismo;

