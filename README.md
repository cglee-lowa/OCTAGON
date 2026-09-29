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
│  - HTML5 Canvas 2D Tactical C2 UI                      │
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
- **자유로운 8개 노드 제어:** 마우스 좌클릭 드래그로 노드 이동. 드래그 변위/시간($\Delta t$)을 측정하여 물리 속도 벡터($v_x, v_y$)를 실시간 산출, 도플러 편이에 즉각 반영.
- **지도형 Pan & Zoom:**
  - 마우스 빈 공간 좌클릭/우클릭 드래그로 맵 Pan 이동.
  - 마우스 휠 스크롤로 커서 위치 기준 확대/축소.
  - 원점 복귀(`⌖ RESET VIEW`) 지원.
- **동적 축척 전환:** `10m`, `20m`, `50m`, `100m`, `200m`, `500m` 버튼 선택 시 화면의 실제 거리 격자 눈금 및 우측 하단 스케일 바(Scale Bar)가 실시간 동적 갱신.
- **전술 포메이션 프리셋:** `Octagon Ring`, `2x4 Tactical Grid`, `Convoy Line`, `2-Cluster Mesh` 원클릭 대형 배치.
- **자동 기동 (Auto Patrol):** 드래그하지 않고도 지속적인 도플러 효과 및 링크 동적 변화를 시뮬레이션할 수 있는 자동 순찰 모드.
- **RF 환경 설정:** 반송파 주파수($f_c$, 1.0~6.0GHz), 경로손실지수($n$, 2.0~4.0), 섀도잉 표준편차($\sigma$, 0~8dB), 송신 전력($P_{tx}$, 10~30dBm), 전송 주기(10Hz~50Hz).

### 2. Octaman Server & 대시보드 (수신 및 시각화)
- **Rich 터미널 콘솔 라이브 테이블:** 서버 터미널 자체에서 8x8 Path Loss(dB) 매트릭스와 초당 수신 FPS, 패킷 카운트 실시간 시각화.
- **웹 대시보드 (`/dashboard`):**
  - **8x8 인터랙티브 매트릭스 뷰:** `PATH LOSS`, `DELAY`, `FADING`, `MULTIPATH`, `DOPPLER`, `RSSI` 별 실시간 수치 및 컬러 히트맵 렌더링.
  - **링크 인스펙터:** 테이블의 $(i, j)$ 셀 클릭 시, 해당 링크의 거리, 신호 세기, 지연시간, 도플러, 3-Ray 다중경로 탭 정보 상세 조회.
  - **노드 텔레메트리:** 8개 노드의 실시간 $X, Y$ 좌표(m) 및 속도(m/s) 모니터링 카드.

---

## 📡 무선 채널 모델링 수식 (Wireless Channel Modeling)

1. **노드 간 2D 거리 ($d$):**
   $$d_{ij} = \sqrt{(x_i - x_j)^2 + (y_i - y_j)^2} \quad (\text{m})$$

2. **Log-distance Path Loss 모델 ($PL$):**
   $$PL(d) = 20 \log_{10}\left(\frac{4\pi d_0 f_c}{c}\right) + 10 \cdot n \cdot \log_{10}\left(\frac{\max(d, d_0)}{d_0}\right) \quad (\text{dB})$$
   - 기준 거리: $d_0 = 1.0\text{ m}$
   - 반송파 주파수 기본값: $f_c = 2.4\text{ GHz}$ ($\lambda \approx 0.125\text{ m}$)
   - 경로 손실 지수: $n = 2.8$ (도심/전술 MANET 환경 기본값)

3. **페이딩 (Fading: Shadowing + Fast Fading):**
   - **Log-normal Shadowing:** Gauss-Markov 시간 상관 프로세스를 적용하여 시간에 따라 연속적으로 변동하는 대수정규 분포 모델 ($X_\sigma \sim \mathcal{N}(0, \sigma^2)$, $\sigma = 3.0\text{ dB}$).
   - **Fast Fading:** Rayleigh/Rician 분포 기반 다중파 합성 신호 세기 변동 ($\pm 3\text{ dB}$).
   - **수신 신호 강도 (RSSI):**
     $$\text{RSSI} = P_{tx} + G_{tx} + G_{rx} - PL(d) - \text{Fading} \quad (\text{dBm})$$

4. **전파 지연 (Propagation Delay $\tau$):**
   $$\tau = \frac{d}{c} \quad (c = 299,792,458\text{ m/s} \approx 3 \times 10^8\text{ m/s})$$
   - 단위: 나노초 ($\text{ns}$), $1\text{m} \approx 3.3356\text{ ns}$

5. **다중 경로 프로파일 (Multipath Profile - 3-Ray Tap):**
   - RMS 지연 확산: $\sigma_\tau \approx 15 \cdot (1 + 0.45\log_{10}(1 + d/10)) \quad (\text{ns})$
   - **Tap 1 (Direct LOS):** 지연 $0\text{ ns}$, 상대 전력 $0.0\text{ dB}$
   - **Tap 2 (Ground Reflection):** 지연 $\tau_2 = \min(\tau \cdot 0.15 + 12\text{ns}, 120\text{ns})$, 상대 전력 $-5.2\text{ dB}$
   - **Tap 3 (Clutter/Scatter):** 지연 $\tau_3 = \min(\tau \cdot 0.35 + 35\text{ns}, 300\text{ns})$, 상대 전력 $-13.8\text{ dB}$

6. **도플러 주파수 편이 (Doppler Shift $f_d$):**
   $$\vec{v}_{\text{rel}} = \vec{v}_j - \vec{v}_i, \quad \hat{u}_{ij} = \frac{\vec{r}_j - \vec{r}_i}{d_{ij}}$$
   $$v_r = \vec{v}_{\text{rel}} \cdot \hat{u}_{ij} \quad (\text{반경 상대 속도})$$
   $$f_d = \frac{v_r}{\lambda} = \frac{v_r \cdot f_c}{c} \quad (\text{Hz})$$

---

## 📁 프로젝트 구조 (Project Structure)

```
OCTAGON/
├── server.py                 # FastAPI WebSocket 서버 + Rich Live 터미널 콘솔 + REST API
├── static/
│   ├── client/               # Octagon Web App (에뮬레이터)
│   │   ├── index.html        # 에뮬레이터 UI 레이아웃
│   │   ├── style.css         # 전술 Cybernetic 다크 테마 스타일
│   │   ├── wireless.js       # 5대 무선 채널 모델 연산 엔진
│   │   └── app.js            # Canvas 렌더러, 노드 물리 엔진, 드래그/줌, WebSocket 전송
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
│  - 8개 노드 Canvas 시각화       │  - 로컬 웹 대시보드 (/dashboard) │
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
