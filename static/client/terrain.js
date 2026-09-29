/**
 * OCTAGON Tactical Terrain Simulation Engine
 * Munjeong Station (문정역 & 문정 법조단지 / 테라타워 / 탄천 / 컬처밸리)
 * 3D Tactical Terrain & Wireless LOS/Diffraction Simulation Model
 */

class TacticalTerrain {
    constructor(preset = 'munjeong') {
        this.preset = preset;
        this.features = [];
        this.forests = [];
        this.structures = [];
        this.river = null;
        this.metroLine = null;
        this.cultureValley = null;
        this.roads = [];
        this.osmFeatures = [];
        this.demGrid = null;
        this.structureIndex = null;
        this.mapLoadStatus = 'loading';
        this.loadPreset(preset);
    }

    loadPreset(preset = 'munjeong') {
        this.preset = preset;
        this.features = [];
        this.forests = [];
        this.structures = [];
        this.river = null;
        this.metroLine = null;
        this.cultureValley = null;
        this.roads = [];

        if (preset === 'munjeong') {
            // [문정역 / 문정 법조타운 실지형 데이터 기반 모델]
            // 지리적 특징:
            // 1. 송파대로 (X = -20 ~ 0 세로축)
            // 2. 지하철 8호선 문정역 (X: -10, Y: -10)
            // 3. 문정 컬처밸리 선큰 보행통로 (폭 30m, 길이 390m 보행자 전용 저지대 광장: X: 15 ~ 160, Y: -10)
            // 4. 서울동부지방법원 & 서울동부지방검찰청 대형 행정청사군 (동측 X: 140~220, Y: -40~60, 고도 45m~55m)
            // 5. 문정 테라타워 1·2차, 엠스테이트, 현대지식산업센터 (X: 10~110, Y: -80~90, 고도 60m~75m 하이퍼 클러스터)
            // 6. 서측 탄천 수변공원 저지대 (X: -160 ~ -230, 고도 14m)
            // 7. 장지천 합류부 남측 (Y: -160, 고도 16m)
            // 8. 문정근린공원 녹지대 (Foliage Clutter, 동북측 X: 40~120, Y: 130~180)

            // 문정역 주변은 탄천 동측의 낮고 완만한 도시 평탄지다.
            // 6km 영역에서는 지역의 완만한 동향 경사만 이어가고, 근거리 경사는 부드럽게 감쇠한다.
            this.features = [];

            // 탄천 (서측 남북 관통 하천, 폭 32m)
            this.river = {
                name: "탄천 (Tancheon River)",
                points: [
                    { x: -250, y: 3000 },
                    { x: -225, y: 2200 },
                    { x: -205, y: 1400 },
                    { x: -190, y: 700 },
                    { x: -190, y: 220 },
                    { x: -180, y: 120 },
                    { x: -185, y: 0 },
                    { x: -200, y: -120 },
                    { x: -220, y: -220 },
                    { x: -245, y: -700 },
                    { x: -270, y: -1400 },
                    { x: -300, y: -2200 },
                    { x: -330, y: -3000 }
                ],
                width: 32,
                waterElev: 13.5
            };

            // 주요 도로망 (송파대로 & 문정로)
            this.roads = [
                { name: "송파대로 (Songpa-daero)", x1: -15, y1: -240, x2: -15, y2: 240, width: 22 },
                { name: "법원로 (Beobwon-ro)", x1: -15, y1: 5, x2: 240, y2: 5, width: 14 },
                { name: "동남로 (Dongnam-ro)", x1: -180, y1: 150, x2: 240, y2: 150, width: 16 }
            ];

            // 문정 컬처밸리 선큰 광장 (지하 1층/지상 오픈 스트리트형 밸리, 깊이 4m 선큰)
            this.cultureValley = {
                name: "문정 컬처밸리 (Culture Valley)",
                x: 80,
                y: 0,
                w: 150,
                h: 28,
                depth: 4.5
            };

            // 수목림 / 완충 녹지 (탄천 수변 식생대 & 문정근린공원)
            this.forests = [
                { x: -155, y: 30, rx: 25, ry: 90, attenuationDbPerM: 0.32, label: "탄천 수변 생태숲" },
                { x: 90, y: 150, rx: 45, ry: 30, attenuationDbPerM: 0.38, label: "문정근린공원 수림대" },
                { x: 190, y: -110, rx: 35, ry: 35, attenuationDbPerM: 0.30, label: "글샘공원 녹지" }
            ];

            // 문정역 주변 실제 랜드마크 빌딩 및 전술 구조물 (군/관 합동 통신 차폐 장애물)
            this.structures = [
                // 문정역 환승 복합 및 엠스테이트 (M-State)
                { id: 'mstate', x: 25, y: -35, w: 55, h: 40, height: 62, baseElev: 23, label: "엠스테이트 (M-State, 62m)", color: '#1e3852' },
                // 문정 테라타워 1차 (대규모 지식산업센터)
                { id: 'tera1', x: 30, y: 45, w: 60, h: 50, height: 68, baseElev: 24, label: "테라타워 1차 (Tera Tower 1, 68m)", color: '#1e405a' },
                // 문정 테라타워 2차
                { id: 'tera2', x: -65, y: 70, w: 45, h: 40, height: 65, baseElev: 22, label: "테라타워 2차 (Tera Tower 2, 65m)", color: '#203c54' },
                // 서울동부지방법원 청사 본관
                { id: 'court', x: 150, y: 40, w: 70, h: 55, height: 52, baseElev: 27, label: "서울동부지방법원 (Court, 52m)", color: '#273a4b' },
                // 서울동부지방검찰청
                { id: 'prosecutor', x: 155, y: -45, w: 65, h: 48, height: 50, baseElev: 26, label: "서울동부지방검찰청 (Prosecutor, 50m)", color: '#293748' },
                // 현대지식산업센터 (H Business Park)
                { id: 'hbusiness', x: 95, y: -80, w: 65, h: 45, height: 60, baseElev: 24, label: "H-비즈니스파크 (60m)", color: '#1f3448' },
                // 문정 SK V1 GL메트로시티
                { id: 'skv1', x: 85, y: 95, w: 50, h: 40, height: 65, baseElev: 25, label: "문정 SK V1 메트로 (65m)", color: '#22384a' },
                // 문정역 역사 시설 (지상 환기구/출구 구조물)
                { id: 'station', x: -12, y: -10, w: 22, h: 18, height: 9, baseElev: 22, label: "문정역 (Munjeong Stn, 9m)", color: '#b83b3b' }
            ];

        } else if (preset === 'ridge_valley') {
            // 전술 산악 협곡 고지 프리셋
            this.features = [
                { type: 'peak', x: -30, y: 70, height: 58, radiusX: 55, radiusY: 45, angle: 0.3, label: "58고지" },
                { type: 'ridge', x: 0, y: 0, height: 42, length: 180, width: 45, angle: Math.PI / 4, label: "주능선" },
                { type: 'peak', x: 45, y: -65, height: 48, radiusX: 50, radiusY: 50, angle: 0, label: "48고지" }
            ];
            this.river = {
                name: "협곡 수계",
                points: [{ x: -140, y: -100 }, { x: -70, y: -60 }, { x: 30, y: -120 }, { x: 100, y: -140 }],
                width: 14,
                waterElev: 2.0
            };
            this.forests = [
                { x: -65, y: 35, rx: 35, ry: 25, attenuationDbPerM: 0.35, label: "Fox 섹터 숲" }
            ];
            this.structures = [
                { id: 'bunker1', x: -85, y: -20, w: 18, h: 14, height: 12, baseElev: 10, label: "전술벙커 OP", color: '#3f453a' }
            ];
        } else {
            // Flat 평지
            this.features = [];
            this.forests = [];
            this.structures = [];
            this.river = null;
        }
    }

