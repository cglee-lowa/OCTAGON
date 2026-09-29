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
        this.antennaHeightM = config.antennaHeightM ?? 1.5; // General man-pack/vest-mounted tactical radio whip height above ground
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
     * Update correlated shadowing and Doppler-driven small-scale fading.
     * A stationary pair retains its channel state; motion drives spatial/time evolution.
     */
    updateFadingState(pairKey, dt, isLOS = true, maxDopplerHz = 0, nodeA = null, nodeB = null) {
        let state = this.fadingStates.get(pairKey);
        if (!state) {
            state = {
                shadowZ: this.randn(),
                fastI: this.randn() / Math.SQRT2,
                fastQ: this.randn() / Math.SQRT2,
                xA: nodeA?.x ?? 0, yA: nodeA?.y ?? 0, zA: nodeA?.z ?? 0,
                xB: nodeB?.x ?? 0, yB: nodeB?.y ?? 0, zB: nodeB?.z ?? 0
            };
            this.fadingStates.set(pairKey, state);
        }

        const distanceA = nodeA ? Math.hypot(nodeA.x - state.xA, nodeA.y - state.yA, (nodeA.z || 0) - state.zA) : 0;
        const distanceB = nodeB ? Math.hypot(nodeB.x - state.xB, nodeB.y - state.yB, (nodeB.z || 0) - state.zB) : 0;
        const pairDisplacement = Math.max(distanceA, distanceB);
        const shadowSigma = this.shadowingSigma * (isLOS ? 1 : 1.7);
        const shadowCorrelationDistance = isLOS ? 10 : 13; // urban micro LOS/NLOS spatial correlation distance
        const alphaShadow = Math.exp(-pairDisplacement / shadowCorrelationDistance);
        if (pairDisplacement > 0) {
            state.shadowZ = alphaShadow * state.shadowZ + Math.sqrt(Math.max(0, 1 - alphaShadow * alphaShadow)) * this.randn();
        }
        state.shadow = state.shadowZ * shadowSigma;

        // First-order correlated complex Gaussian process; alpha=1 at zero Doppler.
        const elapsed = Math.max(0, dt);
        const alphaFast = Math.exp(-2 * Math.PI * Math.max(0, maxDopplerHz) * elapsed);
        if (alphaFast < 1) {
            const innovation = Math.sqrt(Math.max(0, 1 - alphaFast * alphaFast));
            state.fastI = alphaFast * state.fastI + innovation * this.randn() / Math.SQRT2;
            state.fastQ = alphaFast * state.fastQ + innovation * this.randn() / Math.SQRT2;
        }

        const ricianK = isLOS ? 3.0 : -40.0;
        const kLinear = Math.pow(10, ricianK / 10);
        const specular = Math.sqrt(kLinear / (kLinear + 1));
        const diffuse = Math.sqrt(1 / (kLinear + 1));
        const envelope = Math.hypot(specular + diffuse * state.fastI, diffuse * state.fastQ);
        state.fastFadingDb = 20 * Math.log10(Math.max(envelope, 0.05));

        if (nodeA) { state.xA = nodeA.x; state.yA = nodeA.y; state.zA = nodeA.z || 0; }
        if (nodeB) { state.xB = nodeB.x; state.yB = nodeB.y; state.zB = nodeB.z || 0; }
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
        const dist2D = Math.hypot(dx, dy);
        const dz = (nodeB.z || 0) - (nodeA.z || 0);
        const geometricDist3D = Math.max(0.1, Math.hypot(dist2D, dz));

        // 3D Terrain & Obstruction Analysis
        let isLOS = true;
        let dist3D = geometricDist3D;
        let diffractionLossDb = 0.0;
        let foliageLossDb = 0.0;
        let totalTerrainLossDb = 0.0;
        let elevA = (nodeA.z || 0) - this.antennaHeightM;
        let elevB = (nodeB.z || 0) - this.antennaHeightM;
        let obstructionPoint = null;
        let obstructingBuilding = null;

        if (terrain && typeof terrain.analyzePath === 'function') {
            const pathResult = terrain.analyzePath(nodeA, nodeB, this.antennaHeightM, this.wavelength);
            isLOS = pathResult.isLOS;
            dist3D = Number.isFinite(pathResult.dist3D) ? pathResult.dist3D : geometricDist3D;
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
        const vxRel = (nodeB.vx || 0) - (nodeA.vx || 0);
        const vyRel = (nodeB.vy || 0) - (nodeA.vy || 0);
        const vzRel = (nodeB.vz || 0) - (nodeA.vz || 0);
        const maxDopplerHz = Math.hypot(vxRel, vyRel, vzRel) / this.wavelength;
        const fadingState = this.updateFadingState(pairKey, dt, isLOS, maxDopplerHz, nodeA, nodeB);
        const totalFading = fadingState.shadow + fadingState.fastFadingDb;

        // 3. Propagation Delay
        // tau = d_3D / c (in nanoseconds)
        const delayNs = (dist3D / this.c) * 1e9;

        // 4. Multipath Profile (RMS Delay Spread + 3 Taps)
        // NLOS 시 다중경로 확산(Delay Spread) 급증
        // Geometric ground-reflection and dominant-obstacle/scatter paths.
        const antennaHeightA = Math.max(0.1, (nodeA.z || 0) - elevA);
        const antennaHeightB = Math.max(0.1, (nodeB.z || 0) - elevB);
        const groundReflectionDistance = Math.hypot(dist2D, antennaHeightA + antennaHeightB);
        const tap2ExcessNs = Math.max(0, (groundReflectionDistance - dist3D) / this.c * 1e9);
        let tap3ExcessNs;
        if (obstructionPoint && Number.isFinite(obstructionPoint.terrainZ)) {
            const d1 = Math.max(0, obstructionPoint.d1 || dist2D / 2);
            const d2 = Math.max(0, obstructionPoint.d2 || dist2D / 2);
            const obstacleTop = obstructionPoint.terrainZ;
            const scatteredDistance = Math.hypot(d1, obstacleTop - (nodeA.z || 0)) + Math.hypot(d2, obstacleTop - (nodeB.z || 0));
            tap3ExcessNs = Math.max(0, (scatteredDistance - dist3D) / this.c * 1e9);
        } else {
            const sideScatterDistance = Math.hypot(dist2D, dz) * (isLOS ? 1.03 : 1.12);
            tap3ExcessNs = Math.max(0, (sideScatterDistance - dist3D) / this.c * 1e9);
        }
        const tap2PowerDb = isLOS ? -6.0 : -3.5;
        const tap3PowerDb = isLOS ? -14.5 : -8.5;
        const multipath = [
            { tap: 1, delayNs: 0.0, powerRatioDb: 0.0 },
            { tap: 2, delayNs: parseFloat(tap2ExcessNs.toFixed(2)), powerRatioDb: tap2PowerDb },
            { tap: 3, delayNs: parseFloat(tap3ExcessNs.toFixed(2)), powerRatioDb: tap3PowerDb }
        ];
        const tapPowers = multipath.map(tap => Math.pow(10, tap.powerRatioDb / 10));
        const totalTapPower = tapPowers.reduce((sum, power) => sum + power, 0);
        const meanTapDelay = multipath.reduce((sum, tap, index) => sum + tap.delayNs * tapPowers[index], 0) / totalTapPower;
        const rmsDelaySpreadNs = Math.sqrt(multipath.reduce((sum, tap, index) => sum + tapPowers[index] * Math.pow(tap.delayNs - meanTapDelay, 2), 0) / totalTapPower);

        // 5. Doppler Shift (Hz)
        const ux = dx / geometricDist3D;
        const uy = dy / geometricDist3D;
        const uz = dz / geometricDist3D;
        const vRadial = vxRel * ux + vyRel * uy + vzRel * uz;
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
        const count = nodes.length;
        const matrix = Array.from({ length: count }, () => Array(count));
        for (let i = 0; i < count; i++) {
            matrix[i][i] = this.computeLink(nodes[i], nodes[i], dt, terrain);
            for (let j = i + 1; j < count; j++) {
                const forward = this.computeLink(nodes[i], nodes[j], dt, terrain);
                const obstructionPoint = forward.obstructionPoint
                    ? { ...forward.obstructionPoint, d1: forward.obstructionPoint.d2, d2: forward.obstructionPoint.d1 }
                    : null;
                matrix[i][j] = forward;
                matrix[j][i] = {
                    ...forward,
                    source: nodes[j].id,
                    target: nodes[i].id,
                    dopplerHz: -forward.dopplerHz,
                    elevationA: forward.elevationB,
                    elevationB: forward.elevationA,
                    obstructionPoint
                };
            }
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
