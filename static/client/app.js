/**
 * OCTAGON MANET CesiumJS Client and Wireless Channel Engine
 * Integrated with Cesium 3D Terrain & RF Engine
 */

// Node definition and high-visibility contrasting military color palette
const NODE_COLORS = [
    '#00f0ff', // N1: Bright Cyan (Squad Leader)
    '#00ff66', // N2: Vivid Neon Green (Infantry Scout)
    '#ffb700', // N3: Golden Amber (Support Gunner)
    '#ff0055', // N4: Hot Crimson (UAV Relay)
    '#b5179e', // N5: Electric Magenta (Recon Scout)
    '#4361ee', // N6: Tactical Cobalt (Sniper Team)
    '#ff6b35', // N7: Safety Orange (UGV Vanguard)
    '#00f5d4'  // N8: Turquoise Glow (Command Post)
];

const NODE_NAMES = [
    { code: 'Alpha', role: '분대 지휘 노드' },
    { code: 'Bravo', role: '정찰 노드' },
    { code: 'Charlie', role: '통신 중계 노드' },
    { code: 'Delta', role: 'UAV 중계 노드' },
    { code: 'Echo', role: '전방 관측 노드' },
    { code: 'Foxtrot', role: '기동 노드' },
    { code: 'Golf', role: '지원 노드' },
    { code: 'Hotel', role: '지휘소 노드' }
];
const RADIO_ANTENNA_HEIGHT_M = 1.5; // typical shoulder/vest-mounted man-pack whip above local ground

const MAP_LOCATIONS = {
    munjeong: { name: '서울 · 문정역', lat: 37.48593, lon: 127.12236, altitude: 10000 },
    seoul: { name: '서울 · 시청', lat: 37.5665, lon: 126.9780, altitude: 14000 },
    busan: { name: '부산 · 시청', lat: 35.1796, lon: 129.0756, altitude: 14000 },
    incheon: { name: '인천 · 시청', lat: 37.4563, lon: 126.7052, altitude: 14000 },
    daegu: { name: '대구 · 시청', lat: 35.8714, lon: 128.6014, altitude: 14000 },
    daejeon: { name: '대전 · 시청', lat: 36.3504, lon: 127.3845, altitude: 14000 },
    gwangju: { name: '광주 · 시청', lat: 35.1595, lon: 126.8526, altitude: 14000 },
    ulsan: { name: '울산 · 시청', lat: 35.5384, lon: 129.3114, altitude: 14000 },
    sejong: { name: '세종 · 정부청사', lat: 36.4800, lon: 127.2890, altitude: 14000 },
    suwon: { name: '수원 · 화성행궁', lat: 37.2636, lon: 127.0286, altitude: 11000 },
    jeju: { name: '제주 · 제주시청', lat: 33.4996, lon: 126.5312, altitude: 14000 },
    gyeongbokgung: { name: '서울 · 경복궁', lat: 37.5796, lon: 126.9770, altitude: 6500 },
    namsan: { name: '서울 · 남산서울타워', lat: 37.5512, lon: 126.9882, altitude: 8000 },
    'lotte-world-tower': { name: '서울 · 롯데월드타워', lat: 37.5125, lon: 127.1025, altitude: 6500 },
    songdo: { name: '인천 · 송도 센트럴파크', lat: 37.3930, lon: 126.6340, altitude: 7000 },
    haeundae: { name: '부산 · 해운대', lat: 35.1587, lon: 129.1604, altitude: 7500 },
    gyeongju: { name: '경주 · 불국사', lat: 35.7898, lon: 129.3320, altitude: 7000 },
    jeonju: { name: '전주 · 한옥마을', lat: 35.8154, lon: 127.1530, altitude: 6500 },
    seoraksan: { name: '설악산 · 국립공원', lat: 38.1190, lon: 128.4650, altitude: 18000 },
    hallasan: { name: '제주 · 한라산', lat: 33.3617, lon: 126.5292, altitude: 18000 },
    seongsan: { name: '제주 · 성산일출봉', lat: 33.4580, lon: 126.9420, altitude: 7500 },
    dmz: { name: '파주 · 임진각', lat: 37.8880, lon: 126.7410, altitude: 9000 }
};

class OctagonApp {
    constructor() {
        this.container = document.getElementById('canvas-container');
        this.scaleMeters = 50;

        this.mapLocation = MAP_LOCATIONS.munjeong;
        this.ionLoadPromise = null;
        this.ionLoadId = 0;
        this.cesiumBuildingsTileset = null;
        this.cesiumIonImageryLayer = null;
        this.cesiumOsmImageryLayer = null;
        this.cesiumTerrainProvider = null;
        this.nodeGroundHeights = {};
        this.lastValidNodePositions = new Map();
        this.lastTelemetryPositions = new Map();
        this.lastTelemetrySnapshotAt = null;
        this.radioPathProfiles = new Map();
        this.radioProfileRefreshAt = 0;
        this.lastGroundSampleAt = 0;
        this.radioProfilePromise = null;
        this.cesiumRadioEnvironment = { analyzePath: (a, b, h, wavelength) => this.analyzeCesiumRadioPath(a, b, h, wavelength) };
        this.cesiumViewer = null;
        this.cesiumDataSource = null;
        this.isCesiumVisible = false;

        // Simulation Nodes (8 MANET nodes)
        this.nodes = [];
        this.selectedNodeId = 1;
        this.initNodes();

        // Wireless Engine
        this.wireless = new WirelessEngine({
            frequencyHz: 2.4e9,
            pathLossExponent: 2.8,
            shadowingSigma: 3.0,
            txPowerDbm: 23.0
        });

        // Current computed matrix
        this.latestMatrix = [];
        this.nearestNodeLinkKeys = new Set();

        // Interaction State
        this.isDraggingNode = false;
        this.draggedNode = null;
        this.isPanning = false;
        this.isOrbiting3D = false;
        this.lastMousePos = { x: 0, y: 0 };
        this.lastDragWorldPos = { x: 0, y: 0 };
        this.lastDragTime = 0;

        // Auto Patrol Simulation
        this.isPatrolling = false;
        this.patrolAngle = 0;

        // Networking (WebSocket)
        this.ws = null;
        this.wsConnected = false;
        this.updateRateHz = 30;
        this.txTimer = null;
        this.frameCount = 0;
        this.lastFpsCalcTime = performance.now();
        this.txFps = 0;

        // Animation timing
        this.lastAnimTime = performance.now();

        // Setup
        this.setupEventListeners();
        this.applyPreset('scatter');
        this.initWebSocket();
        this.restartTxLoop();
        this.activateCesiumView();
        document.getElementById('hud-view-val').textContent = 'Cesium 3D 지도';

        // Start render loop
        requestAnimationFrame((t) => this.renderLoop(t));
    }