    getElevation(x, y) {
        let z = 0.0;

        if (this.preset === 'munjeong') {
            if (this.demGrid && x >= -3000 && x <= 3000 && y >= -3000 && y <= 3000) {
                const gx = (x + 3000) / this.demGrid.step;
                const gy = (y + 3000) / this.demGrid.step;
                const x0 = Math.min(Math.floor(gx), 39), y0 = Math.min(Math.floor(gy), 39);
                const tx = gx - x0, ty = gy - y0, n = this.demGrid.columns;
                const at = (ix, iy) => this.demGrid.values[iy * n + ix];
                const a = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
                const b = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
                return a * (1 - ty) + b * ty;
            }
            // 지역의 낮은 동향 경사와 문정역 인근의 완만한 기복을 결합한다.
            // 근거리에서는 기존 고도 차이를 유지하고, 수 km 범위에서 경사가 과장되지 않도록 감쇠한다.
            z = 23.0 + (x * 0.0015) + (y * 0.0005)
                + (x * 0.035 / (1 + Math.abs(x) / 500))
                + (y * 0.008 / (1 + Math.abs(y) / 500));

            // 탄천 하천 저지대 감고
            if (this.river) {
                const dRiver = this.distToRiver(x, y);
                if (dRiver < this.river.width * 1.5) {
                    const depth = (1.0 - dRiver / (this.river.width * 1.5));
                    z -= depth * 9.5; // 탄천 수면 근처로 하강
                }
            }

            // 문정 컬처밸리 선큰 보행로 (지하 오픈 통로 감고)
            if (this.cultureValley) {
                const cv = this.cultureValley;
                if (x >= cv.x - cv.w / 2 && x <= cv.x + cv.w / 2 &&
                    y >= cv.y - cv.h / 2 && y <= cv.y + cv.h / 2) {
                    z -= cv.depth;
                }
            }

            // 구릉지 지형 추가
            for (const feat of this.features) {
                if (feat.type === 'peak') {
                    const dx = x - feat.x;
                    const dy = y - feat.y;
                    const r2 = (dx * dx) / (feat.radiusX * feat.radiusX) + (dy * dy) / (feat.radiusY * feat.radiusY);
                    if (r2 < 4.0) {
                        z += feat.height * Math.exp(-r2 * 1.2);
                    }
                }
            }
            return Math.max(12.0, z);
        }

        // 산악 릿지 모델
        for (const feat of this.features) {
            if (feat.type === 'peak') {
                const dx = x - feat.x;
                const dy = y - feat.y;
                const r2 = (dx * dx) / (feat.radiusX * feat.radiusX) + (dy * dy) / (feat.radiusY * feat.radiusY);
                if (r2 < 4.0) {
                    z += feat.height * Math.exp(-r2 * 1.3);
                }
            } else if (feat.type === 'ridge') {
                const dx = x - feat.x;
                const dy = y - feat.y;
                const cosA = Math.cos(feat.angle);
                const sinA = Math.sin(feat.angle);
                const along = (dx * cosA + dy * sinA);
                const across = (-dx * sinA + dy * cosA);
                const halfLen = feat.length / 2;
                let distAlong = 0;
                if (along > halfLen) distAlong = along - halfLen;
                else if (along < -halfLen) distAlong = -along - halfLen;
                const r2 = (distAlong * distAlong) / (feat.width * feat.width) + (across * across) / (feat.width * feat.width * 0.45);
                if (r2 < 4.0) {
                    z += feat.height * Math.exp(-r2 * 1.5);
                }
            }
        }
        return Math.max(0.0, z);
    }

