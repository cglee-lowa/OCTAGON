/**
 * OCTAGON MANET Wireless Channel Parameter Calculation Engine
 * 
 * Supports calculation of:
 * - Log-distance Path Loss (dB)
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
        // Time correlation parameter alpha = exp(-dt / T_decorr)
        const decorrTime = 1.5; // Shadowing decorrelation time ~1.5s
        const alpha = Math.exp(-Math.max(dt, 0.01) / decorrTime);
        const w = Math.sqrt(1 - alpha * alpha) * this.randn() * this.shadowingSigma;
        state.shadow = alpha * state.shadow + w;

        // Small-scale dynamic fast fading (Rayleigh / Rician approximation)
        state.fastPhase = (state.fastPhase + dt * (3.0 + Math.random() * 5.0)) % (2 * Math.PI);
        const ricianK = 3.0; // K-factor in dB for direct LOS
        const kLinear = Math.pow(10, ricianK / 10);
        // Normalized complex envelope
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
     */
    computeLink(nodeA, nodeB, dt = 0.033) {
        if (nodeA.id === nodeB.id) {
            return {
                source: nodeA.id,
                target: nodeB.id,
                distance: 0,
                pathLoss: 0,
                fading: 0,
                shadowing: 0,
                fastFading: 0,
                delayNs: 0,
                rmsDelaySpreadNs: 0,
                multipath: [
                    { delayNs: 0, powerRatioDb: 0 },
                    { delayNs: 0, powerRatioDb: -999 },
                    { delayNs: 0, powerRatioDb: -999 }
                ],
                dopplerHz: 0,
                rssiDbm: this.txPowerDbm,
                linkQuality: 100,
                isConnected: true
            };
        }

        const dx = nodeB.x - nodeA.x;
        const dy = nodeB.y - nodeA.y;
        const distance = Math.max(0.1, Math.hypot(dx, dy)); // Distance in meters

        // 1. Path Loss: Log-distance Path Loss Model
        // PL(d0) Free-space path loss at d0 = 1m: 20*log10(4*pi*d0/lambda)
        const lambda = this.wavelength;
        const pl0 = 20 * Math.log10((4 * Math.PI * this.d0) / lambda);
        let pathLoss = pl0;
        if (distance > this.d0) {
            pathLoss = pl0 + 10 * this.pathLossExponent * Math.log10(distance / this.d0);
        }

        // 2. Fading (Shadowing + Fast Fading)
        const pairKey = nodeA.id < nodeB.id ? `${nodeA.id}-${nodeB.id}` : `${nodeB.id}-${nodeA.id}`;
        const fadingState = this.updateFadingState(pairKey, dt);
        const totalFading = fadingState.shadow + fadingState.fastFadingDb;

        // 3. Propagation Delay
        // tau = d / c (in nanoseconds)
        const delayNs = (distance / this.c) * 1e9;

        // 4. Multipath Profile (RMS Delay Spread + 3 Taps)
        // Delay spread increases with distance and terrain dispersion
        const baseSpreadNs = 15.0; // 15 ns base spread
        const rmsDelaySpreadNs = baseSpreadNs * (1.0 + 0.45 * Math.log10(1 + distance / 10.0));
        
        // 3-Ray Tap Model:
        // Tap 1: Direct path (0 ns, 0 dB reference)
        // Tap 2: Ground reflection (slight excess delay, ~3-8 dB attenuation)
        // Tap 3: Clutter/obstacle scatter (longer excess delay, ~10-18 dB attenuation)
        const tap2ExcessNs = Math.min(delayNs * 0.15 + 12.0, 120.0);
        const tap3ExcessNs = Math.min(delayNs * 0.35 + 35.0, 300.0);
        const multipath = [
            { tap: 1, delayNs: 0.0, powerRatioDb: 0.0 },
            { tap: 2, delayNs: parseFloat(tap2ExcessNs.toFixed(1)), powerRatioDb: -5.2 },
            { tap: 3, delayNs: parseFloat(tap3ExcessNs.toFixed(1)), powerRatioDb: -13.8 }
        ];

        // 5. Doppler Shift (Hz)
        // Relative velocity vector: v_rel = vB - vA
        const vxRel = (nodeB.vx || 0) - (nodeA.vx || 0);
        const vyRel = (nodeB.vy || 0) - (nodeA.vy || 0);
        
        // Line-of-sight unit vector from A to B
        const ux = dx / distance;
        const uy = dy / distance;

        // Radial relative velocity: v_r = v_rel · u
        const vRadial = vxRel * ux + vyRel * uy;

        // Doppler frequency shift: fd = (v_radial / lambda) = (v_radial * fc) / c
        const dopplerHz = (vRadial * this.frequencyHz) / this.c;

        // 6. RSSI (Received Signal Strength Indicator in dBm)
        // RSSI = P_tx + G_tx + G_rx - PathLoss - Shadowing - FastFading
        const totalGain = this.antennaGainDbi * 2;
        const rssiDbm = this.txPowerDbm + totalGain - pathLoss - totalFading;

        // Link Quality Estimation (0 to 100%)
        // Sensitivity threshold: -95 dBm (0%), Good: -65 dBm (100%)
        const minSensitivity = -95.0;
        const maxExcellent = -60.0;
        let linkQuality = ((rssiDbm - minSensitivity) / (maxExcellent - minSensitivity)) * 100;
        linkQuality = Math.min(100, Math.max(0, linkQuality));

        const isConnected = rssiDbm >= minSensitivity;

        return {
            source: nodeA.id,
            target: nodeB.id,
            distance: parseFloat(distance.toFixed(2)),
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
            isConnected: isConnected
        };
    }

    /**
     * Compute full 8x8 Link Matrix for an array of 8 nodes
     */
    computeMatrix(nodes, dt = 0.033) {
        const matrix = [];
        const n = nodes.length;

        for (let i = 0; i < n; i++) {
            const row = [];
            for (let j = 0; j < n; j++) {
                row.push(this.computeLink(nodes[i], nodes[j], dt));
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
