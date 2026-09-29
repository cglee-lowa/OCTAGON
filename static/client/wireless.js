/**
 * OCTAGON MANET Wireless Channel Parameter Calculation Engine
 * 
 * Supports calculation of:
 * - 3D Distance & Log-distance Path Loss (dB)
 * - Tactical Terrain LOS / NLOS Knife-Edge Diffraction Loss (dB)
 * - Foliage Clutter Attenuation (dB)
 * - Fading (Log-normal Shadowing + Small-scale Multipath Fading) (dB)
 * - Propagation Delay (ns)
 * - Multipath Profile (RMS Delay Spread & 3-Ray Delays)
 * - Doppler Shift (Hz)
 * - RSSI & Link Quality (%)
 */

class WirelessEngine {
    constructor(config = {}) {
        this.c = 299792458; // Speed of light (m/s)
        this.frequencyHz = config.frequencyHz || 2.4e9; // Carrier frequency (2.4 GHz default)
        this.pathLossExponent = config.pathLossExponent || 2.8; // n (Urban/suburban MANET typical: 2.5 ~ 3.5)
        this.d0 = 1.0; // Reference distance in meters
        this.txPowerDbm = config.txPowerDbm || 23.0; // Tx Power in dBm (typical military/tactical radio: 200mW)
        this.antennaGainDbi = config.antennaGainDbi || 2.15; // Dipole antenna gain
        this.shadowingSigma = config.shadowingSigma || 3.0; // Shadowing standard deviation in dB
        
        // Internal state for smooth shadowing and fading simulation (temporal correlation)
        this.fadingStates = new Map(); // key: "i-j" -> { shadow, phase1, phase2 }
    }

    get wavelength() {
        return this.c / this.frequencyHz;
    }

    /**
     * Generate standard normal random variable using Box-Muller transform
     */
    randn() {
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    }

    /**
     * Get or update smooth fading states with Gauss-Markov temporal correlation
     */
    updateFadingState(pairKey, dt) {
        if (!this.fadingStates.has(pairKey)) {
            this.fadingStates.set(pairKey, {
                shadow: this.randn() * this.shadowingSigma,
                fastPhase: Math.random() * 2 * Math.PI,
                fastAmp: 1.0
            });
        }
        
        const state = this.fadingStates.get(pairKey);
        const decorrTime = 1.5; // Shadowing decorrelation time ~1.5s
        const alpha = Math.exp(-Math.max(dt, 0.01) / decorrTime);
        const w = Math.sqrt(1 - alpha * alpha) * this.randn() * this.shadowingSigma;
        state.shadow = alpha * state.shadow + w;

        // Small-scale dynamic fast fading (Rayleigh / Rician approximation)
        state.fastPhase = (state.fastPhase + dt * (3.0 + Math.random() * 5.0)) % (2 * Math.PI);
        const ricianK = 3.0; // K-factor in dB for direct LOS
        const kLinear = Math.pow(10, ricianK / 10);
        const s = Math.sqrt(kLinear / (kLinear + 1));
        const diffRay = Math.sqrt(1 / (2 * (kLinear + 1)));
        const rReal = s + diffRay * this.randn();
        const rImag = diffRay * this.randn();
        const envelope = Math.sqrt(rReal * rReal + rImag * rImag);
        const fastFadingDb = 20 * Math.log10(Math.max(envelope, 0.05));
        
        state.fastFadingDb = fastFadingDb;
        return state;
    }

