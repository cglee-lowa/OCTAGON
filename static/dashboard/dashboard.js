/**
 * OCTAMAN Server Dashboard Controller
 * Real-time 8x8 MANET Link Matrix & Wireless Telemetry Monitor
 */

class DashboardMonitor {
    constructor() {
        this.ws = null;
        this.activeMetric = 'pathLoss'; // 'pathLoss' | 'delayNs' | 'fading' | 'rmsDelaySpreadNs' | 'dopplerHz' | 'rssiDbm'
        this.selectedPair = { tx: 0, rx: 1 }; // default inspect N1 -> N2

        this.packetCount = 0;
        this.lastFpsCalcTime = performance.now();
        this.framesThisSec = 0;
        this.rxFps = 0;

        this.latestData = null;

        this.setupDOM();
        this.initTable();
        this.connectWebSocket();
    }

    setupDOM() {
        // Tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.activeMetric = btn.dataset.metric;
                this.updateMetricUnitTag();
                if (this.latestData) this.renderMatrix(this.latestData.matrix);
            });
        });
    }

    updateMetricUnitTag() {
        const tag = document.getElementById('matrix-units-tag');
        const legendMin = document.getElementById('legend-min');
        const legendMax = document.getElementById('legend-max');
        const gradientBar = document.getElementById('legend-gradient-bar');

        switch (this.activeMetric) {
            case 'pathLoss':
                tag.textContent = '(Path Loss in dB)';
                legendMin.textContent = '40 dB (Low Loss)';
                legendMax.textContent = '100+ dB (High Loss)';
                gradientBar.style.background = 'linear-gradient(90deg, #00ff88, #ffb703, #ff3366)';
                break;
            case 'delayNs':
                tag.textContent = '(Propagation Delay in ns)';
                legendMin.textContent = '0 ns';
                legendMax.textContent = '1500+ ns';
                gradientBar.style.background = 'linear-gradient(90deg, #00f0ff, #3a86ff, #9d4edd)';
                break;
            case 'fading':
                tag.textContent = '(Total Fading in dB)';
                legendMin.textContent = '-6 dB (Constructive)';
                legendMax.textContent = '+8 dB (Destructive)';
                gradientBar.style.background = 'linear-gradient(90deg, #00ff88, #4e6074, #ff3366)';
                break;
            case 'rmsDelaySpreadNs':
                tag.textContent = '(RMS Delay Spread in ns)';
                legendMin.textContent = '15 ns';
                legendMax.textContent = '50+ ns';
                gradientBar.style.background = 'linear-gradient(90deg, #00ff88, #ffb703, #fb5607)';
                break;
            case 'dopplerHz':
                tag.textContent = '(Doppler Frequency Shift in Hz)';
                legendMin.textContent = '-50 Hz (Receding)';
                legendMax.textContent = '+50 Hz (Approaching)';
                gradientBar.style.background = 'linear-gradient(90deg, #3a86ff, #1d283a, #ffb703)';
                break;
            case 'rssiDbm':
                tag.textContent = '(Received Signal Strength RSSI in dBm)';
                legendMin.textContent = '-95 dBm (Weak)';
                legendMax.textContent = '-40 dBm (Strong)';
                gradientBar.style.background = 'linear-gradient(90deg, #ff3366, #ffb703, #00ff88)';
                break;
        }
    }

    initTable() {
        const tbody = document.getElementById('matrix-body');
        tbody.innerHTML = '';

        for (let i = 0; i < 8; i++) {
            const tr = document.createElement('tr');
            // Row header
            const th = document.createElement('th');
            th.textContent = `N${i + 1}`;
            tr.appendChild(th);

            for (let j = 0; j < 8; j++) {
                const td = document.createElement('td');
                td.id = `cell-${i}-${j}`;
                td.dataset.tx = i;
                td.dataset.rx = j;

                if (i === j) {
                    td.className = 'self-cell';
                    td.textContent = '—';
                } else {
                    td.textContent = '--';
                    td.addEventListener('click', () => {
                        this.selectedPair = { tx: i, rx: j };
                        this.highlightSelectedCell();
                        if (this.latestData) this.updateInspector(this.latestData);
                    });
                }
                tr.appendChild(td);
            }
            tbody.appendChild(tr);
        }

        this.highlightSelectedCell();
    }

    highlightSelectedCell() {
        document.querySelectorAll('.matrix-table td').forEach(td => td.classList.remove('selected'));
        const cell = document.getElementById(`cell-${this.selectedPair.tx}-${this.selectedPair.rx}`);
        if (cell) cell.classList.add('selected');
    }

    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host || 'localhost:8000';
        const wsUrl = `${protocol}//${host}/ws/dashboard`;

        this.appendLog(`Connecting to WebSocket: ${wsUrl}`);
        this.updateServerDot(false, 'CONNECTING...');

        try {
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                this.updateServerDot(true, 'MONITORING ACTIVE');
                this.appendLog('Connected to Octaman Server broadcast channel.');
            };

            this.ws.onclose = () => {
                this.updateServerDot(false, 'DISCONNECTED');
                this.appendLog('WebSocket closed. Reconnecting in 2s...');
                setTimeout(() => this.connectWebSocket(), 2000);
            };

            this.ws.onerror = (err) => {
                this.updateServerDot(false, 'ERROR');
                this.appendLog('WebSocket error encountered.');
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.onDataReceived(data);
                } catch (e) {
                    console.error('Failed to parse WS data:', e);
                }
            };
        } catch (e) {
            setTimeout(() => this.connectWebSocket(), 2500);
        }
    }

    updateServerDot(connected, text) {
        const dot = document.getElementById('srv-dot');
        const txt = document.getElementById('srv-status-text');
        if (connected) {
            dot.className = 'dot connected';
        } else {
            dot.className = 'dot';
        }
        txt.textContent = text;
    }

    appendLog(msg) {
        const logBox = document.getElementById('stream-log-box');
        if (!logBox) return;
        const now = new Date().toTimeString().split(' ')[0];
        const div = document.createElement('div');
        div.className = 'log-entry';
        div.innerHTML = `<span class="time">[${now}]</span> ${msg}`;
        logBox.appendChild(div);
        logBox.scrollTop = logBox.scrollHeight;

        // Keep last 40 entries
        while (logBox.children.length > 40) {
            logBox.removeChild(logBox.firstChild);
        }
    }

    onDataReceived(data) {
        this.latestData = data;
        this.packetCount++;
        this.framesThisSec++;

        // Measure FPS
        const now = performance.now();
        if (now - this.lastFpsCalcTime >= 1000) {
            this.rxFps = ((this.framesThisSec * 1000) / (now - this.lastFpsCalcTime)).toFixed(1);
            document.getElementById('rx-rate-display').textContent = `${this.rxFps} Hz`;
            document.getElementById('rx-pkts-display').textContent = this.packetCount.toLocaleString();

            const latency = Date.now() - (data.timestamp || Date.now());
            document.getElementById('client-latency-display').textContent = `${Math.max(0, latency)} ms`;

            this.framesThisSec = 0;
            this.lastFpsCalcTime = now;
        }

        // Scale tag
        if (data.scale_m) {
            document.getElementById('current-sim-scale').textContent = `SCALE: ${data.scale_m}m | Freq: ${data.carrier_freq_ghz || 2.4}GHz`;
        }

        // Render Matrix Table & Inspector
        this.renderMatrix(data.matrix);
        this.updateInspector(data);
        this.renderNodesOverview(data.nodes);
    }

    getColorForMetric(val, metric) {
        if (metric === 'pathLoss') {
            // 40 dB (green: 0, 255, 136) -> 75 dB (yellow: 255, 183, 3) -> 100 dB (red: 255, 51, 102)
            const norm = Math.min(Math.max((val - 40) / 60, 0), 1);
            if (norm < 0.5) {
                const f = norm * 2;
                return `rgba(${Math.round(0 + 255 * f)}, ${Math.round(255 - 72 * f)}, ${Math.round(136 - 133 * f)}, 0.35)`;
            } else {
                const f = (norm - 0.5) * 2;
                return `rgba(255, ${Math.round(183 - 132 * f)}, ${Math.round(3 + 99 * f)}, 0.45)`;
            }
        } else if (metric === 'delayNs') {
            // 0 ns -> 1500 ns
            const norm = Math.min(Math.max(val / 1500, 0), 1);
            return `rgba(0, ${Math.round(240 - 150 * norm)}, 255, ${0.15 + norm * 0.45})`;
        } else if (metric === 'dopplerHz') {
            // -40 Hz (blue) -> 0 Hz (dark) -> +40 Hz (orange)
            const clamped = Math.min(Math.max(val, -40), 40);
            if (clamped < 0) {
                const f = -clamped / 40;
                return `rgba(58, 134, 255, ${f * 0.5})`;
            } else {
                const f = clamped / 40;
                return `rgba(255, 183, 3, ${f * 0.5})`;
            }
        } else if (metric === 'rssiDbm') {
            // -95 dBm (red) -> -65 dBm (yellow) -> -40 dBm (green)
            const norm = Math.min(Math.max((val + 95) / 55, 0), 1);
            if (norm < 0.5) {
                const f = norm * 2;
                return `rgba(255, ${Math.round(51 + 132 * f)}, 102, 0.4)`;
            } else {
                const f = (norm - 0.5) * 2;
                return `rgba(${Math.round(255 - 255 * f)}, 255, 136, 0.4)`;
            }
        } else if (metric === 'fading') {
            const norm = Math.min(Math.max((val + 6) / 14, 0), 1);
            return `rgba(255, 100, 100, ${norm * 0.4})`;
        } else if (metric === 'rmsDelaySpreadNs') {
            const norm = Math.min(Math.max((val - 15) / 40, 0), 1);
            return `rgba(255, 183, 3, ${0.1 + norm * 0.4})`;
        }
        return 'transparent';
    }

    renderMatrix(matrix) {
        if (!matrix || matrix.length < 8) return;

        for (let i = 0; i < 8; i++) {
            for (let j = 0; j < 8; j++) {
                if (i === j) continue;
                const cell = document.getElementById(`cell-${i}-${j}`);
                if (!cell) continue;

                const link = matrix[i][j];
                if (!link) continue;

                const val = link[this.activeMetric];
                let displayVal = '--';
                if (typeof val === 'number') {
                    displayVal = val.toFixed(1);
                    if (this.activeMetric === 'delayNs') displayVal = val.toFixed(0);
                }

                cell.textContent = displayVal;
                cell.style.backgroundColor = this.getColorForMetric(val, this.activeMetric);
            }
        }
    }

    updateInspector(data) {
        const tx = this.selectedPair.tx;
        const rx = this.selectedPair.rx;
        if (tx === rx) return;

        const link = data.matrix && data.matrix[tx] ? data.matrix[tx][rx] : null;
        if (!link) return;

        document.getElementById('inspect-pair-label').textContent = `NODE ${tx + 1} ⇄ NODE ${rx + 1}`;
        document.getElementById('inspect-distance').textContent = `${link.distance.toFixed(1)} m`;

        document.getElementById('val-ins-pl').textContent = `${link.pathLoss.toFixed(1)} dB`;
        document.getElementById('val-ins-rssi').textContent = `${link.rssiDbm.toFixed(1)} dBm`;
        document.getElementById('val-ins-delay').textContent = `${link.delayNs.toFixed(1)} ns`;
        document.getElementById('val-ins-doppler').textContent = `${link.dopplerHz.toFixed(2)} Hz`;
        document.getElementById('val-ins-fading').textContent = `${link.fading.toFixed(1)} dB (Shadow ${link.shadowing}dB)`;
        document.getElementById('val-ins-spread').textContent = `${link.rmsDelaySpreadNs.toFixed(1)} ns`;

        // Multipath profile
        if (link.multipath && link.multipath.length >= 3) {
            document.getElementById('tap2-val').innerHTML = `${link.multipath[1].delayNs} ns &nbsp;|&nbsp; ${link.multipath[1].powerRatioDb} dB`;
            document.getElementById('tap3-val').innerHTML = `${link.multipath[2].delayNs} ns &nbsp;|&nbsp; ${link.multipath[2].powerRatioDb} dB`;
        }
    }

    renderNodesOverview(nodes) {
        if (!nodes || nodes.length < 8) return;
        const container = document.getElementById('node-grid-overview');
        if (container.children.length !== 8) {
            container.innerHTML = '';
            for (let i = 0; i < 8; i++) {
                const card = document.createElement('div');
                card.className = 'node-mini-card';
                card.id = `node-card-${i + 1}`;
                card.innerHTML = `
                    <div class="node-mini-header">
                        <span class="node-name-badge" style="color: var(--accent-cyan);">NODE ${i + 1}</span>
                        <span class="node-speed-txt" style="color: var(--text-muted);">0.0 m/s</span>
                    </div>
                    <div class="node-pos-txt" style="color: #fff; font-size: 10px;">X: 0.0m, Y: 0.0m</div>
                `;
                container.appendChild(card);
            }
        }

        for (let i = 0; i < 8; i++) {
            const n = nodes[i];
            const card = document.getElementById(`node-card-${n.id}`);
            if (card) {
                const speed = Math.hypot(n.vx, n.vy).toFixed(1);
                card.querySelector('.node-speed-txt').textContent = `${speed} m/s`;
                card.querySelector('.node-speed-txt').style.color = speed > 0.5 ? 'var(--accent-yellow)' : 'var(--text-muted)';
                card.querySelector('.node-pos-txt').textContent = `X: ${n.x.toFixed(1)}m, Y: ${n.y.toFixed(1)}m`;
            }
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new DashboardMonitor();
});