    initNodes() {
        this.nodes = [];
        for (let i = 0; i < 8; i++) {
            this.nodes.push({
                id: i + 1,
                name: `N${i + 1} (${NODE_NAMES[i].code})`,
                role: NODE_NAMES[i].role,
                color: NODE_COLORS[i],
                x: 0,
                y: 0,
                z: RADIO_ANTENNA_HEIGHT_M, // antenna altitude until terrain sampling completes
                vx: 0,
                vy: 0,
                vz: 0,
                radiusPx: 17,
                pulsePhase: Math.random() * Math.PI * 2
            });
        }
    }

    applyPreset(presetName) {
        this.rebaseNodesToCurrentMapCenter();
        // The chosen map scale describes the visible local area. Keep every layout
        // proportional to it so formations remain legible at every zoom level.
        const radius = this.scaleMeters * 0.42;
        const positions = [];
        if (presetName === 'scatter') {
            const maxRadius = this.scaleMeters * 0.38;
            const minSpacing = this.scaleMeters * 0.18;
            for (let i = 0; i < this.nodes.length; i++) {
                let candidate = null;
                for (let attempt = 0; attempt < 1200; attempt++) {
                    const angle = Math.random() * Math.PI * 2;
                    const distance = maxRadius * Math.sqrt(Math.random());
                    const point = { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
                    if (positions.every(other => Math.hypot(point.x - other.x, point.y - other.y) >= minSpacing)) {
                        candidate = point;
                        break;
                    }
                }
                // Guaranteed fallback for unusually small scale or a dense viewport.
                if (!candidate) {
                    const angle = i * 2 * Math.PI / this.nodes.length - Math.PI / 2;
                    candidate = { x: maxRadius * Math.cos(angle), y: maxRadius * Math.sin(angle) };
                }
                positions.push(candidate);
            }
        } else {
            for (let i = 0; i < this.nodes.length; i++) {
                let x = 0, y = 0;
                if (presetName === 'octagon') {
                    const angle = i * 2 * Math.PI / 8 - Math.PI / 2;
                    x = radius * Math.cos(angle);
                    y = radius * Math.sin(angle);
                } else if (presetName === 'grid') {
                    x = ((i % 4) - 1.5) * radius * 0.58;
                    y = (Math.floor(i / 4) - 0.5) * radius * 0.9;
                } else if (presetName === 'line') {
                    x = (i - 3.5) * (radius * 2 / 7);
                } else if (presetName === 'cluster') {
                    const clusterCenter = i < 4 ? -radius * 0.62 : radius * 0.62;
                    const angle = (i % 4) * Math.PI / 2;
                    x = clusterCenter + radius * 0.22 * Math.cos(angle);
                    y = radius * 0.22 * Math.sin(angle);
                }
                positions.push({ x, y });
            }
        }
        this.nodes.forEach((node, i) => {
            node.x = Math.round(positions[i].x * 10) / 10;
            node.y = Math.round(positions[i].y * 10) / 10;
            node.vx = 0;
            node.vy = 0;
            node.vz = 0;
            node.z = (this.nodeGroundHeights[node.id] ?? 0) + RADIO_ANTENNA_HEIGHT_M;
        });
        // A formation change is a relocation, not physical movement; use it as a new
        // telemetry baseline so it cannot create a one-frame Doppler/RSSI spike.
        this.lastTelemetryPositions.clear();
        this.lastTelemetrySnapshotAt = null;
        if (this.cesiumTerrainProvider) this.sampleTacticalNodeHeights(this.cesiumTerrainProvider);
        this.updateTelemetryCard();
    }

    rebaseNodesToCurrentMapCenter() {
        if (!this.cesiumViewer) return;
        const C = window.Cesium;
        const scene = this.cesiumViewer.scene;
        const center = new C.Cartesian2(scene.canvas.clientWidth / 2, scene.canvas.clientHeight / 2);
        const ray = this.cesiumViewer.camera.getPickRay(center);
        const point = ray && scene.globe.pick(ray, scene);
        const cartographic = point ? C.Cartographic.fromCartesian(point) : this.cesiumViewer.camera.pickEllipsoid(center, scene.globe.ellipsoid);
        if (!cartographic) return;
        this.mapLocation = {
            name: '현재 지도 중심',
            lat: C.Math.toDegrees(cartographic.latitude),
            lon: C.Math.toDegrees(cartographic.longitude),
            altitude: this.cesiumViewer.camera.positionCartographic.height
        };
        this.nodeGroundHeights = {};
        this.radioPathProfiles.clear();
        const terrainLabel = document.getElementById('hud-terrain-val');
        if (terrainLabel) terrainLabel.textContent = `지도 중심 ${this.mapLocation.lat.toFixed(5)}, ${this.mapLocation.lon.toFixed(5)}`;
    }

    setupEventListeners() {
        window.addEventListener('resize', () => this.resizeCanvas());

        document.getElementById('select-map-location').addEventListener('change', (event) => {
            this.setMapLocation(event.target.value);
        });
        const ionTokenInput = document.getElementById('cesium-ion-token');
        try { ionTokenInput.value = localStorage.getItem('octagonCesiumIonToken') || ''; } catch (error) { /* storage can be disabled */ }
        document.getElementById('btn-save-ion-token').addEventListener('click', () => {
            const token = ionTokenInput.value.trim();
            try {
                if (token) localStorage.setItem('octagonCesiumIonToken', token);
                else localStorage.removeItem('octagonCesiumIonToken');
            } catch (error) {
                this.setCesiumStatus('Browser storage unavailable');
                return;
            }
            if (window.Cesium) window.Cesium.Ion.defaultAccessToken = token || window.Cesium.Ion.defaultAccessToken;
            if (this.cesiumViewer) this.connectCesiumIon();
            else this.activateCesiumView();
        });

        // Scale Buttons
        document.querySelectorAll('.scale-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.scale-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const scaleVal = parseFloat(btn.dataset.scale);
                this.setScale(scaleVal);
            });
        });

        // Formation Presets
        document.getElementById('preset-scatter').addEventListener('click', () => this.applyPreset('scatter'));
        document.getElementById('preset-octagon').addEventListener('click', () => this.applyPreset('octagon'));
        document.getElementById('preset-grid').addEventListener('click', () => this.applyPreset('grid'));
        document.getElementById('preset-line').addEventListener('click', () => this.applyPreset('line'));
        document.getElementById('preset-cluster').addEventListener('click', () => this.applyPreset('cluster'));

        // Reset View
        document.getElementById('btn-reset-view').addEventListener('click', () => this.resetView());
        document.getElementById('btn-recenter').addEventListener('click', () => this.resetView());

        // Zoom +/-
        document.getElementById('btn-zoom-in').addEventListener('click', () => this.zoomAtCenter(1.2));
        document.getElementById('btn-zoom-out').addEventListener('click', () => this.zoomAtCenter(1 / 1.2));

        // Auto Patrol Toggle
        const btnPatrol = document.getElementById('btn-toggle-patrol');
        btnPatrol.addEventListener('click', () => {
            this.isPatrolling = !this.isPatrolling;
            if (this.isPatrolling) {
                const now = performance.now();
                this.nodes.forEach(node => { node.patrolChangeAt = now; });
            }
            if (!this.isPatrolling) this.nodes.forEach(node => { node.vx = 0; node.vy = 0; node.vz = 0; });
            btnPatrol.classList.toggle('active', this.isPatrolling);
            btnPatrol.querySelector('span').textContent = this.isPatrolling ? '⏸ STOP PATROL' : '▶ AUTO PATROL';
        });

        // Sliders
        const sliderRate = document.getElementById('slider-rate');
        sliderRate.addEventListener('input', (e) => {
            this.updateRateHz = parseInt(e.target.value);
            document.getElementById('val-rate').textContent = `${this.updateRateHz} Hz (${Math.round(1000 / this.updateRateHz)}ms)`;
            this.restartTxLoop();
        });

        const sliderPle = document.getElementById('slider-ple');
        sliderPle.addEventListener('input', (e) => {
            this.wireless.pathLossExponent = parseFloat(e.target.value);
            document.getElementById('val-ple').textContent = e.target.value;
        });

        const sliderShadow = document.getElementById('slider-shadow');
        sliderShadow.addEventListener('input', (e) => {
            this.wireless.shadowingSigma = parseFloat(e.target.value);
            document.getElementById('val-shadow').textContent = `${e.target.value} dB`;
        });

        const sliderFreq = document.getElementById('slider-freq');
        sliderFreq.addEventListener('input', (e) => {
            this.wireless.frequencyHz = parseFloat(e.target.value) * 1e9;
            document.getElementById('val-freq').textContent = `${e.target.value} GHz`;
        });

        const sliderTxPwr = document.getElementById('slider-txpwr');
        sliderTxPwr.addEventListener('input', (e) => {
            this.wireless.txPowerDbm = parseFloat(e.target.value);
            document.getElementById('val-txpwr').textContent = `${e.target.value} dBm`;
        });
    }

    setScale(meters) {
        this.scaleMeters = meters;
        document.getElementById('current-scale-label').textContent = `${meters}m`;
        if (this.cesiumViewer) {
            const camera = this.cesiumViewer.camera;
            const currentAltitude = camera.positionCartographic.height;
            const targetAltitude = Math.min(Math.max(meters / 1.15, 5), 10000);
            if (Math.abs(currentAltitude - targetAltitude) > 2) {
                const verticalTravel = Math.sin(1.05);
                if (currentAltitude > targetAltitude) camera.zoomIn((currentAltitude - targetAltitude) / verticalTravel);
                else camera.zoomOut((targetAltitude - currentAltitude) / verticalTravel);
            }
        }
        this.updateScaleBar();
        this.updateHUD();
    }

    resetView() {
        if (this.cesiumViewer) this.flyCesiumHome();
    }

    zoomAtCenter(factor) {
        const nextScale = Math.min(Math.max(this.scaleMeters / factor, 10), 500);
        const scales = [10, 20, 50, 100, 200, 500];
        const nearest = scales.reduce((best, value) => Math.abs(value - nextScale) < Math.abs(best - nextScale) ? value : best, scales[0]);
        this.setScale(nearest);
        document.querySelectorAll('.scale-btn').forEach(button => button.classList.toggle('active', Number(button.dataset.scale) === nearest));
    }

    resizeCanvas() {
        if (this.cesiumViewer) this.cesiumViewer.resize();
        this.updateScaleBar();
    }

    async activateCesiumView() {
        const container = document.getElementById('cesium-container');
        container.style.display = 'block';
        if (this.cesiumViewer) {
            this.cesiumViewer.resize();
            this.isCesiumVisible = true;
            this.connectCesiumIon();
            return;
        }
        if (!window.Cesium) {
            container.style.display = 'block';
            this.setCesiumStatus('CesiumJS unavailable; check the network connection');
            console.error('CesiumJS failed to load.');
            return;
        }

        const C = window.Cesium;
        this.cesiumViewer = new C.Viewer(container, {
            baseLayer: false, terrainProvider: new C.EllipsoidTerrainProvider(),
            animation: false, timeline: false, geocoder: false, homeButton: false,
            sceneModePicker: false, baseLayerPicker: false, navigationHelpButton: false,
            fullscreenButton: false, infoBox: false, selectionIndicator: false,
            shouldAnimate: false
        });
        this.cesiumOsmImageryLayer = this.cesiumViewer.imageryLayers.addImageryProvider(new C.UrlTemplateImageryProvider({
            url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            credit: new C.Credit('© OpenStreetMap contributors')
        }));
        this.cesiumViewer.scene.backgroundColor = C.Color.fromCssColorString('#101923');
        this.cesiumViewer.scene.globe.baseColor = C.Color.fromCssColorString('#26342e');
        this.cesiumViewer.scene.globe.enableLighting = true;
        this.cesiumViewer.scene.globe.showGroundAtmosphere = false;
        this.cesiumViewer.scene.screenSpaceCameraController.minimumZoomDistance = 5;
        this.cesiumViewer.scene.screenSpaceCameraController.maximumZoomDistance = 100000;
        const cameraController = this.cesiumViewer.scene.screenSpaceCameraController;
        cameraController.enableRotate = false;
        cameraController.enableTranslate = true;
        cameraController.enableTilt = false;
        cameraController.enableLook = false;
        cameraController.translateEventTypes = C.CameraEventType.LEFT_DRAG;
        this.addCesiumTacticalOverlay();
        this.setupCesiumNodeDrag();
        this.flyCesiumHome();
        this.cesiumViewer.resize();
        this.isCesiumVisible = true;
        this.connectCesiumIon();
    }

    localToCesium(x, y, height = 0) {
        const C = window.Cesium;
        const centerLat = this.mapLocation.lat, centerLon = this.mapLocation.lon;
        const lat = centerLat + y / 111320;
        const lon = centerLon + x / (111320 * Math.cos(centerLat * Math.PI / 180));
        return C.Cartesian3.fromDegrees(lon, lat, height);
    }

    getNodeGeographicPosition(node) {
        const fallback = this.lastValidNodePositions.get(node.id);
        const configuredCenter = this.mapLocation || MAP_LOCATIONS.munjeong;
        const center = Number.isFinite(configuredCenter.lat) && Number.isFinite(configuredCenter.lon)
            ? configuredCenter : MAP_LOCATIONS.munjeong;
        const x = Number.isFinite(node.x) ? node.x : 0;
        const y = Number.isFinite(node.y) ? node.y : 0;
        let latitude = Number.isFinite(center.lat) ? center.lat + y / 111320 : NaN;
        let longitude = Number.isFinite(center.lon)
            ? center.lon + x / (111320 * Math.cos(center.lat * Math.PI / 180))
            : NaN;
        let altitude = Number.isFinite(node.z) && node.z !== 0 && Math.abs(node.z) <= 100000
            ? node.z
            : (fallback?.altitude_m ?? RADIO_ANTENNA_HEIGHT_M);

        const validLatLon = Number.isFinite(latitude) && Number.isFinite(longitude)
            && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
            && !(latitude === 0 && longitude === 0);
        if (!validLatLon) {
            latitude = fallback?.latitude ?? center.lat;
            longitude = fallback?.longitude ?? center.lon;
        }
        if (!Number.isFinite(altitude) || altitude === 0 || Math.abs(altitude) > 100000) {
            altitude = fallback?.altitude_m ?? RADIO_ANTENNA_HEIGHT_M;
        }

        const position = { latitude, longitude, altitude_m: altitude };
        this.lastValidNodePositions.set(node.id, position);
        return position;
    }

    createTelemetryNodeSnapshot() {
        const now = performance.now();
        const elapsedSeconds = this.lastTelemetrySnapshotAt === null
            ? 0
            : Math.max(0.001, (now - this.lastTelemetrySnapshotAt) / 1000);
        const snapshot = this.nodes.map(node => {
            const position = this.getNodeGeographicPosition(node);
            const x = Number.isFinite(node.x) ? node.x : 0;
            const y = Number.isFinite(node.y) ? node.y : 0;
            const z = position.altitude_m;
            const previous = this.lastTelemetryPositions.get(node.id);
            const moved = previous && Math.hypot(x - previous.x, y - previous.y) > 0.001;
            // Derive velocity from transmitted positions, not stale animation state.
            // This makes a stationary node report zero even if a previous drag/patrol
            // left a velocity behind. z follows terrain sampling, not vertical motion.
            const vx = moved && elapsedSeconds > 0 ? (x - previous.x) / elapsedSeconds : 0;
            const vy = moved && elapsedSeconds > 0 ? (y - previous.y) / elapsedSeconds : 0;
            node.vx = vx;
            node.vy = vy;
            node.vz = 0;
            this.lastTelemetryPositions.set(node.id, { x, y });
            return {
                id: node.id,
                name: node.name,
                role: node.role,
                x, y, z,
                position_3d: position,
                vx,
                vy,
                vz: 0
            };
        });
        this.lastTelemetrySnapshotAt = now;
        return snapshot;
    }

    flyCesiumHome() {
        if (!this.cesiumViewer) return;
        this.cesiumViewer.camera.flyTo({
            destination: window.Cesium.Cartesian3.fromDegrees(this.mapLocation.lon, this.mapLocation.lat, Math.max(5, this.scaleMeters / 1.15)),
            orientation: { heading: 0, pitch: -1.05, roll: 0 }, duration: 1.4
        });
    }

    setCesiumStatus(message) {
        const status = document.getElementById('terrain-data-status');
        if (status) status.textContent = message;
    }

    async connectCesiumIon() {
        if (!this.cesiumViewer || !window.Cesium) return;
        const C = window.Cesium;
        const requestId = ++this.ionLoadId;
        this.setCesiumStatus('Connecting Cesium 3D terrain and buildings…');
        try {
            const token = localStorage.getItem('octagonCesiumIonToken');
            if (token) C.Ion.defaultAccessToken = token;
        } catch (error) { /* use Cesium's evaluation token when browser storage is unavailable */ }

        if (this.cesiumBuildingsTileset) {
            this.cesiumViewer.scene.primitives.remove(this.cesiumBuildingsTileset);
            this.cesiumBuildingsTileset = null;
        }
        if (this.cesiumIonImageryLayer) {
            this.cesiumViewer.imageryLayers.remove(this.cesiumIonImageryLayer, true);
            this.cesiumIonImageryLayer = null;
        }
        if (this.cesiumOsmImageryLayer) this.cesiumOsmImageryLayer.show = true;
        this.cesiumViewer.terrainProvider = new C.EllipsoidTerrainProvider();
        this.cesiumTerrainProvider = null;

        this.ionLoadPromise = (async () => {
            let terrainReady = false;
            let buildingsReady = false;
            try {
                const terrainProvider = await C.createWorldTerrainAsync({ requestVertexNormals: true, requestWaterMask: true });
                if (requestId !== this.ionLoadId || !this.cesiumViewer) return;
                this.cesiumViewer.terrainProvider = terrainProvider;
                this.cesiumTerrainProvider = terrainProvider;
                terrainReady = true;
                this.sampleTacticalNodeHeights(terrainProvider);
            } catch (error) {
                console.warn('Cesium World Terrain could not be loaded.', error);
            }
            try {
                const tileset = await C.createOsmBuildingsAsync();
                if (requestId !== this.ionLoadId || !this.cesiumViewer) return;
                tileset.style = new C.Cesium3DTileStyle({
                    color: { conditions: [
                        ["${feature['cesium#estimatedHeight']} >= 120", "color('#ff5a50')"],
                        ["${feature['cesium#estimatedHeight']} >= 60", "color('#ffb347')"],
                        ["${feature['cesium#estimatedHeight']} >= 20", "color('#66d9ef')"],
                        ["true", "color('#a8c7d8')"]
                    ] }
                });
                this.cesiumViewer.scene.primitives.add(tileset);
                this.cesiumBuildingsTileset = tileset;
                buildingsReady = true;
            } catch (error) {
                console.warn('Cesium OSM Buildings could not be loaded.', error);
            }
            try {
                const imageryProvider = await C.createWorldImageryAsync({ style: C.IonWorldImageryStyle.AERIAL_WITH_LABELS });
                if (requestId !== this.ionLoadId || !this.cesiumViewer) return;
                this.cesiumIonImageryLayer = this.cesiumViewer.imageryLayers.addImageryProvider(imageryProvider);
                this.cesiumOsmImageryLayer.show = false;
            } catch (error) {
                console.warn('Cesium World Imagery could not be loaded; keeping OpenStreetMap imagery.', error);
            }
            if (requestId === this.ionLoadId) {
                this.setCesiumStatus(terrainReady && buildingsReady ? 'Cesium terrain + 3D buildings streaming' : 'Cesium ion token required for 3D terrain/buildings');
            }
        })();
        await this.ionLoadPromise;
    }

    async sampleTacticalNodeHeights(terrainProvider) {
        const C = window.Cesium;
        const location = this.mapLocation;
        try {
            const positions = this.nodes.map(node => C.Cartographic.fromDegrees(
                location.lon + node.x / (111320 * Math.cos(location.lat * Math.PI / 180)),
                location.lat + node.y / 111320
            ));
            const sampled = await C.sampleTerrainMostDetailed(terrainProvider, positions);
            if (location !== this.mapLocation) return;
            sampled.forEach((point, index) => {
                if (Number.isFinite(point.height)) {
                    this.nodeGroundHeights[this.nodes[index].id] = point.height;
                    this.nodes[index].z = parseFloat((point.height + RADIO_ANTENNA_HEIGHT_M).toFixed(1));
                }
            });
            this.cesiumViewer.scene.requestRender();
        } catch (error) {
            console.warn('Could not sample Cesium terrain below tactical nodes.', error);
        }
    }

    async refreshCesiumRadioProfiles(force = false) {
        const viewer = this.cesiumViewer;
        if (!viewer || this.radioProfilePromise) return;
        const now = performance.now();
        if (!force && now - this.radioProfileRefreshAt < 900) return;
        this.radioProfileRefreshAt = now;
        const C = window.Cesium;
        const location = this.mapLocation;
        const pairs = [];
        const positions = [];
        for (let i = 0; i < this.nodes.length; i++) {
            for (let j = i + 1; j < this.nodes.length; j++) {
                const a = this.nodes[i], b = this.nodes[j];
                const horizontalDistance = Math.hypot(b.x - a.x, b.y - a.y);
                const segments = Math.min(64, Math.max(3, Math.ceil(horizontalDistance / 10)));
                const start = positions.length;
                for (let step = 0; step <= segments; step++) {
                    const t = step / segments;
                    positions.push(C.Cartographic.fromDegrees(
                        location.lon + (a.x + (b.x - a.x) * t) / (111320 * Math.cos(location.lat * Math.PI / 180)),
                        location.lat + (a.y + (b.y - a.y) * t) / 111320
                    ));
                }
                pairs.push({ a, b, start, count: segments + 1 });
            }
        }
        this.radioProfilePromise = (async () => {
            try {
                const provider = this.cesiumTerrainProvider || viewer.terrainProvider;
                let ground = positions.map(() => ({ height: 0 }));
                try { ground = await C.sampleTerrainMostDetailed(provider, positions.map(p => C.Cartographic.clone(p))); }
                catch (error) { /* ellipsoid fallback: ground remains zero */ }
                let surfaces = ground;
                try {
                    if (viewer.scene.sampleHeightSupported) {
                        surfaces = await viewer.scene.sampleHeightMostDetailed(positions.map(p => C.Cartographic.clone(p)));
                    }
                } catch (error) { /* use terrain-only profile when 3D tile heights are unavailable */ }
                if (location !== this.mapLocation) return;
                const updated = new Map();
                const sampleTime = performance.now();
                const sampleDt = Math.max(0.1, (sampleTime - this.lastGroundSampleAt) / 1000);
                for (const pair of pairs) {
                    const points = [];
                    for (let index = 0; index < pair.count; index++) {
                        const offset = pair.start + index;
                        const groundZ = Number.isFinite(ground[offset]?.height) ? ground[offset].height : 0;
                        const surfaceZ = Number.isFinite(surfaces[offset]?.height) ? surfaces[offset].height : groundZ;
                        points.push({ t: index / (pair.count - 1), groundZ, surfaceZ: Math.max(groundZ, surfaceZ) });
                    }
                    updated.set(`${pair.a.id}-${pair.b.id}`, { points, xA: pair.a.x, yA: pair.a.y, xB: pair.b.x, yB: pair.b.y });
                    if (Math.hypot(this.nodes[pair.a.id - 1].x - pair.a.x, this.nodes[pair.a.id - 1].y - pair.a.y) < 3) {
                        const node = this.nodes[pair.a.id - 1], altitude = points[0].groundZ + RADIO_ANTENNA_HEIGHT_M;
                        node.vz = (altitude - node.z) / sampleDt;
                        node.z = altitude;
                        this.nodeGroundHeights[pair.a.id] = points[0].groundZ;
                    }
                    if (Math.hypot(this.nodes[pair.b.id - 1].x - pair.b.x, this.nodes[pair.b.id - 1].y - pair.b.y) < 3) {
                        const node = this.nodes[pair.b.id - 1], altitude = points.at(-1).groundZ + RADIO_ANTENNA_HEIGHT_M;
                        node.vz = (altitude - node.z) / sampleDt;
                        node.z = altitude;
                        this.nodeGroundHeights[pair.b.id] = points.at(-1).groundZ;
                    }
                }
                this.radioPathProfiles = updated;
                this.lastGroundSampleAt = sampleTime;
                viewer.scene.requestRender();
            } catch (error) {
                console.warn('Cesium terrain/building radio profiles could not be sampled.', error);
            } finally {
                this.radioProfilePromise = null;
            }
        })();
        await this.radioProfilePromise;
    }

    analyzeCesiumRadioPath(nodeA, nodeB, _antennaHeight, wavelength) {
        const key = nodeA.id < nodeB.id ? `${nodeA.id}-${nodeB.id}` : `${nodeB.id}-${nodeA.id}`;
        const stored = this.radioPathProfiles.get(key);
        const forward = nodeA.id < nodeB.id;
        const dx = nodeB.x - nodeA.x, dy = nodeB.y - nodeA.y;
        const horizontalDistance = Math.hypot(dx, dy);
        const distance3D = Math.max(0.1, Math.hypot(horizontalDistance, (nodeB.z || 0) - (nodeA.z || 0)));
        let isLOS = true, diffractionLossDb = 0, obstructionPoint = null;
        let elevationA = (nodeA.z || 0) - RADIO_ANTENNA_HEIGHT_M;
        let elevationB = (nodeB.z || 0) - RADIO_ANTENNA_HEIGHT_M;
        let worstV = -Infinity;
        const profileMatches = stored && Math.hypot(stored.xA - (forward ? nodeA.x : nodeB.x), stored.yA - (forward ? nodeA.y : nodeB.y)) < 3
            && Math.hypot(stored.xB - (forward ? nodeB.x : nodeA.x), stored.yB - (forward ? nodeB.y : nodeA.y)) < 3;
        const profile = profileMatches && horizontalDistance >= 1
            ? (forward ? stored.points : [...stored.points].reverse().map(point => ({ ...point, t: 1 - point.t })))
            : null;
        if (profile?.length) {
            elevationA = profile[0].groundZ;
            elevationB = profile[profile.length - 1].groundZ;
            for (let index = 1; index < profile.length - 1; index++) {
                const point = profile[index], t = point.t;
                const rayZ = nodeA.z + t * (nodeB.z - nodeA.z);
                const clearance = rayZ - point.surfaceZ;
                if (clearance < 0) isLOS = false;
                const d1 = Math.max(0.5, horizontalDistance * t);
                const d2 = Math.max(0.5, horizontalDistance * (1 - t));
                const fresnel60 = 0.6 * Math.sqrt(Math.max(0, wavelength * d1 * d2 / horizontalDistance));
                const intrusion = fresnel60 - clearance;
                const v = intrusion * Math.sqrt((2 / wavelength) * (1 / d1 + 1 / d2));
                if (v > worstV) {
                    worstV = v;
                    if (intrusion > 0) {
                        obstructionPoint = {
                            x: nodeA.x + t * (nodeB.x - nodeA.x),
                            y: nodeA.y + t * (nodeB.y - nodeA.y),
                            terrainZ: point.surfaceZ,
                            d1, d2,
                            building: point.surfaceZ - point.groundZ > 2 ? 'Cesium OSM 3D building' : null
                        };
                    }
                }
            }
            if (worstV > -0.78) {
                diffractionLossDb = Math.max(0, Math.min(45, 6.9 + 20 * Math.log10(Math.sqrt((worstV - 0.1) ** 2 + 1) + worstV - 0.1)));
            }
        }
        return {
            isLOS, dist3D: distance3D, elevationA, elevationB,
            diffractionLossDb, foliageLossDb: 0, totalTerrainLossDb: diffractionLossDb,
            obstructionPoint, obstructingBuilding: obstructionPoint?.building || null
        };
    }

    setMapLocation(locationId) {
        const location = MAP_LOCATIONS[locationId];
        if (!location) return;
        this.mapLocation = location;
        this.nodeGroundHeights = {};
        this.radioPathProfiles.clear();
        this.nodes.forEach(node => { node.z = RADIO_ANTENNA_HEIGHT_M; node.vz = 0; });
        document.getElementById('hud-terrain-val').textContent = location.name;
        if (this.cesiumViewer && this.isCesiumVisible) {
            this.flyCesiumHome();
            if (this.cesiumTerrainProvider) this.sampleTacticalNodeHeights(this.cesiumTerrainProvider);
        }
    }

    addCesiumTacticalOverlay() {
        const C = window.Cesium;
        this.cesiumDataSource = new C.CustomDataSource('OCTAGON tactical nodes and radio links');
        this.cesiumViewer.dataSources.add(this.cesiumDataSource);
        for (const node of this.nodes) {
            this.cesiumDataSource.entities.add({
                id: `node-${node.id}`, name: `N${node.id} ${node.role || ''}`,
                position: new C.CallbackProperty(() => this.localToCesium(node.x, node.y, node.z), false),
                point: { pixelSize: node.id === this.selectedNodeId ? 14 : 10, color: C.Color.fromCssColorString(node.color), outlineColor: C.Color.WHITE, outlineWidth: 2, heightReference: C.HeightReference.NONE },
                label: { text: `N${node.id}`, font: 'bold 13px sans-serif', fillColor: C.Color.WHITE, outlineColor: C.Color.BLACK, outlineWidth: 3, style: C.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new C.Cartesian2(0, -18), disableDepthTestDistance: Number.POSITIVE_INFINITY }
            });
        }
        for (let i = 0; i < this.nodes.length; i++) {
            for (let j = i + 1; j < this.nodes.length; j++) {
                const nodeA = this.nodes[i], nodeB = this.nodes[j];
                const key = `${nodeA.id}-${nodeB.id}`;
                const isNearestLink = new C.CallbackProperty(() => this.nearestNodeLinkKeys.has(key), false);
                const linkPositions = new C.CallbackProperty(() => [
                    this.localToCesium(nodeA.x, nodeA.y, nodeA.z),
                    this.localToCesium(nodeB.x, nodeB.y, nodeB.z)
                ], false);
                const midpoint = new C.CallbackProperty(() => C.Cartesian3.midpoint(
                    this.localToCesium(nodeA.x, nodeA.y, nodeA.z),
                    this.localToCesium(nodeB.x, nodeB.y, nodeB.z),
                    new C.Cartesian3()
                ), false);
                const distanceLabel = new C.CallbackProperty(() => {
                    const distance = Math.hypot(nodeB.x - nodeA.x, nodeB.y - nodeA.y, nodeB.z - nodeA.z);
                    return `${distance.toFixed(1)} m`;
                }, false);
                this.cesiumDataSource.entities.add({
                    id: `link-${key}`,
                    polyline: {
                        show: isNearestLink,
                        positions: linkPositions,
                        width: 3,
                        material: new C.ColorMaterialProperty(new C.CallbackProperty(() => {
                            const link = this.latestMatrix?.[i]?.[j];
                            return link?.isLOS ? C.Color.LIME.withAlpha(0.8) : C.Color.CRIMSON.withAlpha(0.85);
                        }, false))
                    }
                });
                this.cesiumDataSource.entities.add({
                    id: `link-distance-${key}`,
                    position: midpoint,
                    label: {
                        show: isNearestLink,
                        text: distanceLabel,
                        font: 'bold 12px sans-serif',
                        fillColor: C.Color.WHITE,
                        outlineColor: C.Color.BLACK,
                        outlineWidth: 3,
                        style: C.LabelStyle.FILL_AND_OUTLINE,
                        showBackground: true,
                        backgroundColor: C.Color.BLACK.withAlpha(0.68),
                        pixelOffset: new C.Cartesian2(0, -8),
                        disableDepthTestDistance: Number.POSITIVE_INFINITY
                    }
                });
            }
        }
    }

    setupCesiumNodeDrag() {
        const C = window.Cesium;
        const scene = this.cesiumViewer.scene;
        const cameraController = scene.screenSpaceCameraController;
        const handler = new C.ScreenSpaceEventHandler(scene.canvas);
        this.cesiumInputHandler = handler;
        const setCameraInputLocked = (locked) => {
            if (locked) {
                this.cesiumCameraInputState = {
                    enableInputs: cameraController.enableInputs,
                    enableRotate: cameraController.enableRotate,
                    enableTranslate: cameraController.enableTranslate,
                    enableTilt: cameraController.enableTilt,
                    enableLook: cameraController.enableLook,
                    enableZoom: cameraController.enableZoom
                };
                cameraController.enableInputs = false;
                cameraController.enableRotate = false;
                cameraController.enableTranslate = false;
                cameraController.enableTilt = false;
                cameraController.enableLook = false;
                cameraController.enableZoom = false;
                return;
            }
            const state = this.cesiumCameraInputState;
            if (!state) return;
            Object.assign(cameraController, state);
            this.cesiumCameraInputState = null;
        };
        const nodeFromScreenPosition = (screenPosition) => {
            const picked = scene.pick(screenPosition);
            const id = picked?.id?.id || picked?.primitive?.id;
            if (typeof id !== 'string' || !id.startsWith('node-')) return null;
            return this.nodes.find(node => `node-${node.id}` === id) || null;
        };
        const moveNodeToScreenPosition = (screenPosition, now) => {
            if (!this.draggedNode) return;
            const ray = this.cesiumViewer.camera.getPickRay(screenPosition);
            const point = ray && scene.globe.pick(ray, scene);
            if (!point) return;
            const cartographic = C.Cartographic.fromCartesian(point);
            const location = this.mapLocation;
            const x = C.Math.toDegrees(cartographic.longitude) - location.lon;
            const y = C.Math.toDegrees(cartographic.latitude) - location.lat;
            const worldX = x * 111320 * Math.cos(location.lat * Math.PI / 180);
            const worldY = y * 111320;
            const dt = (now - this.lastDragTime) / 1000;
            const previousAltitude = this.draggedNode.z;
            if (dt > 0.015) {
                this.draggedNode.vx = (worldX - this.lastDragWorldPos.x) / dt;
                this.draggedNode.vy = (worldY - this.lastDragWorldPos.y) / dt;
                this.lastDragWorldPos = { x: worldX, y: worldY };
                this.lastDragTime = now;
            }
            this.draggedNode.x = Math.round(worldX * 10) / 10;
            this.draggedNode.y = Math.round(worldY * 10) / 10;
            this.draggedNode.z = parseFloat((cartographic.height + RADIO_ANTENNA_HEIGHT_M).toFixed(1));
            this.draggedNode.vz = dt > 0.015 ? (this.draggedNode.z - previousAltitude) / dt : 0;
            this.nodeGroundHeights[this.draggedNode.id] = cartographic.height;
            this.cesiumViewer.scene.requestRender();
            this.updateTelemetryCard();
        };
        handler.setInputAction((movement) => {
            const node = nodeFromScreenPosition(movement.position);
            if (!node) return;
            this.draggedNode = node;
            this.isDraggingNode = true;
            this.selectedNodeId = node.id;
            this.lastDragTime = performance.now();
            this.lastDragWorldPos = { x: node.x, y: node.y };
            setCameraInputLocked(true);
            this.updateTelemetryCard();
        }, C.ScreenSpaceEventType.LEFT_DOWN);
        handler.setInputAction((movement) => {
            if (this.draggedNode) moveNodeToScreenPosition(movement.endPosition, performance.now());
        }, C.ScreenSpaceEventType.MOUSE_MOVE);
        handler.setInputAction(() => {
            if (!this.draggedNode) return;
            this.draggedNode.vx = 0;
            this.draggedNode.vy = 0;
            this.draggedNode.vz = 0;
            this.draggedNode = null;
            this.isDraggingNode = false;
            setCameraInputLocked(false);
            this.updateTelemetryCard();
        }, C.ScreenSpaceEventType.LEFT_UP);
    }

    updateScaleBar() {
        const barElem = document.getElementById('scale-bar-line');
        const labelElem = document.getElementById('scale-bar-label');
        if (!barElem || !labelElem) return;
        const barPixels = 120;
        let groundWidthMeters = this.scaleMeters;
        const viewer = this.cesiumViewer;
        if (viewer) {
            const C = window.Cesium, scene = viewer.scene;
            const y = Math.round(scene.canvas.clientHeight / 2);
            const x0 = Math.round((scene.canvas.clientWidth - barPixels) / 2);
            const p0 = scene.globe.pick(viewer.camera.getPickRay(new C.Cartesian2(x0, y)), scene);
            const p1 = scene.globe.pick(viewer.camera.getPickRay(new C.Cartesian2(x0 + barPixels, y)), scene);
            if (p0 && p1) groundWidthMeters = C.Cartesian3.distance(p0, p1);
        }
        const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
        const chosen = steps.reduce((best, value) => Math.abs(value - groundWidthMeters) < Math.abs(best - groundWidthMeters) ? value : best, steps[0]);
        barElem.style.width = `${barPixels}px`;
        labelElem.textContent = `${chosen} m`;
    }

    updateHUD() {
        const hudPan = document.getElementById('hud-pan-val');
        if (hudPan) hudPan.textContent = `${this.mapLocation.lat.toFixed(5)}, ${this.mapLocation.lon.toFixed(5)}`;
    }

    updateTelemetryCard(updateLinkSummary = true) {
        const selNode = this.nodes.find(n => n.id === this.selectedNodeId) || this.nodes[0];
        document.getElementById('selected-node-badge-text').textContent = `NODE ${selNode.id}`;
        document.getElementById('sel-node-color-badge').textContent = selNode.id;
        document.getElementById('sel-node-color-badge').style.background = selNode.color;
        document.getElementById('sel-node-name').textContent = selNode.name;
        document.getElementById('sel-node-role').textContent = selNode.role;
        document.getElementById('sel-node-x').textContent = `${selNode.x.toFixed(1)} m`;
        document.getElementById('sel-node-y').textContent = `${selNode.y.toFixed(1)} m`;
        document.getElementById('sel-node-elev').textContent = `${selNode.z.toFixed(1)} m`;

        const speed = Math.hypot(selNode.vx, selNode.vy);
        document.getElementById('sel-node-vel').textContent = `${speed.toFixed(1)} m/s`;

        // Update links list in sidebar
        const listContainer = document.getElementById('links-summary-list');
        const losSummary = document.getElementById('los-status-summary');
        if (updateLinkSummary && listContainer && this.latestMatrix.length > 0) {
            const row = this.latestMatrix[selNode.id - 1] || [];
            let html = '';
            let losCount = 0, nlosCount = 0;

            for (let j = 0; j < 8; j++) {
                if (j === selNode.id - 1) continue;
                const link = row[j];
                if (!link) continue;

                if (link.isLOS) losCount++; else nlosCount++;

                const statusColor = link.isLOS ? 'var(--accent-green)' : 'var(--accent-red)';
                const statusTag = link.isLOS ? 'LOS (직선)' : `NLOS (차폐 +${link.diffractionLossDb}dB)`;
                const targetNode = this.nodes[j];

                html += `
                    <div style="display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,0.05); align-items: center;">
                        <span style="color: ${targetNode.color}; font-weight: bold;">➜ N${j + 1}</span>
                        <span style="color: ${statusColor}; font-weight: 600;">${statusTag}</span>
                        <span style="color: var(--accent-yellow);">${link.pathLoss.toFixed(1)} dB</span>
                        <span style="color: var(--text-secondary);">${link.distance3D.toFixed(0)}m</span>
                    </div>
                `;
            }
            listContainer.innerHTML = html;
            if (losSummary) {
                losSummary.textContent = `LOS: ${losCount} / NLOS: ${nlosCount}`;
                losSummary.style.color = nlosCount > 0 ? 'var(--accent-red)' : 'var(--accent-green)';
            }
        }
    }

    initWebSocket() {
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${proto}//${window.location.host}/ws/client`;
        document.getElementById('server-url-display').textContent = wsUrl;

        this.updateWsIndicator('connecting', 'CONNECTING');

        try {
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                this.wsConnected = true;
                this.updateWsIndicator('connected', 'ONLINE (TX)');
            };

            this.ws.onclose = () => {
                this.wsConnected = false;
                this.updateWsIndicator('disconnected', 'DISCONNECTED');
                setTimeout(() => this.initWebSocket(), 2000);
            };

            this.ws.onerror = () => {
                this.updateWsIndicator('disconnected', 'ERROR');
            };

            this.ws.onmessage = () => {};
        } catch (e) {
            this.updateWsIndicator('disconnected', 'ERROR');
            setTimeout(() => this.initWebSocket(), 2500);
        }
    }

    updateWsIndicator(state, text) {
        const ind = document.getElementById('ws-indicator');
        const txt = document.getElementById('ws-status-text');
        if (ind) ind.className = `status-indicator ${state}`;
        if (txt) txt.textContent = text;
    }

    restartTxLoop() {
        if (this.txTimer) clearInterval(this.txTimer);
        const intervalMs = Math.round(1000 / this.updateRateHz);
        this.txTimer = setInterval(() => this.sendMatrixPayload(), intervalMs);
    }

    updateNearestNodeLinks(nodes) {
        // A per-node nearest-neighbor graph can contain separate components.
        // Kruskal's algorithm gives the globally shortest set of links that
        // connects every node (a minimum spanning tree has n - 1 edges).
        const parent = new Map(nodes.map(node => [node.id, node.id]));
        const find = id => {
            let root = id;
            while (parent.get(root) !== root) root = parent.get(root);
            while (id !== root) {
                const next = parent.get(id);
                parent.set(id, root);
                id = next;
            }
            return root;
        };
        const edges = [];
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const a = nodes[i], b = nodes[j];
                edges.push({ a, b, distance: Math.hypot(b.x - a.x, b.y - a.y, (b.z || 0) - (a.z || 0)) });
            }
        }
        edges.sort((a, b) => a.distance - b.distance);

        const links = new Set();
        for (const { a, b } of edges) {
            const rootA = find(a.id), rootB = find(b.id);
            if (rootA === rootB) continue;
            parent.set(rootA, rootB);
            links.add(`${Math.min(a.id, b.id)}-${Math.max(a.id, b.id)}`);
            if (links.size === nodes.length - 1) break;
        }
        this.nearestNodeLinkKeys = links;
    }

    sendMatrixPayload() {
        const dt = 1.0 / this.updateRateHz;
        this.refreshCesiumRadioProfiles();

        // Calculate wireless state and geographic telemetry from one validated snapshot.
        const nodes = this.createTelemetryNodeSnapshot();
        if (nodes.length !== 8) return;
        this.latestMatrix = this.wireless.computeMatrix(nodes, dt, this.cesiumRadioEnvironment);
        this.updateTelemetryCard(false);
        this.updateNearestNodeLinks(nodes);

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const payload = {
                timestamp: Date.now(),
                scale_m: this.scaleMeters,
                terrain_preset: 'cesium_world',
                carrier_freq_ghz: parseFloat((this.wireless.frequencyHz / 1e9).toFixed(2)),
                path_loss_exp: this.wireless.pathLossExponent,
                shadowing_sigma_db: this.wireless.shadowingSigma,
                tx_power_dbm: this.wireless.txPowerDbm,
                nodes,
                matrix: this.latestMatrix
            };
            this.ws.send(JSON.stringify(payload));
            this.frameCount++;
        }

        const now = performance.now();
        if (now - this.lastFpsCalcTime >= 1000) {
            this.txFps = ((this.frameCount * 1000) / (now - this.lastFpsCalcTime)).toFixed(1);
            const fpsElem = document.getElementById('tx-fps-val');
            if (fpsElem) fpsElem.textContent = this.txFps;
            this.frameCount = 0;
            this.lastFpsCalcTime = now;
        }
    }

    updatePatrol(dt) {
        if (!this.isPatrolling) return;
        const now = performance.now();
        const maxInfantrySpeed = 1.5; // m/s, representative upper walking pace
        const movementRadius = Math.max(2, this.scaleMeters * 0.38);
        for (const node of this.nodes) {
            if (this.isDraggingNode && this.draggedNode?.id === node.id) continue;
            if (!node.patrolChangeAt || now >= node.patrolChangeAt) {
                node.patrolHeading = Math.random() * Math.PI * 2;
                node.patrolSpeed = 0.2 + Math.random() * (maxInfantrySpeed - 0.2);
                node.patrolChangeAt = now + 900 + Math.random() * 2100;
            }
            let vx = Math.cos(node.patrolHeading) * node.patrolSpeed;
            let vy = Math.sin(node.patrolHeading) * node.patrolSpeed;
            let nextX = node.x + vx * dt;
            let nextY = node.y + vy * dt;
            if (Math.hypot(nextX, nextY) > movementRadius) {
                // Turn back toward the current map center, with a random heading offset.
                node.patrolHeading = Math.atan2(-node.y, -node.x) + (Math.random() - 0.5) * Math.PI / 2;
                vx = Math.cos(node.patrolHeading) * node.patrolSpeed;
                vy = Math.sin(node.patrolHeading) * node.patrolSpeed;
                nextX = node.x + vx * dt;
                nextY = node.y + vy * dt;
                if (Math.hypot(nextX, nextY) > movementRadius) {
                    const scale = movementRadius / Math.max(0.001, Math.hypot(nextX, nextY));
                    nextX *= scale;
                    nextY *= scale;
                }
            }
            node.vx = dt > 0 ? (nextX - node.x) / dt : 0;
            node.vy = dt > 0 ? (nextY - node.y) / dt : 0;
            // Keep sub-decimeter movement so telemetry-derived velocity remains smooth.
            node.x = nextX;
            node.y = nextY;
            node.z = (this.nodeGroundHeights[node.id] ?? 0) + RADIO_ANTENNA_HEIGHT_M;
        }
    }

    renderLoop(timestamp) {
        const dt = Math.min((timestamp - this.lastAnimTime) / 1000, 0.1);
        this.lastAnimTime = timestamp;

        this.updatePatrol(dt);

        requestAnimationFrame((t) => this.renderLoop(t));
    }


}

// DOM 로드 시 실행
window.addEventListener('DOMContentLoaded', () => {
    window.app = new OctagonApp();
});