    /**
     * Compute comprehensive wireless link parameters between node i and node j
     * Integrates 3D Terrain Analysis (LOS/NLOS, Diffraction, Foliage, Elevation)
     */
    computeLink(nodeA, nodeB, dt = 0.033, terrain = null) {
        if (nodeA.id === nodeB.id) {
            return {
                source: nodeA.id,
                target: nodeB.id,
                distance: 0,
                distance3D: 0,
                pathLoss: 0,
                fading: 0,
                shadowing: 0,
                fastFading: 0,
                delayNs: 0,
                rmsDelaySpreadNs: 0,
                multipath: [
                    { tap: 1, delayNs: 0, powerRatioDb: 0 },
                    { tap: 2, delayNs: 0, powerRatioDb: -999 },
                    { tap: 3, delayNs: 0, powerRatioDb: -999 }
                ],
                dopplerHz: 0,
                rssiDbm: this.txPowerDbm,
                linkQuality: 100,
                isConnected: true,
                isLOS: true,
                diffractionLossDb: 0,
                foliageLossDb: 0,
                totalTerrainLossDb: 0,
                elevationA: 0,
                elevationB: 0,
                obstructionPoint: null,
                obstructingBuilding: null
            };
        }

        const dx = nodeB.x - nodeA.x;
        const dy = nodeB.y - nodeA.y;
        const dist2D = Math.max(0.1, Math.hypot(dx, dy));

        // 3D Terrain & Obstruction Analysis
        let isLOS = true;
        let dist3D = dist2D;
        let diffractionLossDb = 0.0;
        let foliageLossDb = 0.0;
        let totalTerrainLossDb = 0.0;
        let elevA = 0.0;
        let elevB = 0.0;
        let obstructionPoint = null;
        let obstructingBuilding = null;

        if (terrain && typeof terrain.analyzePath === 'function') {
            const pathResult = terrain.analyzePath(nodeA, nodeB, 2.0, this.wavelength);
            isLOS = pathResult.isLOS;
            dist3D = pathResult.dist3D || dist2D;
            diffractionLossDb = pathResult.diffractionLossDb;
            foliageLossDb = pathResult.foliageLossDb;
            totalTerrainLossDb = pathResult.totalTerrainLossDb;
            elevA = pathResult.elevationA;
            elevB = pathResult.elevationB;
            obstructionPoint = pathResult.obstructionPoint;
            obstructingBuilding = pathResult.obstructingBuilding;
        }

        // 1. Path Loss: Log-distance 3D Path Loss Model + Terrain Clutter/Diffraction
        const lambda = this.wavelength;
        const pl0 = 20 * Math.log10((4 * Math.PI * this.d0) / lambda);
        let pathLoss = pl0;
        if (dist3D > this.d0) {
            pathLoss = pl0 + 10 * this.pathLossExponent * Math.log10(dist3D / this.d0);
        }
        // 차폐 회절 손실 및 수목 감쇄 추가
        pathLoss += totalTerrainLossDb;

        // 2. Fading (Shadowing + Fast Fading)
        const pairKey = nodeA.id < nodeB.id ? `${nodeA.id}-${nodeB.id}` : `${nodeB.id}-${nodeA.id}`;
        const fadingState = this.updateFadingState(pairKey, dt);
        const totalFading = fadingState.shadow + fadingState.fastFadingDb;

        // 3. Propagation Delay
        // tau = d_3D / c (in nanoseconds)
        const delayNs = (dist3D / this.c) * 1e9;

        // 4. Multipath Profile (RMS Delay Spread + 3 Taps)
        // NLOS 시 다중경로 확산(Delay Spread) 급증
        const baseSpreadNs = isLOS ? 16.0 : 42.0;
        const rmsDelaySpreadNs = baseSpreadNs * (1.0 + 0.45 * Math.log10(1 + dist3D / 10.0));
        
        // 3-Ray Tap Model:
        const tap2ExcessNs = Math.min(delayNs * 0.18 + (isLOS ? 14.0 : 35.0), 180.0);
        const tap3ExcessNs = Math.min(delayNs * 0.40 + (isLOS ? 40.0 : 90.0), 380.0);
        const multipath = [
            { tap: 1, delayNs: 0.0, powerRatioDb: 0.0 },
            { tap: 2, delayNs: parseFloat(tap2ExcessNs.toFixed(1)), powerRatioDb: isLOS ? -6.0 : -3.5 },
            { tap: 3, delayNs: parseFloat(tap3ExcessNs.toFixed(1)), powerRatioDb: isLOS ? -14.5 : -8.5 }
        ];

        // 5. Doppler Shift (Hz)
        const vxRel = (nodeB.vx || 0) - (nodeA.vx || 0);
        const vyRel = (nodeB.vy || 0) - (nodeA.vy || 0);
        const ux = dx / dist2D;
        const uy = dy / dist2D;
        const vRadial = vxRel * ux + vyRel * uy;
        const dopplerHz = (vRadial * this.frequencyHz) / this.c;

        // 6. RSSI
        const totalGain = this.antennaGainDbi * 2;
        const rssiDbm = this.txPowerDbm + totalGain - pathLoss - totalFading;

        // Link Quality Estimation (0 to 100%)
        const minSensitivity = -98.0;
        const maxExcellent = -58.0;
        let linkQuality = ((rssiDbm - minSensitivity) / (maxExcellent - minSensitivity)) * 100;
        linkQuality = Math.min(100, Math.max(0, linkQuality));

        const isConnected = rssiDbm >= minSensitivity;

        return {
            source: nodeA.id,
            target: nodeB.id,
            distance: parseFloat(dist2D.toFixed(2)),
            distance3D: parseFloat(dist3D.toFixed(2)),
            pathLoss: parseFloat(pathLoss.toFixed(2)),
            fading: parseFloat(totalFading.toFixed(2)),
            shadowing: parseFloat(fadingState.shadow.toFixed(2)),
            fastFading: parseFloat(fadingState.fastFadingDb.toFixed(2)),
            delayNs: parseFloat(delayNs.toFixed(2)),
            rmsDelaySpreadNs: parseFloat(rmsDelaySpreadNs.toFixed(2)),
            multipath: multipath,
            dopplerHz: parseFloat(dopplerHz.toFixed(2)),
            rssiDbm: parseFloat(rssiDbm.toFixed(2)),
            linkQuality: Math.round(linkQuality),
            isConnected: isConnected,
            isLOS: isLOS,
            diffractionLossDb: parseFloat(diffractionLossDb.toFixed(2)),
            foliageLossDb: parseFloat(foliageLossDb.toFixed(2)),
            totalTerrainLossDb: parseFloat(totalTerrainLossDb.toFixed(2)),
            elevationA: parseFloat(elevA.toFixed(1)),
            elevationB: parseFloat(elevB.toFixed(1)),
            obstructionPoint: obstructionPoint,
            obstructingBuilding: obstructingBuilding
        };
    }

    /**
     * Compute full 8x8 Link Matrix for an array of 8 nodes with optional terrain
     */
    computeMatrix(nodes, dt = 0.033, terrain = null) {
        const matrix = [];
        const n = nodes.length;

        for (let i = 0; i < n; i++) {
            const row = [];
            for (let j = 0; j < n; j++) {
                row.push(this.computeLink(nodes[i], nodes[j], dt, terrain));
            }
            matrix.push(row);
        }

        return matrix;
    }
}

// Export for browser or node environment
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { WirelessEngine };
} else {
    window.WirelessEngine = WirelessEngine;
}
