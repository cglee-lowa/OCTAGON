# OCTAGON | MANET Wireless Channel Emulator & Octaman Server (Version 1)

[![Python](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110%2B-009688.svg)](https://fastapi.tiangolo.com/)
[![WebSocket](https://img.shields.io/badge/WebSocket-Realtime%2030Hz-brightgreen.svg)]()
[![License](https://img.shields.io/badge/License-MIT-green.svg)]()

> **MANET(Mobile Ad-hoc Network) 8-Node Real-time Wireless Channel Emulator & Local Server Dashboard**  
> 하드웨어(Octaman) 미구현 상태에서 노드들의 실시간 드래그 이동에 따른 5대 무선 전파 파라미터(**Path Loss, Fading, Propagation Delay, Multipath Profile, Doppler Shift**)를 연산하고, 고속 WebSocket(30Hz)을 통해 로컬 서버와 대시보드에서 검증할 수 있는 소프트웨어 에뮬레이션 패키지입니다.

---

## 📌 목차 (Table of Contents)
1. [시스템 아키텍처](#-시스템-아키텍처-system-architecture)
2. [주요 기능](#-주요-기능-key-features)
3. [무선 채널 모델링 수식](#-무선-채널-모델링-수식-wireless-channel-modeling)
4. [프로젝트 구조](#-프로젝트-구조-project-structure)
5. [설치 및 빠른 시작](#-설치-및-빠른-시작-quick-start)
6. [로컬 통합 배치 가이드](#-로컬-통합-배치-가이드-dual-view-layout)
7. [검증 및 테스트](#-검증-및-테스트-verification--tests)

---

## 🏗 시스템 아키텍처 (System Architecture)

```
┌────────────────────────────────────────────────────────┐
│              Octagon Web App (Client)                  │
│  - CesiumJS World Terrain + OSM 3D Buildings UI                      │
│  - 8-Node Drag & Drop with Instant Velocity Tracking   │
│  - Interactive Pan & Smooth Cursor-Centered Zoom       │
│  - Dynamic Map Scales: 10m, 20m, 50m, 100m, 200m, 500m │
│  - Built-in Wireless Physics Engine (JS)               │
└───────────────────────────┬────────────────────────────┘
                            │
                            │ WebSocket (JSON 30Hz ~ 50Hz)
                            │ ws://localhost:8000/ws/client
                            ▼
┌────────────────────────────────────────────────────────┐
│             Octaman Local Server (Python)              │
│  - FastAPI + Asyncio WebSocket Server Engine           │
│  - Terminal Live Monitor: Rich 8x8 Path Loss Table     │
│  - WebSocket Broadcast Hub                             │
└───────────────────────────┬────────────────────────────┘
                            │
                            │ WebSocket Broadcast
                            │ ws://localhost:8000/ws/dashboard
                            ▼
┌────────────────────────────────────────────────────────┐
│            Octaman Server Dashboard UI                 │
│  - 8x8 Interactive Matrix Heatmap (6 Metrics Tabs)     │
│  - Real-time Link Inspector (Path Loss, Delay, Doppler)│
│  - 3-Ray Multipath Delay Profile Visualizer            │
│  - 8-Node Position & Velocity Telemetry Monitor        │
└────────────────────────────────────────────────────────┘
```

---

## ✨ 주요 기능 (Key Features)

### 1. Octagon Web App (에뮬레이터 클라이언트)
- **Cesium 기반 전 세계 3D 지도:** CesiumJS globe에 Cesium ion World Terrain과 OSM Buildings 3D Tiles를 온라인 스트리밍합니다. 한국 주요 도시와 명소로 이동하고, 건물 높이별 3D Tiles 스타일과 전술 노드·무선 링크를 겹쳐 볼 수 있습니다. ion 토큰은 브라우저에서 입력하며 로컬에 저장합니다.
- **RF 전파·차폐 계산 엔진 (`app.js` + `wireless.js`):**
  - Cesium 지형·건물 프로파일과 지표면 위 1.5 m 전술 무전기 안테나 높이로 LOS와 회절을 계산합니다.
  - 무선 채널 모델은 3차원 노드 위치, 지형·건물 회절, 3차원 속도 투영을 사용합니다.
- **자유로운 8개 노드 제어:** Cesium 지표면에 놓인 노드를 드래그합니다. 지도에는 각 노드의 가장 가까운 이웃으로 가는 연결선만 그리고 선 중앙에 노드 간 3D 거리(m)를 표시합니다. 지면 위 1.5m 안테나 높이를 유지하며 동·북·상 속도($v_x,v_y,v_z$)를 산출합니다.
- **지도형 Pan & Zoom:**
  - 빈 지도를 좌클릭 드래그하면 회전 없이 좌우/상하로 이동합니다. 노드를 잡고 있는 동안에는 지도 입력이 잠깁니다.
  - 휠과 확대/축소 버튼으로 Cesium 카메라를 조작합니다.
  - 원점 복귀(`⌖ RESET VIEW`) 지원.
- **동적 축척 전환:** `10m`, `20m`, `50m`, `100m`, `200m`, `500m` 버튼 선택 시 Cesium 지도 고도가 바뀌어 실제 화면 축척을 조정합니다.
- **전술 포메이션 프리셋:** `분산`(현재 화면 안 무작위 배치), `Octagon Ring`, `2x4 Tactical Grid`, `Convoy Line`, `2-Cluster Mesh` 패턴을 현재 보이는 지도 중심에 배치합니다.
- **자동 기동 (Auto Patrol):** 각 노드가 독립적으로 0.2–1.5 m/s의 무작위 보행 속도와 방향으로 이동합니다. 축척에 따라 현재 지도 중심 주변의 이동 영역을 유지하고, 방향을 주기적으로 다시 무작위 선택합니다.
- **RF 환경 설정:** 반송파 주파수($f_c$, 1.0~6.0GHz), 경로손실지수($n$, 2.0~4.0), 섀도잉 표준편차($\sigma$, 0~8dB), 송신 전력($P_{tx}$, 10~30dBm), 전송 주기(10Hz~50Hz).

### 2. Octaman Server & 대시보드 (수신 및 시각화)
- **Rich 터미널 콘솔 라이브 테이블:** 서버 터미널 자체에서 8x8 Path Loss(dB) 매트릭스(차폐 NLOS 링크는 `*` 표기)와 초당 수신 FPS, 패킷 카운트 실시간 시각화.
- **웹 대시보드 (`/dashboard`):**
  - **8x8 인터랙티브 매트릭스 뷰:** `PATH LOSS`, `DELAY`, `FADING`, `MULTIPATH`, `DOPPLER`, `RSSI` 별 실시간 수치 및 컬러 히트맵 렌더링.
  - **링크 인스펙터:** 테이블의 $(i, j)$ 셀 클릭 시, 해당 링크의 3D 거리, LOS/NLOS 여부, 차폐 회절 손실, 신호 세기, 지연시간, 도플러, 3-Ray 다중경로 탭 정보 상세 조회.
  - **노드 텔레메트리:** 8개 노드의 ENU 좌표, WGS84 위도·경도·고도 및 3축 속도 모니터링 카드.

---

## 📡 무선 채널 모델링 수식 (Wireless Channel Modeling)

모든 링크는 로컬 동-북-상(ENU) 좌표의 수평 위치와 Cesium WGS84 표고를 함께 사용합니다. 안테나는 일반적인 man-pack 전술 무전기를 조끼/어깨에 장착한 높이를 대표값으로 두어 **지표면 위 1.5 m**에 배치합니다. 실제 장비와 설치 위치에 따라 달라지는 값이므로 `WirelessEngine({ antennaHeightM })`로 조정할 수 있습니다.

1. **노드 간 3차원 거리:**
   $$d_{2D}=\sqrt{(x_j-x_i)^2+(y_j-y_i)^2},\qquad d_{3D}=\sqrt{d_{2D}^2+(z_j-z_i)^2}$$
   여기서 $z_i,z_j$는 지형 표고에 안테나 높이를 더한 WGS84 타원체 기준 고도입니다. Cesium 지형 표고가 준비되지 않은 동안은 타원체 표고 0 m를 임시 기준으로 사용합니다.

2. **경로손실 및 지형·건물 회절:**
   $$PL=20\log_{10}\left(\frac{4\pi d_0}{\lambda}\right)+10n\log_{10}\left(\frac{\max(d_{3D},d_0)}{d_0}\right)+L_{\mathrm{diff}}$$
   - $d_0=1$ m, $f_c=2.4$ GHz, $\lambda=c/f_c$, $n=2.8$ 기본값.
   - Cesium World Terrain 표고 프로파일과 OSM Buildings 3D Tiles 표면고도를 링크 경로에서 샘플링합니다. 경로 간격은 대략 10 m, 최대 64구간입니다.
   - 직접선 차폐를 검사하고, 60% 제1 프레넬 구역 침범을 등가 칼날 높이로 사용해 ITU-R P.526 근사 회절손실을 계산하며 0–45 dB로 제한합니다. 3D 타일이 아직 로드되지 않은 구간은 지형 표고만 반영합니다.
   - 현재 Cesium World Terrain/OSM Buildings 스트림에는 검증된 수관 높이 자료가 포함되지 않으므로 수목 손실은 임의 수치로 만들지 않고 0 dB로 둡니다.

3. **섀도잉과 빠른 페이딩:**
   $$S_{k+1}=\alpha_S S_k+\sqrt{1-\alpha_S^2}W,\quad \alpha_S=e^{-\Delta s/d_{corr}}$$
   $\Delta s$는 두 프레임 사이 노드의 최대 이동거리이며, 기본 공간 상관거리는 LOS 10 m / NLOS 13 m입니다. $W$의 표준편차는 LOS에서 설정값 $\sigma$ (기본 3 dB), NLOS에서 $1.7\sigma$입니다. 정지 노드는 shadowing 상태를 유지합니다.
   빠른 페이딩은 복소 채널을 $h_{k+1}=\alpha_f h_k+\sqrt{1-\alpha_f^2}w$로 상관 갱신합니다. $\alpha_f=e^{-2\pi f_{D,max}\Delta t}$, $f_{D,max}=|v_{rel}|/\lambda$이며 속도는 연속된 무선 텔레메트리 좌표 차이로 산출합니다. 좌표가 바뀌지 않으면 속도와 도플러를 0으로 처리하고 채널 상태를 유지합니다. 진폭 분포는 LOS Rician $K=3$ dB, NLOS $K=-40$ dB (Rayleigh 근사)를 사용합니다. 이는 이동에 따른 시간 상관을 둔 경량 근사 모델입니다.

4. **수신전력과 링크 품질:**
   $$P_r=P_t+G_t+G_r-PL-(S+F_{\mathrm{fast}})$$
   기본 $P_t=23$ dBm, 양쪽 안테나 이득은 각각 2.15 dBi입니다. 링크 품질은 $P_r=-98$ dBm일 때 0%, $-58$ dBm일 때 100%가 되도록 선형 보간하고 범위를 제한합니다. 연결 판정 임계값은 $-98$ dBm입니다.

5. **전파 지연 및 다중경로:**
   $$\tau_{LOS}=d_{3D}/c$$
   첫 번째 탭을 기준 지연 0 ns로 두고, 탭 2는 지면 반사 이미지 기하 $d_g=\sqrt{d_{2D}^2+(h_i+h_j)^2}$로부터 $(d_g-d_{3D})/c$를 계산합니다. 탭 3은 샘플된 지형/건물 차폐점까지의 두 직선 경로와 직접 경로의 길이 차이로 초과 지연을 구합니다. 뚜렷한 차폐점이 없으면 3% (LOS) / 12% (NLOS) 경로 연장 경험 근사를 사용합니다. 탭 상대전력은 LOS에서 0/-6/-14.5 dB, NLOS에서 0/-3.5/-8.5 dB입니다. RMS 지연확산은 이 세 탭의 상대전력을 선형 단위로 환산한 가중 표준편차입니다.

6. **3차원 도플러 편이:**
   $$\hat{u}_{ij}=\frac{(x_j-x_i, y_j-y_i, z_j-z_i)}{d_{3D}},\quad v_r=(\vec v_j-\vec v_i)\cdot\hat{u}_{ij},\quad f_d=\frac{v_r f_c}{c}$$
   수평/수직 상대속도를 모두 투영합니다. 정지 노드는 $v_z=0$이며 지형을 따라 노드를 드래그할 때 표고 변화로 수직 속도를 산출합니다.

> 실제 구현은 Cesium 지형·건물 표면 프로파일을 최대 약 0.9초 간격으로 갱신하고, 새 표고 샘플이 준비되기 전까지 직전 프로파일을 사용합니다. 지형/건물 데이터나 Cesium ion 토큰이 없으면 3D 거리와 안테나 고도는 계산하지만 회절 손실은 관측된 프로파일이 없어 0 dB로 처리합니다.

## 📁 프로젝트 구조 (Project Structure)

```
OCTAGON/
├── server.py                 # FastAPI WebSocket 서버 + Rich Live 터미널 콘솔 + REST API
├── SYSTEM_DESIGN.md          # AI Agent 및 개발자를 위한 상세 아키텍처/수학모델 설계 사양서
├── static/
│   ├── client/               # Octagon Web App (에뮬레이터)
│   │   ├── index.html        # 에뮬레이터 UI 레이아웃
│   │   ├── style.css         # 전술 Cybernetic 다크 테마 스타일
│   │   ├── wireless.js       # 5대 무선 채널 모델 연산 엔진
│   │   └── app.js            # Cesium 단일 지도, 노드 이동·속도 산출, 좌표·채널 WebSocket 전송
│   └── dashboard/            # Octaman Server 대시보드
│       ├── index.html        # 모니터링 대시보드 UI
│       ├── dashboard.css     # 8x8 매트릭스 및 인스펙터 스타일
│       └── dashboard.js      # 실시간 히트맵 렌더러 및 패킷 통계
├── run_server.bat            # Windows 원클릭 서버 실행 배치 파일
├── launch_dual_view.py       # 브라우저 좌/우 자동 분할 런처
├── test_simulation.py        # WebSocket 데이터 교환 E2E 자동 테스트
├── verify_real_execution.py  # 실제 Chrome 브라우저 인스턴스 연동 실측 검증 스크립트
├── requirements.txt          # 파이썬 의존 패키지 목록
└── README.md                 # 프로젝트 종합 안내 문서
```

> 📖 **아키텍처 및 세부 설계 상세:** AI Agent 또는 개발자가 무선 물리 수식, 3D 광선 추적 알고리즘, JSON 통신 스키마를 확장하거나 분석할 때는 [`SYSTEM_DESIGN.md`](./SYSTEM_DESIGN.md)를 참조하십시오.

---

## 🚀 설치 및 빠른 시작 (Quick Start)

### 1. 환경 설정
Python 3.10 이상이 설치된 환경에서 의존 패키지를 설치합니다:
```bash
pip install -r requirements.txt
```

### 2. 서버 실행
**방법 1 (원클릭 배치 파일):**  
`run_server.bat` 파일을 더블 클릭하여 실행합니다.

**방법 2 (터미널 명령):**  
```bash
python server.py
```
> 터미널에 실시간 8x8 Path Loss 표와 패킷 수신 FPS가 나타납니다.

### 3. 브라우저 듀얼 뷰 실행 (원클릭)
새 터미널 창에서 다음 스크립트를 실행하면 클라이언트와 서버 대시보드가 화면 좌/우로 자동 분할되어 열립니다:
```bash
python launch_dual_view.py
```
- **Octagon 클라이언트:** `http://localhost:8000/client`
- **Octaman 대시보드:** `http://localhost:8000/dashboard`

---

## 🖥 로컬 통합 배치 가이드 (Dual-View Layout)

개발 PC 화면 한쪽에 에뮬레이터를 두고 다른 한쪽에 서버 대시보드를 배치하여, 노드를 드래그할 때 서버 쪽 값들이 실시간으로 반응하는 것을 즉각 검증할 수 있습니다:

```
┌─────────────────────────────────┬─────────────────────────────────┐
│     [왼쪽 화면] Octagon 클라이언트 │     [오른쪽 화면] Octaman 서버   │
│                                 │                                 │
│  - Cesium 3D 지도와 8개 노드       │  - 로컬 웹 대시보드 (/dashboard) │
│  - 노드 마우스 드래그 & 축척 전환 │    또는 터미널 콘솔 화면        │
│  - 실시간 무선 채널 연산 및 송신 │  - 8x8 매트릭스 실시간 변화 모니터 │
│    (30Hz 스트리밍)              │    (Path Loss, Delay, Doppler)  │
└─────────────────────────────────┴─────────────────────────────────┘
```

---

## 🧪 검증 및 테스트 (Verification & Tests)

### E2E 테스트 스크립트 실행
```bash
# 1. 가상 클라이언트-서버 통신 및 데이터 릴레이 무결성 검증
python test_simulation.py

# 2. 실제 Chrome 브라우저 인스턴스 기동 실측 검증
python verify_real_execution.py
```

**실측 검증 결과:**
- **통신 주기:** 30Hz 정상 유지
- **전파 파라미터 수신율:** 8x8 전 노드 쌍의 거리, 손실, 지연, 페이딩, 도플러 정상 수신 완료

---

## 📄 License
This project is licensed under the MIT License.
