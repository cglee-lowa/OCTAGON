/**
 * Deterministic terrain model for repeatable tactical RF experiments.
 * Zone effects are intentionally simplified and are not a terrain survey model.
 */
class TacticalTerrain {
    constructor(presetId = 'mixed') {
        this.presets = {
            open: {
                name: 'Open Field',
                zones: []
            },
            woodland: {
                name: 'Woodland',
                zones: [
                    { type: 'woodland', shape: 'circle', x: -12, y: 8, radius: 42, label: 'WOODLAND' }
                ]
            },
            urban: {
                name: 'Built-up Area',
                zones: [
                    { type: 'urban', shape: 'rect', x: -42, y: -30, width: 84, height: 60, label: 'BUILT-UP' }
                ]
            },
            mixed: {
                name: 'Mixed Tactical Range',
                zones: [
                    { type: 'woodland', shape: 'circle', x: -28, y: 24, radius: 22, label: 'WOODLAND' },
                    { type: 'urban', shape: 'rect', x: 14, y: -26, width: 32, height: 28, label: 'BUILT-UP' },
                    { type: 'ridge', shape: 'rect', x: -8, y: -48, width: 12, height: 96, label: 'RIDGE' }
                ]
            }
        };
        this.types = {
            open: { color: 'rgba(69, 125, 76, 0.16)', border: 'rgba(116, 192, 111, 0.55)', attenuationDbPerM: 0, excessSpreadNsPerM: 0, blocksLos: false },
            woodland: { color: 'rgba(49, 99, 59, 0.36)', border: 'rgba(106, 181, 89, 0.8)', attenuationDbPerM: 0.12, excessSpreadNsPerM: 0.22, blocksLos: false },
            urban: { color: 'rgba(128, 94, 70, 0.38)', border: 'rgba(231, 176, 102, 0.85)', attenuationDbPerM: 0.35, excessSpreadNsPerM: 0.55, blocksLos: true },
            ridge: { color: 'rgba(97, 81, 125, 0.34)', border: 'rgba(168, 132, 220, 0.9)', attenuationDbPerM: 0.08, excessSpreadNsPerM: 0.18, blocksLos: true }
        };
        this.setPreset(presetId);
    }

    setPreset(presetId) {
        if (!this.presets[presetId]) {
            throw new Error(`Unknown terrain preset: ${presetId}`);
        }
        this.presetId = presetId;
        this.preset = this.presets[presetId];
    }

    getMetadata() {
        return { id: this.presetId, name: this.preset.name, zoneCount: this.preset.zones.length };
    }

    getZoneAt(x, y) {
        return this.preset.zones.find(zone => {
            if (zone.shape === 'circle') {
                return Math.hypot(x - zone.x, y - zone.y) <= zone.radius;
            }
            return x >= zone.x && x <= zone.x + zone.width && y >= zone.y && y <= zone.y + zone.height;
        });
    }

    evaluateLink(nodeA, nodeB) {
        const dx = nodeB.x - nodeA.x;
        const dy = nodeB.y - nodeA.y;
        const distance = Math.hypot(dx, dy);
        const samples = Math.max(1, Math.ceil(distance / 2));
        const stepM = distance / samples;
        let lossDb = 0;
        let excessSpreadNs = 0;
        let blockedSamples = 0;
        const types = new Set();

        for (let index = 0; index < samples; index++) {
            const fraction = (index + 0.5) / samples;
            const zone = this.getZoneAt(nodeA.x + dx * fraction, nodeA.y + dy * fraction);
            if (!zone) continue;

            const profile = this.types[zone.type];
            lossDb += profile.attenuationDbPerM * stepM;
            excessSpreadNs += profile.excessSpreadNsPerM * stepM;
            if (profile.blocksLos) blockedSamples++;
            types.add(zone.type);
        }

        // A blocker must occupy a meaningful part of the sampled path to remove LOS.
        const isLos = blockedSamples < Math.max(2, samples * 0.08);
        if (!isLos) {
            lossDb += 12;
            excessSpreadNs += 18;
        }

        return {
            terrainLossDb: Number(lossDb.toFixed(2)),
            terrainDelaySpreadNs: Number(excessSpreadNs.toFixed(2)),
            terrainTypes: [...types],
            isLos
        };
    }

    draw(ctx, worldToScreen) {
        for (const zone of this.preset.zones) {
            const profile = this.types[zone.type];
            ctx.save();
            ctx.fillStyle = profile.color;
            ctx.strokeStyle = profile.border;
            ctx.lineWidth = 1.5;

            if (zone.shape === 'circle') {
                const center = worldToScreen(zone.x, zone.y);
                const edge = worldToScreen(zone.x + zone.radius, zone.y);
                ctx.beginPath();
                ctx.arc(center.x, center.y, Math.abs(edge.x - center.x), 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = profile.border;
                ctx.font = 'bold 10px "JetBrains Mono", monospace';
                ctx.textAlign = 'center';
                ctx.fillText(zone.label, center.x, center.y);
            } else {
                const topLeft = worldToScreen(zone.x, zone.y + zone.height);
                const bottomRight = worldToScreen(zone.x + zone.width, zone.y);
                const width = bottomRight.x - topLeft.x;
                const height = bottomRight.y - topLeft.y;
                ctx.fillRect(topLeft.x, topLeft.y, width, height);
                ctx.strokeRect(topLeft.x, topLeft.y, width, height);
                ctx.fillStyle = profile.border;
                ctx.font = 'bold 10px "JetBrains Mono", monospace';
                ctx.textAlign = 'center';
                ctx.fillText(zone.label, topLeft.x + width / 2, topLeft.y + height / 2);
            }
            ctx.restore();
        }
    }
}

window.TacticalTerrain = TacticalTerrain;