    distToRiver(x, y) {
        if (!this.river || !this.river.points || this.river.points.length < 2) return 9999;
        let minDist = 9999;
        const pts = this.river.points;
        for (let i = 0; i < pts.length - 1; i++) {
            const d = this.distToSegment(x, y, pts[i].x, pts[i].y, pts[i+1].x, pts[i+1].y);
            if (d < minDist) minDist = d;
        }
        return minDist;
    }

    distToSegment(px, py, x1, y1, x2, y2) {
        const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
        if (l2 === 0) return Math.hypot(px - x1, py - y1);
        let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
    }

    getForestAt(x, y) {
        for (const f of this.forests) {
            const dx = (x - f.x) / f.rx;
            const dy = (y - f.y) / f.ry;
            if (dx * dx + dy * dy <= 1.0) return f;
        }
        return null;
    }

    getStructureAt(x, y) {
        const candidates = this.structureIndex
            ? (this.structureIndex.get(`${Math.floor(x / 100)}:${Math.floor(y / 100)}`) || [])
            : this.structures;
        for (const s of candidates) {
            if (s.footprint) {
                let inside = false;
                for (let i = 0, j = s.footprint.length - 1; i < s.footprint.length; j = i++) {
                    const a = s.footprint[i], b = s.footprint[j];
                    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
                }
                if (inside) return s;
                continue;
            }
            if (x >= s.x - s.w / 2 && x <= s.x + s.w / 2 &&
                y >= s.y - s.h / 2 && y <= s.y + s.h / 2) {
                return s;
            }
        }
        return null;
    }

