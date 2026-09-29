/**
 * OCTAGON MANET Web App Main Controller & Canvas Renderer
 */

// Node definition and color palette
const NODE_COLORS = [
    '#00f0ff', // Cyan
    '#00ff88', // Green
    '#ffb703', // Yellow/Amber
    '#ff0055', // Red/Pink
    '#a06cd5', // Purple
    '#3a86ff', // Blue
    '#fb5607', // Orange
    '#06d6a0'  // Teal
];

const NODE_NAMES = [
    { code: 'Alpha', role: 'Squad Leader (GW)' },
    { code: 'Bravo', role: 'Infantry Point' },
    { code: 'Charlie', role: 'Support Gunner' },
    { code: 'Delta', role: 'UAV Relay' },
    { code: 'Echo', role: 'Recon Scout' },
    { code: 'Foxtrot', role: 'Sniper Team' },
    { code: 'Golf', role: 'UGV Vanguard' },
    { code: 'Hotel', role: 'Command Post' }
];

class OctagonApp {
    constructor() {
        this.canvas = document.getElementById('viewport-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.container = document.getElementById('canvas-container');

        // Viewport Transform (Pan & Zoom)
        // World coordinates are in METERS. (0,0) is origin.
        this.scaleMeters = 50; // Active scale unit (e.g. 50m)
        this.pixelsPerMeter = 6.0; // default base zoom
        this.panX = 0; // screen offset in pixels
        this.panY = 0;

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
        this.applyPreset('octagon');
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
                vx: 0,
                vy: 0,
                radiusPx: 16,
                pulsePhase: Math.random() * Math.PI * 2
            });
        }
    }

    applyPreset(presetName) {
        const radius = this.scaleMeters * 0.8;
        switch (presetName) {
            case 'octagon':
                // Regular octagon formation
                for (let i = 0; i < 8; i++) {
                    const angle = (i * 2 * Math.PI) / 8 - Math.PI / 2;
                    this.nodes[i].x = Math.round(radius * Math.cos(angle) * 10) / 10;
                    this.nodes[i].y = Math.round(radius * Math.sin(angle) * 10) / 10;
                    this.nodes[i].vx = 0;
                    this.nodes[i].vy = 0;
                }
                break;
            case 'grid':
                // 2x4 tactical grid
                const dx = radius * 0.6;
                const dy = radius * 0.6;
                for (let i = 0; i < 8; i++) {
                    const row = Math.floor(i / 4);
                    const col = i % 4;
                    this.nodes[i].x = (col - 1.5) * dx;
                    this.nodes[i].y = (row - 0.5) * dy;
                    this.nodes[i].vx = 0;
                    this.nodes[i].vy = 0;
                }
                break;
            case 'line':
                // Convoy line
                const step = (radius * 2.2) / 7;
                for (let i = 0; i < 8; i++) {
                    this.nodes[i].x = (i - 3.5) * step;
                    this.nodes[i].y = 0;
                    this.nodes[i].vx = 0;
                    this.nodes[i].vy = 0;
                }
                break;
            case 'cluster':
                // Two separate tactical clusters (Mesh gateway scenario)
                const c1 = [-radius * 0.6, 0];
                const c2 = [radius * 0.6, 0];
                for (let i = 0; i < 4; i++) {
                    const a = (i * 2 * Math.PI) / 4;
                    this.nodes[i].x = c1[0] + radius * 0.3 * Math.cos(a);
                    this.nodes[i].y = c1[1] + radius * 0.3 * Math.sin(a);
                    this.nodes[i].vx = 0;
                    this.nodes[i].vy = 0;
                }
                for (let i = 4; i < 8; i++) {
                    const a = ((i - 4) * 2 * Math.PI) / 4;
                    this.nodes[i].x = c2[0] + radius * 0.3 * Math.cos(a);
                    this.nodes[i].y = c2[1] + radius * 0.3 * Math.sin(a);
                    this.nodes[i].vx = 0;
                    this.nodes[i].vy = 0;
                }
                break;
        }
        this.updateTelemetryCard();
    }

    // Coordinate conversions: World (Meters) <-> Screen (Pixels)
    worldToScreen(wx, wy) {
        const cx = this.canvas.width / 2 + this.panX;
        const cy = this.canvas.height / 2 + this.panY;
        return {
            x: cx + wx * this.pixelsPerMeter,
            y: cy - wy * this.pixelsPerMeter // Cartesian: positive Y goes UP
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

        // Mouse Drag & Pan & Zoom
        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        window.addEventListener('mousemove', (e) => this.onMouseMove(e));
        window.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });

        // Context Menu disable on canvas to allow right click panning
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        // Scale Buttons
        document.querySelectorAll('.scale-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.scale-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const scaleVal = parseFloat(btn.dataset.scale);
                this.setScale(scaleVal);
            });
        });

        // Preset Buttons
        document.getElementById('preset-octagon').addEventListener('click', () => this.applyPreset('octagon'));
        document.getElementById('preset-grid').addEventListener('click', () => this.applyPreset('grid'));
        document.getElementById('preset-line').addEventListener('click', () => this.applyPreset('line'));
        document.getElementById('preset-cluster').addEventListener('click', () => this.applyPreset('cluster'));

        // Reset View & Recenter
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

        // RF Parameter Sliders
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

        // Adjust pixelsPerMeter so that roughly 2 to 3 grid intervals fit in the view
        const targetGridPx = 140; // desired pixel size for main grid interval
        this.pixelsPerMeter = targetGridPx / meters;
        this.updateScaleBar();
        this.updateHUD();
    }

    resetView() {
        this.panX = 0;
        this.panY = 0;
        this.setScale(this.scaleMeters);
    }

    zoomAtCenter(factor) {
        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2;
        this.zoomAt(cx, cy, factor);
    }

    zoomAt(screenX, screenY, factor) {
        const oldPpm = this.pixelsPerMeter;
        const newPpm = Math.min(Math.max(oldPpm * factor, 0.2), 50.0);
        if (oldPpm === newPpm) return;

        // Keep mouse world position invariant
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

        // Hit test nodes (in screen coordinates)
        let clickedNode = null;
        for (let i = this.nodes.length - 1; i >= 0; i--) {
            const node = this.nodes[i];
            const sp = this.worldToScreen(node.x, node.y);
            const dist = Math.hypot(mx - sp.x, my - sp.y);
            if (dist <= node.radiusPx + 6) {
                clickedNode = node;
                break;
            }
        }

        if (clickedNode && e.button === 0) { // Left click on node
            this.isDraggingNode = true;
            this.draggedNode = clickedNode;
            this.selectedNodeId = clickedNode.id;
            this.lastDragWorldPos = { x: clickedNode.x, y: clickedNode.y };
            this.lastDragTime = performance.now();
            this.updateTelemetryCard();
        } else {
            // Background drag (Pan)
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

        if (this.isDraggingNode && this.draggedNode) {
            const wPos = this.screenToWorld(mx, my);
            const now = performance.now();
            const dtSec = (now - this.lastDragTime) / 1000.0;

            if (dtSec > 0.015) {
                // Calculate physical velocity vector in m/s
                this.draggedNode.vx = (wPos.x - this.lastDragWorldPos.x) / dtSec;
                this.draggedNode.vy = (wPos.y - this.lastDragWorldPos.y) / dtSec;
                this.lastDragWorldPos = { x: wPos.x, y: wPos.y };
                this.lastDragTime = now;
            }

            this.draggedNode.x = Math.round(wPos.x * 10) / 10;
            this.draggedNode.y = Math.round(wPos.y * 10) / 10;

            this.updateTelemetryCard();
        } else if (this.isPanning) {
            this.panX += dx;
            this.panY += dy;
            this.updateHUD();
        }
    }

    onMouseUp(e) {
        if (this.isDraggingNode && this.draggedNode) {
            // Smoothly damp velocity after release
            this.draggedNode.vx = 0;
            this.draggedNode.vy = 0;
            this.isDraggingNode = false;
            this.draggedNode = null;
            this.updateTelemetryCard();
        }
        this.isPanning = false;
    }

    onWheel(e) {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const zoomFactor = e.deltaY < 0 ? 1.12 : (1 / 1.12);
        this.zoomAt(mx, my, zoomFactor);
    }

    updateScaleBar() {
        const barElem = document.getElementById('scale-bar-line');
        const labelElem = document.getElementById('scale-bar-label');
        if (!barElem || !labelElem) return;

        // Choose nice scale value depending on current pixelsPerMeter
        // The scale bar width should be between 80px and 220px
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
        const hudZoom = document.getElementById('hud-zoom-val');
        const hudPan = document.getElementById('hud-pan-val');
        if (hudZoom) hudZoom.textContent = `${Math.round((this.pixelsPerMeter / 6.0) * 100)}%`;
        if (hudPan) {
            const worldPan = this.screenToWorld(this.canvas.width / 2, this.canvas.height / 2);
            hudPan.textContent = `(${Math.round(worldPan.x)}m, ${Math.round(worldPan.y)}m)`;
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

        const speed = Math.hypot(selNode.vx, selNode.vy);
        document.getElementById('sel-node-vel').textContent = `${speed.toFixed(1)} m/s`;
        
        let heading = (Math.atan2(selNode.vy, selNode.vx) * 180 / Math.PI);
        if (heading < 0) heading += 360;
        document.getElementById('sel-node-heading').textContent = speed > 0.1 ? `${Math.round(heading)}°` : '0°';

        // Update links list in sidebar
        const listContainer = document.getElementById('links-summary-list');
        if (listContainer && this.latestMatrix.length > 0) {
            const row = this.latestMatrix[selNode.id - 1] || [];
            let html = '';
            for (let j = 0; j < row.length; j++) {
                if (j === selNode.id - 1) continue;
                const link = row[j];
                const qualityColor = link.linkQuality > 70 ? 'var(--accent-green)' : (link.linkQuality > 40 ? 'var(--accent-orange)' : 'var(--accent-red)');
                html += `
                    <div style="display: flex; justify-content: space-between; padding: 2px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <span>→ N${j + 1}: <b>${link.distance.toFixed(1)}m</b></span>
                        <span>PL: ${link.pathLoss.toFixed(1)}dB</span>
                        <span>Dly: ${link.delayNs.toFixed(0)}ns</span>
                        <span style="color: ${qualityColor}">${link.rssiDbm.toFixed(0)}dBm</span>
                    </div>
                `;
            }
            listContainer.innerHTML = html;
        }
    }

    // WebSocket Management
    initWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host || 'localhost:8000';
        const wsUrl = `${protocol}//${host}/ws/client`;
        document.getElementById('server-url-display').textContent = wsUrl;

        this.updateWsIndicator('connecting', 'CONNECTING...');

        try {
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                this.wsConnected = true;
                this.updateWsIndicator('connected', 'ONLINE');
                console.log('[Octagon] WebSocket Connected to Octaman Server.');
            };

            this.ws.onclose = () => {
                this.wsConnected = false;
                this.updateWsIndicator('disconnected', 'OFFLINE');
                // Reconnect after 2 seconds
                setTimeout(() => this.initWebSocket(), 2000);
            };

            this.ws.onerror = (err) => {
                console.warn('[Octagon] WebSocket error:', err);
                this.wsConnected = false;
                this.updateWsIndicator('disconnected', 'ERR RECONNECTING');
            };

            this.ws.onmessage = (event) => {
                // Server might send ack or command
            };
        } catch (e) {
            this.updateWsIndicator('disconnected', 'ERROR');
            setTimeout(() => this.initWebSocket(), 2500);
        }
    }

    updateWsIndicator(state, text) {
        const ind = document.getElementById('ws-indicator');
        const txt = document.getElementById('ws-status-text');
        ind.className = `status-indicator ${state}`;
        txt.textContent = text;
    }

    restartTxLoop() {
        if (this.txTimer) clearInterval(this.txTimer);
        const intervalMs = Math.round(1000 / this.updateRateHz);
        this.txTimer = setInterval(() => this.sendMatrixPayload(), intervalMs);
    }

    sendMatrixPayload() {
        // Compute full 8x8 matrix
        const dt = 1.0 / this.updateRateHz;
        this.latestMatrix = this.wireless.computeMatrix(this.nodes, dt);

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const payload = {
                timestamp: Date.now(),
                scale_m: this.scaleMeters,
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
                    vx: parseFloat(n.vx.toFixed(2)),
                    vy: parseFloat(n.vy.toFixed(2))
                })),
                matrix: this.latestMatrix
            };

            this.ws.send(JSON.stringify(payload));
            this.frameCount++;
        }

        // Calculate and update TX FPS
        const now = performance.now();
        if (now - this.lastFpsCalcTime >= 1000) {
            this.txFps = ((this.frameCount * 1000) / (now - this.lastFpsCalcTime)).toFixed(1);
            document.getElementById('tx-fps-val').textContent = this.txFps;
            this.frameCount = 0;
            this.lastFpsCalcTime = now;
        }
    }

    // Auto Patrol update
    updatePatrol(dt) {
        if (!this.isPatrolling) return;
        this.patrolAngle += dt * 0.4;

        // Rotate nodes in tactical patrol paths
        for (let i = 0; i < 8; i++) {
            if (this.isDraggingNode && this.draggedNode && this.draggedNode.id === this.nodes[i].id) {
                continue; // Do not auto-move currently dragged node
            }
            const offset = (i * 2 * Math.PI) / 8;
            const r = this.scaleMeters * (0.4 + (i % 3) * 0.25);
            const speed = 0.4 + (i % 2) * 0.2;
            const a = this.patrolAngle * speed + offset;

            const nextX = r * Math.cos(a);
            const nextY = r * Math.sin(a * 1.2);

            // Compute instant velocity
            this.nodes[i].vx = (nextX - this.nodes[i].x) / dt;
            this.nodes[i].vy = (nextY - this.nodes[i].y) / dt;
            this.nodes[i].x = Math.round(nextX * 10) / 10;
            this.nodes[i].y = Math.round(nextY * 10) / 10;
        }
    }

    // Main Canvas Render Loop
    renderLoop(timestamp) {
        const dt = Math.min((timestamp - this.lastAnimTime) / 1000, 0.1);
        this.lastAnimTime = timestamp;

        this.updatePatrol(dt);

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw World Elements
        this.drawGrid();
        this.drawOriginAxes();
        this.drawWirelessLinks();
        this.drawNodes(timestamp);

        requestAnimationFrame((t) => this.renderLoop(t));
    }

    drawGrid() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        // Choose appropriate grid step in meters based on active scale
        let majorStepM = this.scaleMeters;
        let minorStepM = majorStepM / 5;

        const minorPx = minorStepM * this.pixelsPerMeter;
        const majorPx = majorStepM * this.pixelsPerMeter;

        const centerScreen = this.worldToScreen(0, 0);

        // Minor Grid
        ctx.strokeStyle = 'rgba(30, 44, 63, 0.45)';
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

        // Major Grid with meter markings
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.15)';
        ctx.lineWidth = 1.2;
        ctx.fillStyle = 'rgba(136, 153, 170, 0.6)';
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.beginPath();

        const majorStartX = centerScreen.x % majorPx;
        for (let x = majorStartX; x < w; x += majorPx) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            // Label
            const worldX = Math.round(this.screenToWorld(x, 0).x);
            if (Math.abs(worldX) > 0.01) {
                ctx.fillText(`${worldX}m`, x + 4, centerScreen.y - 4);
            }
        }

        const majorStartY = centerScreen.y % majorPx;
        for (let y = majorStartY; y < h; y += majorPx) {
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            // Label
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

        // Crosshairs at (0,0)
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        // X-axis
        ctx.moveTo(o.x - 30, o.y);
        ctx.lineTo(o.x + 30, o.y);
        // Y-axis
        ctx.moveTo(o.x, o.y - 30);
        ctx.lineTo(o.x, o.y + 30);
        ctx.stroke();

        // Origin circle
        ctx.beginPath();
        ctx.arc(o.x, o.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 240, 255, 0.2)';
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'rgba(0, 240, 255, 0.7)';
        ctx.font = '10px monospace';
        ctx.fillText('(0,0) ORIGIN', o.x + 8, o.y + 14);
    }

    drawWirelessLinks() {
        const ctx = this.ctx;
        if (!this.latestMatrix || this.latestMatrix.length < 8) return;

        // Draw links between all pairs
        for (let i = 0; i < 8; i++) {
            const p1 = this.worldToScreen(this.nodes[i].x, this.nodes[i].y);
            for (let j = i + 1; j < 8; j++) {
                const p2 = this.worldToScreen(this.nodes[j].x, this.nodes[j].y);
                const link = this.latestMatrix[i][j];
                if (!link) continue;

                // Color based on RSSI / Link Quality
                let strokeColor = '';
                let alpha = 0.15;
                let lineWidth = 1;
                let isDashed = false;

                if (link.linkQuality >= 75) {
                    strokeColor = '0, 255, 136'; // Green
                    alpha = 0.45;
                    lineWidth = 2.0;
                } else if (link.linkQuality >= 40) {
                    strokeColor = '255, 183, 3'; // Yellow
                    alpha = 0.35;
                    lineWidth = 1.5;
                } else if (link.isConnected) {
                    strokeColor = '255, 51, 102'; // Red
                    alpha = 0.25;
                    lineWidth = 1.0;
                    isDashed = true;
                } else {
                    // Disconnected / out of range
                    strokeColor = '100, 100, 100';
                    alpha = 0.1;
                    isDashed = true;
                }

                // If one of the endpoints is the selected node, highlight this link
                const isSelectedLink = (this.nodes[i].id === this.selectedNodeId || this.nodes[j].id === this.selectedNodeId);
                if (isSelectedLink) {
                    alpha = Math.min(1.0, alpha * 2.2);
                    lineWidth += 1.0;
                }

                ctx.strokeStyle = `rgba(${strokeColor}, ${alpha})`;
                ctx.lineWidth = lineWidth;
                ctx.setLineDash(isDashed ? [4, 4] : []);
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
                ctx.setLineDash([]);

                // On selected link, draw middle distance / path loss badge
                if (isSelectedLink && link.isConnected) {
                    const midX = (p1.x + p2.x) / 2;
                    const midY = (p1.y + p2.y) / 2;
                    ctx.fillStyle = 'rgba(10, 14, 20, 0.8)';
                    ctx.fillRect(midX - 28, midY - 9, 56, 18);
                    ctx.strokeStyle = `rgba(${strokeColor}, 0.5)`;
                    ctx.lineWidth = 1;
                    ctx.strokeRect(midX - 28, midY - 9, 56, 18);

                    ctx.fillStyle = '#fff';
                    ctx.font = '9px "JetBrains Mono", monospace';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(`${link.distance.toFixed(0)}m|${link.pathLoss.toFixed(0)}dB`, midX, midY);
                    ctx.textAlign = 'start';
                    ctx.textBaseline = 'alphabetic';
                }
            }
        }
    }

    drawNodes(timestamp) {
        const ctx = this.ctx;

        for (const node of this.nodes) {
            const sp = this.worldToScreen(node.x, node.y);
            const isSelected = node.id === this.selectedNodeId;
            const isDragged = this.isDraggingNode && this.draggedNode && this.draggedNode.id === node.id;

            // Pulse wave animation around node
            const pulse = (timestamp * 0.003 + node.pulsePhase) % 1.0;
            const pulseRadius = node.radiusPx + pulse * 24;
            ctx.beginPath();
            ctx.arc(sp.x, sp.y, pulseRadius, 0, Math.PI * 2);
            ctx.strokeStyle = `${node.color}${Math.floor((1.0 - pulse) * 70).toString(16).padStart(2, '0')}`;
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Selected node outer bracket/ring
            if (isSelected) {
                ctx.beginPath();
                ctx.arc(sp.x, sp.y, node.radiusPx + 8, 0, Math.PI * 2);
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2;
                ctx.setLineDash([4, 4]);
                ctx.stroke();
                ctx.setLineDash([]);
            }

            // Node main circle
            ctx.beginPath();
            ctx.arc(sp.x, sp.y, node.radiusPx, 0, Math.PI * 2);
            ctx.fillStyle = isDragged ? '#ffffff' : '#101721';
            ctx.fill();
            ctx.strokeStyle = node.color;
            ctx.lineWidth = 2.5;
            ctx.stroke();

            // Node ID Number inside
            ctx.fillStyle = isDragged ? '#000000' : node.color;
            ctx.font = 'bold 12px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(node.id, sp.x, sp.y);

            // Node Label below (Name & Coordinates)
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.font = 'bold 11px sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.fillText(node.name, sp.x, sp.y + node.radiusPx + 4);

            ctx.font = '10px "JetBrains Mono", monospace';
            ctx.fillStyle = 'var(--text-secondary)';
            ctx.fillText(`(${node.x.toFixed(1)}m, ${node.y.toFixed(1)}m)`, sp.x, sp.y + node.radiusPx + 17);

            // Draw Velocity Vector Arrow if moving
            const speed = Math.hypot(node.vx, node.vy);
            if (speed > 0.5) {
                const arrowLen = Math.min(speed * 4, 40);
                const angle = Math.atan2(-node.vy, node.vx); // Screen Y inverted
                const endX = sp.x + arrowLen * Math.cos(angle);
                const endY = sp.y + arrowLen * Math.sin(angle);

                ctx.strokeStyle = 'var(--accent-orange)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(sp.x, sp.y);
                ctx.lineTo(endX, endY);
                ctx.stroke();

                // Arrow head
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

// Instantiate on DOM load
window.addEventListener('DOMContentLoaded', () => {
    window.app = new OctagonApp();
});
