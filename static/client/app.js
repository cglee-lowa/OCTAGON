/**
 * OCTAGON MANET Web App Main Controller & Canvas Renderer
 * Integrated with Munjeong Station Tactical 3D Terrain & RF Engine
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
    { code: 'Alpha', role: '문정역 거점본부 (GW)' },
    { code: 'Bravo', role: '테라타워 1차 관측조' },
    { code: 'Charlie', role: '엠스테이트 통신중계' },
    { code: 'Delta', role: '송파대로 공중 UAV' },
    { code: 'Echo', role: '서울동부지법 전방정찰' },
    { code: 'Foxtrot', role: '동부지검 지하기동조' },
    { code: 'Golf', role: '탄천 수변 UGV초계' },
    { code: 'Hotel', role: '컬처밸리 광장 방호조' }
];

class OctagonApp {
    constructor() {
        this.canvas = document.getElementById('viewport-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.container = document.getElementById('canvas-container');

        // View Mode: '2d' or '3d'
        this.viewMode = '2d';

        // 2D Viewport Transform (Pan & Zoom)
        this.scaleMeters = 50;
        this.pixelsPerMeter = 4.5;
        this.panX = 0;
        this.panY = 0;

        // 3D Camera State
        this.camera3D = {
            pitch: 38 * Math.PI / 180,  // 경사각
            yaw: -32 * Math.PI / 180,   // 방위각
            zoom: 1.05,
            cx: 20,                     // 주시점 X (문정역 중심)
            cy: 0                       // 주시점 Y
        };

        // Tactical Terrain Engine (Munjeong station default)
        this.terrain = new TacticalTerrain('munjeong');
        this.terrain.loadRegionalData().then(() => {
            const status = document.getElementById('terrain-data-status');
            if (!status) return;
            status.textContent = this.terrain.mapLoadStatus === 'loaded'
                ? `OSM buildings ${this.terrain.osmBuildingCount.toLocaleString()} · DEM loaded`
                : this.terrain.mapLoadStatus === 'partial' ? 'Map data partially loaded' : 'Built-in terrain fallback';
        });
        this.showContours = true;
        this.showBuildings = true;

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
        this.resizeCanvas();
        this.applyPreset('munjeong');
        this.initWebSocket();
        this.restartTxLoop();

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
                z: 24, // Elevation in meters
                vx: 0,
                vy: 0,
                radiusPx: 17,
                pulsePhase: Math.random() * Math.PI * 2
            });
        }
    }

    applyPreset(presetName) {
        if (presetName === 'munjeong') {
            // 문정역 일대 실제 지형 및 건물 주변 전술 배치
            // N1: 문정역 역사 앞 지휘소
            this.nodes[0].x = -15; this.nodes[0].y = -10;
            // N2: 테라타워 1차 전면 관측지점
            this.nodes[1].x = 30; this.nodes[1].y = 90;
            // N3: 엠스테이트 남측 중계기점
            this.nodes[2].x = 35; this.nodes[2].y = -85;
            // N4: 송파대로 상공/대로변 UAV 릴레이 (고도 높음)
            this.nodes[3].x = -15; this.nodes[3].y = 110;
            // N5: 서울동부지방법원 청사 광장 정찰
            this.nodes[4].x = 150; this.nodes[4].y = 80;
            // N6: 서울동부지검 후면 통신조
            this.nodes[5].x = 160; this.nodes[5].y = -80;
            // N7: 탄천 수변공원 서측 초계 UGV
            this.nodes[6].x = -175; this.nodes[6].y = 10;
            // N8: 문정 컬처밸리 선큰 보행광장
            this.nodes[7].x = 80; this.nodes[7].y = 5;

            for (let i = 0; i < 8; i++) {
                this.nodes[i].vx = 0;
                this.nodes[i].vy = 0;
                this.nodes[i].z = this.terrain.getElevation(this.nodes[i].x, this.nodes[i].y) + 2.0;
            }
        } else {
            const radius = this.scaleMeters * 0.8;
            switch (presetName) {
                case 'octagon':
                    for (let i = 0; i < 8; i++) {
                        const angle = (i * 2 * Math.PI) / 8 - Math.PI / 2;
                        this.nodes[i].x = Math.round(radius * Math.cos(angle) * 10) / 10;
                        this.nodes[i].y = Math.round(radius * Math.sin(angle) * 10) / 10;
                        this.nodes[i].vx = 0;
                        this.nodes[i].vy = 0;
                        this.nodes[i].z = this.terrain.getElevation(this.nodes[i].x, this.nodes[i].y) + 2.0;
                    }
                    break;
                case 'grid':
                    const dx = radius * 0.6;
                    const dy = radius * 0.6;
                    for (let i = 0; i < 8; i++) {
                        const row = Math.floor(i / 4);
                        const col = i % 4;
                        this.nodes[i].x = (col - 1.5) * dx;
                        this.nodes[i].y = (row - 0.5) * dy;
                        this.nodes[i].vx = 0;
                        this.nodes[i].vy = 0;
                        this.nodes[i].z = this.terrain.getElevation(this.nodes[i].x, this.nodes[i].y) + 2.0;
                    }
                    break;
                case 'line':
                    const step = (radius * 2.2) / 7;
                    for (let i = 0; i < 8; i++) {
                        this.nodes[i].x = (i - 3.5) * step;
                        this.nodes[i].y = 0;
                        this.nodes[i].vx = 0;
                        this.nodes[i].vy = 0;
                        this.nodes[i].z = this.terrain.getElevation(this.nodes[i].x, this.nodes[i].y) + 2.0;
                    }
                    break;
                case 'cluster':
                    const c1 = [-radius * 0.6, 0];
                    const c2 = [radius * 0.6, 0];
                    for (let i = 0; i < 4; i++) {
                        const a = (i * 2 * Math.PI) / 4;
                        this.nodes[i].x = c1[0] + radius * 0.3 * Math.cos(a);
                        this.nodes[i].y = c1[1] + radius * 0.3 * Math.sin(a);
                        this.nodes[i].vx = 0;
                        this.nodes[i].vy = 0;
                        this.nodes[i].z = this.terrain.getElevation(this.nodes[i].x, this.nodes[i].y) + 2.0;
                    }
                    for (let i = 4; i < 8; i++) {
                        const a = ((i - 4) * 2 * Math.PI) / 4;
                        this.nodes[i].x = c2[0] + radius * 0.3 * Math.cos(a);
                        this.nodes[i].y = c2[1] + radius * 0.3 * Math.sin(a);
                        this.nodes[i].vx = 0;
                        this.nodes[i].vy = 0;
                        this.nodes[i].z = this.terrain.getElevation(this.nodes[i].x, this.nodes[i].y) + 2.0;
                    }
                    break;
            }
        }
        this.updateTelemetryCard();
    }

    worldToScreen(wx, wy) {
        const cx = this.canvas.width / 2 + this.panX;
        const cy = this.canvas.height / 2 + this.panY;
        return {
            x: cx + wx * this.pixelsPerMeter,
            y: cy - wy * this.pixelsPerMeter
        };
    }

    screenToWorld(sx, sy) {
        const cx = this.canvas.width / 2 + this.panX;
        const cy = this.canvas.height / 2 + this.panY;
        return {
            x: (sx - cx) / this.pixelsPerMeter,
            y: -(sy - cy) / this.pixelsPerMeter
        };
    }

    setupEventListeners() {
        window.addEventListener('resize', () => this.resizeCanvas());

        // View Mode 2D / 3D Toggle
        const btn2D = document.getElementById('btn-view-2d');
        const btn3D = document.getElementById('btn-view-3d');
        btn2D.addEventListener('click', () => {
            this.viewMode = '2d';
            btn2D.classList.add('active');
            btn2D.style.background = 'var(--accent-cyan)';
            btn2D.style.color = '#000';
            btn3D.classList.remove('active');
            btn3D.style.background = 'transparent';
            btn3D.style.color = 'var(--text-secondary)';
            document.getElementById('hud-view-val').textContent = '2D 전술맵';
        });

        btn3D.addEventListener('click', () => {
            this.viewMode = '3d';
            btn3D.classList.add('active');
            btn3D.style.background = 'var(--accent-cyan)';
            btn3D.style.color = '#000';
            btn2D.classList.remove('active');
            btn2D.style.background = 'transparent';
            btn2D.style.color = 'var(--text-secondary)';
            document.getElementById('hud-view-val').textContent = '3D 입체뷰';
        });

        // Terrain Preset Selector
        const selectPreset = document.getElementById('select-terrain-preset');
        selectPreset.addEventListener('change', (e) => {
            this.terrain.loadPreset(e.target.value);
            for (const n of this.nodes) {
                n.z = this.terrain.getElevation(n.x, n.y) + 2.0;
            }
            const labelMap = {
                'munjeong': '문정역 실지형',
                'ridge_valley': '산악 협곡 고지',
                'flat': '평지'
            };
            document.getElementById('hud-terrain-val').textContent = labelMap[e.target.value] || e.target.value;
            this.updateTelemetryCard();
        });

        // Contours and Buildings toggle
        const btnContours = document.getElementById('btn-toggle-contours');
        btnContours.addEventListener('click', () => {
            this.showContours = !this.showContours;
            btnContours.querySelector('span').textContent = this.showContours ? '등고선 ON' : '등고선 OFF';
        });

        const btnBuildings = document.getElementById('btn-toggle-buildings');
        btnBuildings.addEventListener('click', () => {
            this.showBuildings = !this.showBuildings;
            btnBuildings.querySelector('span').textContent = this.showBuildings ? '건물 차폐 ON' : '건물 차폐 OFF';
        });

        // Mouse Drag & Pan & Zoom
        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        window.addEventListener('mousemove', (e) => this.onMouseMove(e));
        window.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

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
        document.getElementById('preset-munjeong').addEventListener('click', () => this.applyPreset('munjeong'));
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
        const targetGridPx = 150;
        this.pixelsPerMeter = targetGridPx / meters;
        this.updateScaleBar();
        this.updateHUD();
    }

    resetView() {
        this.panX = 0;
        this.panY = 0;
        this.camera3D.pitch = 38 * Math.PI / 180;
        this.camera3D.yaw = -32 * Math.PI / 180;
        this.camera3D.zoom = 1.05;
        this.camera3D.cx = 20;
        this.camera3D.cy = 0;
        this.setScale(this.scaleMeters);
    }

    zoomAtCenter(factor) {
        if (this.viewMode === '3d') {
            this.camera3D.zoom = Math.min(Math.max(this.camera3D.zoom * factor, 0.4), 3.0);
        } else {
            const cx = this.canvas.width / 2;
            const cy = this.canvas.height / 2;
            this.zoomAt(cx, cy, factor);
        }
    }

    zoomAt(screenX, screenY, factor) {
        const oldPpm = this.pixelsPerMeter;
        const newPpm = Math.min(Math.max(oldPpm * factor, 0.2), 50.0);
        if (oldPpm === newPpm) return;

        const worldPos = this.screenToWorld(screenX, screenY);
        this.pixelsPerMeter = newPpm;
        const newScreenPos = this.worldToScreen(worldPos.x, worldPos.y);

        this.panX += (screenX - newScreenPos.x);
        this.panY += (screenY - newScreenPos.y);

        this.updateScaleBar();
        this.updateHUD();
    }

    resizeCanvas() {
        const rect = this.container.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.updateScaleBar();
    }

    onMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        this.lastMousePos = { x: mx, y: my };

        if (this.viewMode === '3d') {
            if (e.button === 0) {
                this.isOrbiting3D = true;
            } else {
                this.isPanning = true;
            }
            return;
        }

        // 2D Mode Node Selection & Drag
        let clickedNode = null;
        for (let i = this.nodes.length - 1; i >= 0; i--) {
            const n = this.nodes[i];
            const sp = this.worldToScreen(n.x, n.y);
            const dist = Math.hypot(mx - sp.x, my - sp.y);
            if (dist <= n.radiusPx + 6) {
                clickedNode = n;
                break;
            }
        }

        if (clickedNode && e.button === 0) {
            this.isDraggingNode = true;
            this.draggedNode = clickedNode;
            this.selectedNodeId = clickedNode.id;
            const wPos = this.screenToWorld(mx, my);
            this.lastDragWorldPos = { x: wPos.x, y: wPos.y };
            this.lastDragTime = performance.now();
            this.updateTelemetryCard();
        } else {
            this.isPanning = true;
        }
    }

    onMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const dx = mx - this.lastMousePos.x;
        const dy = my - this.lastMousePos.y;
        this.lastMousePos = { x: mx, y: my };

        if (this.viewMode === '3d') {
            if (this.isOrbiting3D) {
                this.camera3D.yaw += dx * 0.008;
                this.camera3D.pitch = Math.min(Math.max(this.camera3D.pitch + dy * 0.008, 0.1), Math.PI / 2.1);
                this.updateHUD();
            } else if (this.isPanning) {
                this.camera3D.cx -= dx * 0.5;
                this.camera3D.cy += dy * 0.5;
                this.updateHUD();
            }
            return;
        }

        // 2D Mode Dragging
        if (this.isDraggingNode && this.draggedNode) {
            const wPos = this.screenToWorld(mx, my);
            const now = performance.now();
            const dtSec = (now - this.lastDragTime) / 1000.0;

            if (dtSec > 0.015) {
                this.draggedNode.vx = (wPos.x - this.lastDragWorldPos.x) / dtSec;
                this.draggedNode.vy = (wPos.y - this.lastDragWorldPos.y) / dtSec;
                this.lastDragWorldPos = { x: wPos.x, y: wPos.y };
                this.lastDragTime = now;
            }

            this.draggedNode.x = Math.round(wPos.x * 10) / 10;
            this.draggedNode.y = Math.round(wPos.y * 10) / 10;
            this.draggedNode.z = parseFloat((this.terrain.getElevation(this.draggedNode.x, this.draggedNode.y) + 2.0).toFixed(1));

            this.updateTelemetryCard();
        } else if (this.isPanning) {
            this.panX += dx;
            this.panY += dy;
            this.updateHUD();
        }
    }

    onMouseUp() {
        if (this.isDraggingNode && this.draggedNode) {
            this.draggedNode.vx = 0;
            this.draggedNode.vy = 0;
            this.isDraggingNode = false;
            this.draggedNode = null;
            this.updateTelemetryCard();
        }
        this.isPanning = false;
        this.isOrbiting3D = false;
    }

    onWheel(e) {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const zoomFactor = e.deltaY < 0 ? 1.12 : (1 / 1.12);

        if (this.viewMode === '3d') {
            this.camera3D.zoom = Math.min(Math.max(this.camera3D.zoom * zoomFactor, 0.4), 3.0);
        } else {
            this.zoomAt(mx, my, zoomFactor);
        }
    }

    updateScaleBar() {
        const barElem = document.getElementById('scale-bar-line');
        const labelElem = document.getElementById('scale-bar-label');
        if (!barElem || !labelElem) return;

        const targetPx = 120;
        const rawMeters = targetPx / this.pixelsPerMeter;
        const niceSteps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
        let chosenMeters = niceSteps[0];
        for (const step of niceSteps) {
            if (Math.abs(step - rawMeters) < Math.abs(chosenMeters - rawMeters)) {
                chosenMeters = step;
            }
        }

        const barPx = chosenMeters * this.pixelsPerMeter;
        barElem.style.width = `${barPx}px`;
        labelElem.textContent = `${chosenMeters} m`;
    }

    updateHUD() {
        const hudPan = document.getElementById('hud-pan-val');
        if (hudPan) {
            if (this.viewMode === '3d') {
                const degPitch = Math.round(this.camera3D.pitch * 180 / Math.PI);
                const degYaw = Math.round(this.camera3D.yaw * 180 / Math.PI);
                hudPan.textContent = `Pitch: ${degPitch}° / Yaw: ${degYaw}°`;
            } else {
                const worldPan = this.screenToWorld(this.canvas.width / 2, this.canvas.height / 2);
                hudPan.textContent = `(${Math.round(worldPan.x)}m, ${Math.round(worldPan.y)}m)`;
            }
        }
    }

    updateTelemetryCard() {
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
        if (listContainer && this.latestMatrix.length > 0) {
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

    sendMatrixPayload() {
        const dt = 1.0 / this.updateRateHz;
        // Compute matrix with 3D terrain integration
        this.latestMatrix = this.wireless.computeMatrix(this.nodes, dt, this.terrain);

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const payload = {
                timestamp: Date.now(),
                scale_m: this.scaleMeters,
                terrain_preset: this.terrain.preset,
                carrier_freq_ghz: parseFloat((this.wireless.frequencyHz / 1e9).toFixed(2)),
                path_loss_exp: this.wireless.pathLossExponent,
                shadowing_sigma_db: this.wireless.shadowingSigma,
                tx_power_dbm: this.wireless.txPowerDbm,
                nodes: this.nodes.map(n => ({
                    id: n.id,
                    name: n.name,
                    role: n.role,
                    x: n.x,
                    y: n.y,
                    z: n.z,
                    vx: parseFloat(n.vx.toFixed(2)),
                    vy: parseFloat(n.vy.toFixed(2))
                })),
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
        this.patrolAngle += dt * 0.4;

        for (let i = 0; i < 8; i++) {
            if (this.isDraggingNode && this.draggedNode && this.draggedNode.id === this.nodes[i].id) {
                continue;
            }
            const offset = (i * 2 * Math.PI) / 8;
            const r = this.scaleMeters * (0.4 + (i % 3) * 0.25);
            const speed = 0.4 + (i % 2) * 0.2;
            const a = this.patrolAngle * speed + offset;

            const nextX = r * Math.cos(a);
            const nextY = r * Math.sin(a * 1.2);

            this.nodes[i].vx = (nextX - this.nodes[i].x) / dt;
            this.nodes[i].vy = (nextY - this.nodes[i].y) / dt;
            this.nodes[i].x = Math.round(nextX * 10) / 10;
            this.nodes[i].y = Math.round(nextY * 10) / 10;
            this.nodes[i].z = parseFloat((this.terrain.getElevation(this.nodes[i].x, this.nodes[i].y) + 2.0).toFixed(1));
        }
    }

    renderLoop(timestamp) {
        const dt = Math.min((timestamp - this.lastAnimTime) / 1000, 0.1);
        this.lastAnimTime = timestamp;

        this.updatePatrol(dt);

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.viewMode === '3d') {
            // 3D Isometric / Perspective Tactical View
            this.terrain.render3D(
                this.ctx,
                this.canvas.width,
                this.canvas.height,
                this.camera3D,
                this.nodes,
                this.latestMatrix,
                this.selectedNodeId
            );
        } else {
            // 2D Tactical Map View
            this.drawGrid();
            this.terrain.render2D(
                this.ctx,
                (x, y) => this.worldToScreen(x, y),
                (sx, sy) => this.screenToWorld(sx, sy),
                this.canvas.width,
                this.canvas.height,
                this.pixelsPerMeter,
                this.showContours
            );
            this.drawOriginAxes();
            this.drawWirelessLinks();
            this.drawNodes(timestamp);
        }

        requestAnimationFrame((t) => this.renderLoop(t));
    }

    drawGrid() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        let majorStepM = this.scaleMeters;
        let minorStepM = majorStepM / 5;

        const minorPx = minorStepM * this.pixelsPerMeter;
        const majorPx = majorStepM * this.pixelsPerMeter;

        const centerScreen = this.worldToScreen(0, 0);

        ctx.strokeStyle = 'rgba(20, 32, 48, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        const startX = centerScreen.x % minorPx;
        for (let x = startX; x < w; x += minorPx) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
        }
        const startY = centerScreen.y % minorPx;
        for (let y = startY; y < h; y += minorPx) {
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
        }
        ctx.stroke();

        ctx.strokeStyle = 'rgba(0, 240, 255, 0.15)';
        ctx.lineWidth = 1.2;
        ctx.fillStyle = 'rgba(136, 153, 170, 0.6)';
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.beginPath();
        const majorStartX = centerScreen.x % majorPx;
        for (let x = majorStartX; x < w; x += majorPx) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            const worldX = Math.round(this.screenToWorld(x, 0).x);
            if (Math.abs(worldX) > 0.01) {
                ctx.fillText(`${worldX}m`, x + 4, centerScreen.y - 4);
            }
        }
        const majorStartY = centerScreen.y % majorPx;
        for (let y = majorStartY; y < h; y += majorPx) {
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            const worldY = Math.round(this.screenToWorld(0, y).y);
            if (Math.abs(worldY) > 0.01) {
                ctx.fillText(`${worldY}m`, centerScreen.x + 4, y - 4);
            }
        }
        ctx.stroke();
    }

    drawOriginAxes() {
        const ctx = this.ctx;
        const o = this.worldToScreen(0, 0);

        ctx.strokeStyle = 'rgba(0, 240, 255, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(o.x - 25, o.y); ctx.lineTo(o.x + 25, o.y);
        ctx.moveTo(o.x, o.y - 25); ctx.lineTo(o.x, o.y + 25);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(o.x, o.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 240, 255, 0.2)';
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'rgba(0, 240, 255, 0.7)';
        ctx.font = '10px monospace';
        ctx.fillText('(0,0) 문정역 중앙', o.x + 8, o.y + 14);
    }

    drawWirelessLinks() {
        const ctx = this.ctx;
        if (!this.latestMatrix || this.latestMatrix.length < 8) return;

        for (let i = 0; i < 8; i++) {
            const p1 = this.worldToScreen(this.nodes[i].x, this.nodes[i].y);
            for (let j = i + 1; j < 8; j++) {
                const p2 = this.worldToScreen(this.nodes[j].x, this.nodes[j].y);
                const link = this.latestMatrix[i][j];
                if (!link) continue;

                const isSelectedLink = (this.nodes[i].id === this.selectedNodeId || this.nodes[j].id === this.selectedNodeId);

                ctx.save();
                if (link.isLOS) {
                    // LOS: 녹색/청록색 실선
                    let strokeColor = link.linkQuality >= 70 ? '0, 255, 136' : '255, 183, 3';
                    let alpha = isSelectedLink ? 0.9 : 0.25;
                    ctx.strokeStyle = `rgba(${strokeColor}, ${alpha})`;
                    ctx.lineWidth = isSelectedLink ? 2.5 : 1.2;
                    ctx.beginPath();
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineTo(p2.x, p2.y);
                    ctx.stroke();
                } else {
                    // NLOS (빌딩 또는 지형 차폐): 붉은색 점선 & 회절 손실
                    let alpha = isSelectedLink ? 0.95 : 0.35;
                    ctx.strokeStyle = `rgba(255, 51, 102, ${alpha})`;
                    ctx.lineWidth = isSelectedLink ? 2.5 : 1.2;
                    ctx.setLineDash([5, 5]);
                    ctx.beginPath();
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineTo(p2.x, p2.y);
                    ctx.stroke();

                    // 차폐 장애물 마커 뱃지
                    if (isSelectedLink && link.obstructionPoint) {
                        const obsScreen = this.worldToScreen(link.obstructionPoint.x, link.obstructionPoint.y);
                        ctx.setLineDash([]);
                        ctx.fillStyle = '#ff0055';
                        ctx.beginPath();
                        ctx.arc(obsScreen.x, obsScreen.y, 5, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.fillStyle = '#fff';
                        ctx.font = 'bold 9px monospace';
                        ctx.fillText(`⚔ 차폐 +${link.diffractionLossDb}dB`, obsScreen.x + 8, obsScreen.y + 3);
                    }
                }

                // Selected Link Mid-point Badge
                if (isSelectedLink && link.isConnected) {
                    const midX = (p1.x + p2.x) / 2;
                    const midY = (p1.y + p2.y) / 2;
                    ctx.setLineDash([]);
                    ctx.fillStyle = 'rgba(10, 14, 20, 0.85)';
                    ctx.fillRect(midX - 35, midY - 9, 70, 18);
                    ctx.strokeStyle = link.isLOS ? 'var(--accent-green)' : 'var(--accent-red)';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(midX - 35, midY - 9, 70, 18);

                    ctx.fillStyle = '#fff';
                    ctx.font = '9px "JetBrains Mono", monospace';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    const tag = link.isLOS ? 'LOS' : 'NLOS';
                    ctx.fillText(`${link.distance3D.toFixed(0)}m|${link.pathLoss.toFixed(0)}dB|${tag}`, midX, midY);
                    ctx.textAlign = 'start';
                    ctx.textBaseline = 'alphabetic';
                }
                ctx.restore();
            }
        }
    }

    drawNodes(timestamp) {
        const ctx = this.ctx;

        for (const node of this.nodes) {
            const sp = this.worldToScreen(node.x, node.y);
            const isSelected = node.id === this.selectedNodeId;
            const isDragged = this.isDraggingNode && this.draggedNode && this.draggedNode.id === node.id;

            // 1. 노드 주변 고휘도 전술 펄스
            const pulse = (timestamp * 0.003 + node.pulsePhase) % 1.0;
            const pulseRadius = node.radiusPx + pulse * 25;
            ctx.beginPath();
            ctx.arc(sp.x, sp.y, pulseRadius, 0, Math.PI * 2);
            ctx.strokeStyle = `${node.color}${Math.floor((1.0 - pulse) * 80).toString(16).padStart(2, '0')}`;
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // 2. 선택 노드 강조 링
            if (isSelected) {
                ctx.beginPath();
                ctx.arc(sp.x, sp.y, node.radiusPx + 9, 0, Math.PI * 2);
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2.5;
                ctx.setLineDash([4, 4]);
                ctx.stroke();
                ctx.setLineDash([]);
            }

            // 3. 노드 원체 (지형과 확실하게 대비되도록 고휘도 테두리 및 뚜렷한 배경)
            ctx.beginPath();
            ctx.arc(sp.x, sp.y, node.radiusPx, 0, Math.PI * 2);
            ctx.fillStyle = isDragged ? '#ffffff' : '#0b1320';
            ctx.fill();
            ctx.strokeStyle = node.color;
            ctx.lineWidth = 3.5;
            ctx.stroke();

            // 4. 노드 번호
            ctx.fillStyle = isDragged ? '#000000' : node.color;
            ctx.font = 'bold 13px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(node.id, sp.x, sp.y);

            // 5. 노드 명칭 및 고도 뱃지 (가독성 높은 백드롭)
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.font = 'bold 11px sans-serif';

            // 텍스트 배경 백드롭 (가독성 극대화)
            const labelText = node.name;
            const elevText = `H: ${node.z.toFixed(1)}m (${node.x.toFixed(0)}, ${node.y.toFixed(0)})`;
            ctx.fillStyle = 'rgba(6, 10, 16, 0.85)';
            ctx.fillRect(sp.x - 55, sp.y + node.radiusPx + 3, 110, 26);
            ctx.strokeStyle = 'rgba(0, 240, 255, 0.3)';
            ctx.lineWidth = 1;
            ctx.strokeRect(sp.x - 55, sp.y + node.radiusPx + 3, 110, 26);

            ctx.fillStyle = '#ffffff';
            ctx.fillText(labelText, sp.x, sp.y + node.radiusPx + 5);

            ctx.font = '9px "JetBrains Mono", monospace';
            ctx.fillStyle = 'var(--accent-cyan)';
            ctx.fillText(elevText, sp.x, sp.y + node.radiusPx + 17);

            // 6. 속도 벡터 화살표
            const speed = Math.hypot(node.vx, node.vy);
            if (speed > 0.5) {
                const arrowLen = Math.min(speed * 4, 40);
                const angle = Math.atan2(-node.vy, node.vx);
                const endX = sp.x + arrowLen * Math.cos(angle);
                const endY = sp.y + arrowLen * Math.sin(angle);

                ctx.strokeStyle = 'var(--accent-orange)';
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.moveTo(sp.x, sp.y);
                ctx.lineTo(endX, endY);
                ctx.stroke();

                const headLen = 6;
                ctx.fillStyle = 'var(--accent-orange)';
                ctx.beginPath();
                ctx.moveTo(endX, endY);
                ctx.lineTo(endX - headLen * Math.cos(angle - Math.PI / 6), endY - headLen * Math.sin(angle - Math.PI / 6));
                ctx.lineTo(endX - headLen * Math.cos(angle + Math.PI / 6), endY - headLen * Math.sin(angle + Math.PI / 6));
                ctx.closePath();
                ctx.fill();
            }

            ctx.textAlign = 'start';
            ctx.textBaseline = 'alphabetic';
        }
    }
}

// DOM 로드 시 실행
window.addEventListener('DOMContentLoaded', () => {
    window.app = new OctagonApp();
});