    /**
     * 3D Ray-Terrain & Building Obstruction Line-of-Sight (LOS/NLOS) Analysis
     */
    analyzePath(nodeA, nodeB, antennaHeight = 2.0, wavelength = 0.125) {
        const x1 = nodeA.x, y1 = nodeA.y;
        const x2 = nodeB.x, y2 = nodeB.y;

        const elev1 = this.getElevation(x1, y1);
        const elev2 = this.getElevation(x2, y2);

        const z1 = elev1 + antennaHeight;
        const z2 = elev2 + antennaHeight;

        const dist2D = Math.hypot(x2 - x1, y2 - y1);
        const dist3D = Math.hypot(dist2D, z2 - z1);

        if (dist2D < 1.0) {
            return {
                isLOS: true,
                dist3D: dist3D,
                elevationA: elev1,
                elevationB: elev2,
                diffractionLossDb: 0.0,
                foliageLossDb: 0.0,
                totalTerrainLossDb: 0.0,
                obstructionPoint: null,
                obstructingBuilding: null,
                clearanceM: antennaHeight
            };
        }

        // Ray Marching along 3D Vector
        const sampleStepM = Math.max(1.0, dist2D / 70.0);
        const numSteps = Math.floor(dist2D / sampleStepM);

        let minClearance = 9999;
        let worstObs = null;
        let hitBuilding = null;
        let foliageDist = 0.0;
        let isLOS = true;

        for (let i = 1; i < numSteps; i++) {
            const t = i / numSteps;
            const sx = x1 + t * (x2 - x1);
            const sy = y1 + t * (y2 - y1);
            const rayZ = z1 + t * (z2 - z1);

            let groundZ = this.getElevation(sx, sy);
            let obstacleTopZ = groundZ;

            // 빌딩 차폐 검사
            const struct = this.getStructureAt(sx, sy);
            if (struct) {
                obstacleTopZ = groundZ + struct.height;
                if (rayZ < obstacleTopZ) {
                    hitBuilding = struct;
                }
            }

            const clearance = rayZ - obstacleTopZ;
            if (clearance < minClearance) {
                minClearance = clearance;
                worstObs = {
                    x: sx,
                    y: sy,
                    terrainZ: obstacleTopZ,
                    rayZ: rayZ,
                    penetrationM: -clearance,
                    d1: t * dist2D,
                    d2: (1 - t) * dist2D,
                    building: struct ? struct.label : null
                };
            }

            // 수림대 통과 검사
            const forest = this.getForestAt(sx, sy);
            if (forest && rayZ <= groundZ + 12.0) {
                foliageDist += sampleStepM;
            }
        }

        // 칼날 회절 손실 (ITU-R P.526 Knife-edge diffraction)
        let diffractionLossDb = 0.0;
        if (minClearance < 0.0 && worstObs) {
            isLOS = false;
            const h = worstObs.penetrationM;
            const d1 = Math.max(worstObs.d1, 1.0);
            const d2 = Math.max(worstObs.d2, 1.0);
            const v = h * Math.sqrt((2.0 / wavelength) * (1.0 / d1 + 1.0 / d2));
            if (v > -0.7) {
                diffractionLossDb = 6.9 + 20.0 * Math.log10(Math.sqrt((v - 0.1) * (v - 0.1) + 1.0) + v - 0.1);
                diffractionLossDb = Math.max(0.0, Math.min(diffractionLossDb, 45.0));
            }
        }

        const foliageLossDb = Math.min(foliageDist * 0.32, 25.0);
        const totalTerrainLossDb = parseFloat((diffractionLossDb + foliageLossDb).toFixed(2));

        return {
            isLOS: isLOS,
            dist3D: parseFloat(dist3D.toFixed(2)),
            elevationA: parseFloat(elev1.toFixed(1)),
            elevationB: parseFloat(elev2.toFixed(1)),
            diffractionLossDb: parseFloat(diffractionLossDb.toFixed(2)),
            foliageLossDb: parseFloat(foliageLossDb.toFixed(2)),
            totalTerrainLossDb: totalTerrainLossDb,
            obstructionPoint: isLOS ? null : {
                x: parseFloat(worstObs.x.toFixed(1)),
                y: parseFloat(worstObs.y.toFixed(1)),
                z: parseFloat(worstObs.terrainZ.toFixed(1)),
                penetration: parseFloat(worstObs.penetrationM.toFixed(1)),
                building: worstObs.building
            },
            obstructingBuilding: hitBuilding ? hitBuilding.label : null,
            clearanceM: parseFloat(minClearance.toFixed(1))
        };
    }

    /**
     * 2D 전술 지도 렌더러 (하천, 도로, 빌딩 풋프린트, 등고선)
     */
    render2D(ctx, worldToScreen, screenToWorld, w, h, pixelsPerMeter, showContours = true) {
        if (this.preset === 'flat') return;

        // 1. 탄천 하천 수계
        if (this.river && this.river.points.length >= 2) {
            ctx.save();
            ctx.strokeStyle = 'rgba(0, 160, 255, 0.35)';
            ctx.lineWidth = Math.max(6, this.river.width * pixelsPerMeter);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            const p0 = worldToScreen(this.river.points[0].x, this.river.points[0].y);
            ctx.moveTo(p0.x, p0.y);
            for (let i = 1; i < this.river.points.length; i++) {
                const pt = worldToScreen(this.river.points[i].x, this.river.points[i].y);
                ctx.lineTo(pt.x, pt.y);
            }
            ctx.stroke();

            // 하천 내부 흐름선
            ctx.strokeStyle = 'rgba(0, 220, 255, 0.65)';
            ctx.lineWidth = 2.5;
            ctx.stroke();

            const midP = worldToScreen(this.river.points[2].x, this.river.points[2].y);
            ctx.fillStyle = 'rgba(0, 230, 255, 0.85)';
            ctx.font = 'bold 11px "JetBrains Mono", monospace';
            ctx.fillText(`🌊 ${this.river.name} (13.5m)`, midP.x + 18, midP.y);
            ctx.restore();
        }

        // 2. 주요 도로망 (송파대로, 법원로 등)
        for (const road of this.roads) {
            const p1 = worldToScreen(road.x1, road.y1);
            const p2 = worldToScreen(road.x2, road.y2);
            ctx.save();
            ctx.strokeStyle = 'rgba(70, 90, 115, 0.45)';
            ctx.lineWidth = Math.max(4, road.width * pixelsPerMeter);
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();

            // 도로 중앙선 (점선)
            ctx.strokeStyle = 'rgba(255, 215, 0, 0.4)';
            ctx.lineWidth = 1.2;
            ctx.setLineDash([8, 8]);
            ctx.stroke();
            ctx.restore();
        }

        // 3. 문정 컬처밸리 선큰 보행통로
        if (this.cultureValley) {
            const cv = this.cultureValley;
            const sp = worldToScreen(cv.x, cv.y);
            const sw = cv.w * pixelsPerMeter;
            const sh = cv.h * pixelsPerMeter;
            ctx.save();
            ctx.fillStyle = 'rgba(30, 70, 60, 0.35)';
            ctx.fillRect(sp.x - sw / 2, sp.y - sh / 2, sw, sh);
            ctx.strokeStyle = 'rgba(0, 255, 170, 0.45)';
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(sp.x - sw / 2, sp.y - sh / 2, sw, sh);

            ctx.fillStyle = 'rgba(0, 255, 170, 0.8)';
            ctx.font = '10px "JetBrains Mono", monospace';
            ctx.fillText("🌿 문정 컬처밸리 (Sunken Plaza -4.5m)", sp.x - sw / 2 + 10, sp.y + 4);
            ctx.restore();
        }

        // 4. 수목림 (탄천 수변숲 / 문정근린공원)
        for (const f of this.forests) {
            const sp = worldToScreen(f.x, f.y);
            const srx = f.rx * pixelsPerMeter;
            const sry = f.ry * pixelsPerMeter;
            ctx.save();
            ctx.beginPath();
            ctx.ellipse(sp.x, sp.y, srx, sry, 0, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(16, 92, 45, 0.25)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(0, 255, 136, 0.4)';
            ctx.lineWidth = 1.2;
            ctx.setLineDash([4, 4]);
            ctx.stroke();

            ctx.fillStyle = 'rgba(0, 255, 136, 0.75)';
            ctx.font = '9px "JetBrains Mono", monospace';
            ctx.fillText(`🌲 ${f.label}`, sp.x - srx * 0.7, sp.y);
            ctx.restore();
        }

        // 5. 문정역 및 법조타운/지식산업센터 빌딩 (3D 입체 섀도우 풋프린트)
        for (const s of this.structures) {
            const sp = worldToScreen(s.x, s.y);
            const footprint = s.footprint || [
                { x: s.x - s.w / 2, y: s.y - s.h / 2 }, { x: s.x + s.w / 2, y: s.y - s.h / 2 },
                { x: s.x + s.w / 2, y: s.y + s.h / 2 }, { x: s.x - s.w / 2, y: s.y + s.h / 2 }
            ];
            const outline = footprint.map(point => worldToScreen(point.x, point.y));
            const minX = Math.min(...outline.map(point => point.x)), maxX = Math.max(...outline.map(point => point.x));
            const minY = Math.min(...outline.map(point => point.y)), maxY = Math.max(...outline.map(point => point.y));
            if (maxX < 0 || minX > ctx.canvas.width || maxY < 0 || minY > ctx.canvas.height) continue;

            ctx.save();
            // 빌딩 그림자
            const shadowOff = Math.min(s.height * 0.25 * pixelsPerMeter, 18);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
            ctx.beginPath();
            outline.forEach((point, index) => index ? ctx.lineTo(point.x + shadowOff, point.y + shadowOff) : ctx.moveTo(point.x + shadowOff, point.y + shadowOff));
            ctx.closePath(); ctx.fill();

            // 빌딩 본체 (어두운 네이비 슬레이트)
            ctx.fillStyle = s.color || (s.estimatedHeight ? 'rgba(47, 58, 68, 0.9)' : 'rgba(25, 40, 60, 0.85)');
            ctx.beginPath();
            outline.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
            ctx.closePath(); ctx.fill();

            // 빌딩 테두리 및 옥상 프레임
            ctx.strokeStyle = s.id === 'station' ? '#ff3366' : (s.estimatedHeight ? 'rgba(130, 150, 165, 0.7)' : 'rgba(0, 210, 255, 0.7)');
            ctx.lineWidth = s.id === 'station' ? 2.0 : 1.2;
            ctx.stroke();

            // 라벨
            ctx.fillStyle = s.id === 'station' ? '#ff6b8b' : '#ffcf40';
            ctx.font = 'bold 10px "JetBrains Mono", monospace';
            if (!s.footprint || s.height >= 25) ctx.fillText(`🏢 ${s.label}${s.estimatedHeight ? ' ~' : ''}`, minX + 4, minY - 5);
            ctx.restore();
        }

        // 6. 등고선
        if (showContours) {
            this.renderContours(ctx, worldToScreen, screenToWorld, w, h, pixelsPerMeter);
        }
    }

    renderContours(ctx, worldToScreen, screenToWorld, w, h, pixelsPerMeter) {
        ctx.save();
        const topLeft = screenToWorld(0, 0);
        const bottomRight = screenToWorld(w, h);
        const minX = Math.min(topLeft.x, bottomRight.x) - 10;
        const maxX = Math.max(topLeft.x, bottomRight.x) + 10;
        const minY = Math.min(topLeft.y, bottomRight.y) - 10;
        const maxY = Math.max(topLeft.y, bottomRight.y) + 10;

        const gridStepM = Math.max(6.0, 20.0 / (pixelsPerMeter / 3.0));
        const cols = Math.ceil((maxX - minX) / gridStepM);
        const rows = Math.ceil((maxY - minY) / gridStepM);

        if (cols > 65 || rows > 65) {
            ctx.restore();
            return;
        }

        const grid = [];
        for (let r = 0; r <= rows; r++) {
            const row = [];
            const wy = minY + r * gridStepM;
            for (let c = 0; c <= cols; c++) {
                const wx = minX + c * gridStepM;
                row.push(this.getElevation(wx, wy));
            }
            grid.push(row);
        }

        const levels = [15, 20, 25, 30, 35, 45];
        for (const level of levels) {
            ctx.strokeStyle = level % 10 === 0 ? 'rgba(212, 175, 55, 0.35)' : 'rgba(150, 130, 80, 0.18)';
            ctx.lineWidth = level % 10 === 0 ? 1.2 : 0.8;
            ctx.beginPath();
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const z0 = grid[r][c];
                    const z1 = grid[r][c+1];
                    const z2 = grid[r+1][c+1];
                    const z3 = grid[r+1][c];
                    let mask = 0;
                    if (z0 >= level) mask |= 1;
                    if (z1 >= level) mask |= 2;
                    if (z2 >= level) mask |= 4;
                    if (z3 >= level) mask |= 8;
                    if (mask === 0 || mask === 15) continue;

                    const wx0 = minX + c * gridStepM;
                    const wy0 = minY + r * gridStepM;
                    const wx1 = wx0 + gridStepM;
                    const wy1 = wy0 + gridStepM;

                    const pTop = worldToScreen(wx0 + gridStepM * this.lerp(z0, z1, level), wy0);
                    const pRight = worldToScreen(wx1, wy0 + gridStepM * this.lerp(z1, z2, level));
                    const pBottom = worldToScreen(wx0 + gridStepM * this.lerp(z3, z2, level), wy1);
                    const pLeft = worldToScreen(wx0, wy0 + gridStepM * this.lerp(z0, z3, level));

                    if (mask === 1 || mask === 14) { ctx.moveTo(pLeft.x, pLeft.y); ctx.lineTo(pTop.x, pTop.y); }
                    else if (mask === 2 || mask === 13) { ctx.moveTo(pTop.x, pTop.y); ctx.lineTo(pRight.x, pRight.y); }
                    else if (mask === 3 || mask === 12) { ctx.moveTo(pLeft.x, pLeft.y); ctx.lineTo(pRight.x, pRight.y); }
                    else if (mask === 4 || mask === 11) { ctx.moveTo(pRight.x, pRight.y); ctx.lineTo(pBottom.x, pBottom.y); }
                    else if (mask === 5) { ctx.moveTo(pLeft.x, pLeft.y); ctx.lineTo(pTop.x, pTop.y); ctx.moveTo(pRight.x, pRight.y); ctx.lineTo(pBottom.x, pBottom.y); }
                    else if (mask === 6 || mask === 9) { ctx.moveTo(pTop.x, pTop.y); ctx.lineTo(pBottom.x, pBottom.y); }
                    else if (mask === 7 || mask === 8) { ctx.moveTo(pLeft.x, pLeft.y); ctx.lineTo(pBottom.x, pBottom.y); }
                }
            }
            ctx.stroke();
        }
        ctx.restore();
    }

    lerp(v0, v1, level) {
        if (Math.abs(v1 - v0) < 0.001) return 0.5;
        return Math.max(0, Math.min(1, (level - v0) / (v1 - v0)));
    }

    /**
     * 3D 원근 뷰포트 (Isometric/Tactical 3D Perspective) 렌더러
     * 카메라 파라미터 (pitch, yaw, distance, targetX, targetY)를 받아 빌딩 입체 폴리곤과 지표면 와이어프레임 렌더링
     */
    render3D(ctx, w, h, camera, nodes, links, selectedNodeId) {
        ctx.save();
        ctx.fillStyle = '#060a0f';
        ctx.fillRect(0, 0, w, h);

        const { pitch = 40 * Math.PI / 180, yaw = -35 * Math.PI / 180, zoom = 1.0, cx = 0, cy = 0 } = camera;
        const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
        const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
        const fov = 1100 * zoom;

        // 3D 월드 좌표 (x: 동/서, y: 남/북, z: 고도) -> 2D 화면 투영
        const project3D = (wx, wy, wz) => {
            const rx = wx - cx;
            const ry = wy - cy;
            const rz = wz;

            // Yaw 회전
            const xRot = rx * cosY - ry * sinY;
            const yRot = rx * sinY + ry * cosY;

            // Pitch 회전
            const camY = yRot * cosP - rz * sinP;
            const camZ = yRot * sinP + rz * cosP + 8000; // 광역 지형이 한 화면에 들어오도록 원거리 투영

            const scale = fov / Math.max(camZ, 10.0);
            return {
                x: w / 2 + xRot * scale,
                y: h / 2 - camY * scale,
                depth: camZ
            };
        };

        // 1. 지표면 격자 (3D 와이어프레임 메쉬 & 탄천 표현)
        // 문정역 중심의 6km × 6km 광역 지형 (±3km), 약 150m 간격 메쉬
        const gridSize = 3000;
        const step = 150;
        ctx.strokeStyle = 'rgba(25, 45, 65, 0.45)';
        ctx.lineWidth = 1.0;

        for (let x = -gridSize; x <= gridSize; x += step) {
            ctx.beginPath();
            let started = false;
            for (let y = -gridSize; y <= gridSize; y += step) {
                const z = this.getElevation(x, y);
                const p = project3D(x, y, z);
                if (!started) { ctx.moveTo(p.x, p.y); started = true; }
                else ctx.lineTo(p.x, p.y);
            }
            ctx.stroke();
        }

        for (let y = -gridSize; y <= gridSize; y += step) {
            ctx.beginPath();
            let started = false;
            for (let x = -gridSize; x <= gridSize; x += step) {
                const z = this.getElevation(x, y);
                const p = project3D(x, y, z);
                if (!started) { ctx.moveTo(p.x, p.y); started = true; }
                else ctx.lineTo(p.x, p.y);
            }
            ctx.stroke();
        }

        // 탄천 3D 수면
        if (this.river) {
            ctx.strokeStyle = 'rgba(0, 180, 255, 0.7)';
            ctx.lineWidth = 4.0;
            ctx.beginPath();
            let started = false;
            for (const pt of this.river.points) {
                const p = project3D(pt.x, pt.y, this.river.waterElev);
                if (!started) { ctx.moveTo(p.x, p.y); started = true; }
                else ctx.lineTo(p.x, p.y);
            }
            ctx.stroke();
        }

        // 2. 문정역 법조타운 3D 빌딩 솔리드 렌더링 (Z-sort)
        const sortedStructures = [...this.structures].sort((a, b) => {
            const pa = project3D(a.x, a.y, this.getElevation(a.x, a.y) + a.height);
            const pb = project3D(b.x, b.y, this.getElevation(b.x, b.y) + b.height);
            return pb.depth - pa.depth;
        });

        // 실제 OSM 도로와 수계를 3D 지표면 위에 표시한다.
        for (const feature of this.osmFeatures) {
            if (feature.kind === 'building' || feature.points.length < 2) continue;
            ctx.beginPath();
            feature.points.forEach((point, index) => {
                const p = project3D(point.x, point.y, this.getElevation(point.x, point.y) + 0.8);
                if (index === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
            });
            ctx.strokeStyle = feature.kind === 'water' ? 'rgba(0, 180, 255, 0.8)' : 'rgba(133, 151, 166, 0.36)';
            ctx.lineWidth = feature.kind === 'water' ? 3 : (['motorway', 'trunk', 'primary', 'secondary'].includes(feature.highway) ? 1.8 : 0.8);
            ctx.stroke();
        }

        for (const s of sortedStructures) {
            const baseZ = this.getElevation(s.x, s.y);
            const topZ = baseZ + s.height;
            const footprint = s.footprint || [
                { x: s.x - s.w / 2, y: s.y - s.h / 2 }, { x: s.x + s.w / 2, y: s.y - s.h / 2 },
                { x: s.x + s.w / 2, y: s.y + s.h / 2 }, { x: s.x - s.w / 2, y: s.y + s.h / 2 }
            ];
            const base = footprint.map(p => project3D(p.x, p.y, this.getElevation(p.x, p.y)));
            const roof = footprint.map(p => project3D(p.x, p.y, this.getElevation(p.x, p.y) + s.height));
            const centerPoint = project3D(s.x, s.y, topZ);
            if (centerPoint.x < -1000 || centerPoint.x > w + 1000 || centerPoint.y < -1000 || centerPoint.y > h + 1000) continue;

            // 벽면 채우기
            const drawWall = (pA, pB, pC, pD, fill, stroke) => {
                ctx.beginPath();
                ctx.moveTo(pA.x, pA.y);
                ctx.lineTo(pB.x, pB.y);
                ctx.lineTo(pC.x, pC.y);
                ctx.lineTo(pD.x, pD.y);
                ctx.closePath();
                ctx.fillStyle = fill;
                ctx.fill();
                ctx.strokeStyle = stroke;
                ctx.stroke();
            };

            // OSM 실제 외곽선을 따라 건물 벽과 지붕을 입체화한다.
            for (let i = 0; i < base.length; i++) {
                const next = (i + 1) % base.length;
                drawWall(base[i], base[next], roof[next], roof[i], 'rgba(18, 32, 48, 0.85)', 'rgba(0, 200, 255, 0.32)');
            }

            // 옥상 상판 (하이라이트)
            ctx.beginPath();
            ctx.moveTo(roof[0].x, roof[0].y);
            for (let i = 1; i < roof.length; i++) ctx.lineTo(roof[i].x, roof[i].y);
            ctx.closePath();
            ctx.fillStyle = s.id === 'station' ? 'rgba(180, 40, 60, 0.9)' : (s.estimatedHeight ? 'rgba(48, 57, 68, 0.95)' : 'rgba(38, 62, 90, 0.95)');
            ctx.fill();
            ctx.strokeStyle = s.id === 'station' ? '#ff3366' : (s.estimatedHeight ? '#657789' : '#00d2ff');
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // 3D 빌딩 라벨
            ctx.fillStyle = '#ffcf40';
            ctx.font = 'bold 10px "JetBrains Mono", monospace';
            if (s.footprint && (centerPoint.x > 0 && centerPoint.x < w && centerPoint.y > 0 && centerPoint.y < h) && s.height > 25) {
                ctx.fillText(`⌂ ${s.label}${s.estimatedHeight ? ' ~' : ''}`, roof[0].x, roof[0].y - 6);
            } else if (!s.footprint) {
                ctx.fillText(`⌂ ${s.label}`, roof[0].x, roof[0].y - 6);
            }
        }

        // 3. 무선 링크 (LOS는 형광 녹색 실선, NLOS/차폐는 붉은색 점선 & 차폐점 표시)
        if (links && links.length > 0) {
            for (let i = 0; i < nodes.length; i++) {
                const nA = nodes[i];
                const zA = this.getElevation(nA.x, nA.y) + 2.0;
                const pA = project3D(nA.x, nA.y, zA);

                for (let j = i + 1; j < nodes.length; j++) {
                    const nB = nodes[j];
                    const zB = this.getElevation(nB.x, nB.y) + 2.0;
                    const pB = project3D(nB.x, nB.y, zB);

                    const link = links[i][j];
                    if (!link) continue;

                    const isSel = (nA.id === selectedNodeId || nB.id === selectedNodeId);
                    ctx.save();
                    if (link.isLOS) {
                        ctx.strokeStyle = isSel ? '#00ff88' : 'rgba(0, 255, 136, 0.35)';
                        ctx.lineWidth = isSel ? 2.5 : 1.2;
                        ctx.beginPath();
                        ctx.moveTo(pA.x, pA.y);
                        ctx.lineTo(pB.x, pB.y);
                        ctx.stroke();
                    } else {
                        // 차폐 링크 (NLOS)
                        ctx.strokeStyle = isSel ? '#ff3366' : 'rgba(255, 51, 102, 0.35)';
                        ctx.lineWidth = isSel ? 2.2 : 1.0;
                        ctx.setLineDash([5, 5]);
                        ctx.beginPath();
                        ctx.moveTo(pA.x, pA.y);
                        ctx.lineTo(pB.x, pB.y);
                        ctx.stroke();

                        // 3D 차폐 지점 마커
                        if (link.obstructionPoint && isSel) {
                            const pObs = project3D(link.obstructionPoint.x, link.obstructionPoint.y, link.obstructionPoint.z);
                            ctx.fillStyle = '#ff0055';
                            ctx.beginPath();
                            ctx.arc(pObs.x, pObs.y, 5, 0, Math.PI * 2);
                            ctx.fill();
                            ctx.fillStyle = '#fff';
                            ctx.font = 'bold 9px monospace';
                            ctx.fillText(`⚔ 차폐 (+${link.diffractionLossDb}dB)`, pObs.x + 8, pObs.y + 3);
                        }
                    }
                    ctx.restore();
                }
            }
        }

        // 4. 노드 3D 렌더링 (지면 드롭다운 기둥 + 공중 구체)
        for (const n of nodes) {
            const groundZ = this.getElevation(n.x, n.y);
            const nodeZ = groundZ + 2.5; // 안테나 고도

            const pGround = project3D(n.x, n.y, groundZ);
            const pNode = project3D(n.x, n.y, nodeZ);

            const isSel = (n.id === selectedNodeId);

            // 지면 투영 점선 기둥
            ctx.save();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 1.0;
            ctx.setLineDash([2, 3]);
            ctx.beginPath();
            ctx.moveTo(pGround.x, pGround.y);
            ctx.lineTo(pNode.x, pNode.y);
            ctx.stroke();

            // 지면 그림자 서클
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.ellipse(pGround.x, pGround.y, 8, 4, 0, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.fill();

            // 3D 노드 구체 (선택 시 고휘도 펄스)
            ctx.beginPath();
            ctx.arc(pNode.x, pNode.y, isSel ? 11 : 8, 0, Math.PI * 2);
            ctx.fillStyle = n.color;
            ctx.shadowColor = n.color;
            ctx.shadowBlur = isSel ? 16 : 8;
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2.0;
            ctx.stroke();

            // 노드 ID 및 고도 텍스트
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 11px "JetBrains Mono", monospace';
            ctx.fillText(`N${n.id}`, pNode.x - 7, pNode.y - 14);

            ctx.fillStyle = 'var(--accent-cyan)';
            ctx.font = '9px monospace';
            ctx.fillText(`${nodeZ.toFixed(1)}m`, pNode.x - 12, pNode.y + 20);
            ctx.restore();
        }

        ctx.restore();
    }
}

// 브라우저 및 Node 환경 대응
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TacticalTerrain };
} else {
    window.TacticalTerrain = TacticalTerrain;
}
