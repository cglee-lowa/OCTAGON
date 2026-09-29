"""
OCTAMAN Server (Version 1)
Python FastAPI + WebSocket Server for MANET 8-Node Wireless Channel Emulation
Includes Real-time Rich Terminal Console 8x8 Matrix Table + Web Dashboard Relay
"""

import sys
import os
import json
import time
import asyncio
from typing import Set, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.live import Live
from rich.text import Text

console = Console()

class ServerState:
    def __init__(self):
        self.latest_payload: Optional[dict] = None
        self.packet_count: int = 0
        self.rx_fps: float = 0.0
        self.last_fps_time: float = time.time()
        self.frames_in_interval: int = 0
        self.client_connected: bool = False
        self.active_client_sockets: Set[WebSocket] = set()
        self.active_dashboard_sockets: Set[WebSocket] = set()
        self.enable_console_table: bool = True

state = ServerState()

def build_rich_display() -> Panel:
    """Build a rich 8x8 matrix table + status panel for terminal monitor."""
    status_text = Text()
    status_text.append("● CLIENT: ", style="bold white")
    if state.client_connected:
        status_text.append("ONLINE ", style="bold green")
    else:
        status_text.append("WAITING FOR OCTAGON CLIENT... ", style="bold red")

    status_text.append(f"| RX RATE: {state.rx_fps:4.1f} Hz | TOTAL PACKETS: {state.packet_count} | DASHBOARDS: {len(state.active_dashboard_sockets)}\n", style="cyan")

    table = Table(title="[bold yellow]OCTAMAN 8x8 PATH LOSS (dB) MATRIX (LIVE)[/bold yellow]", show_header=True, header_style="bold magenta", border_style="dim")
    table.add_column("Tx \\ Rx", justify="center", style="bold cyan", no_wrap=True)
    for i in range(1, 9):
        table.add_column(f"N{i}", justify="center", width=7)

    if state.latest_payload and "matrix" in state.latest_payload:
        matrix = state.latest_payload["matrix"]
        scale_m = state.latest_payload.get("scale_m", 50)
        terrain_name = state.latest_payload.get("terrain_preset", "munjeong")
        terrain_str = "서울 송파 문정역 실지형" if terrain_name == "munjeong" else terrain_name
        status_text.append(f"TERRAIN: {terrain_str} | MAP SCALE: {scale_m}m | CARRIER: {state.latest_payload.get('carrier_freq_ghz', 2.4)} GHz\n", style="dim")

        for i in range(8):
            row_items = [f"[bold cyan]N{i+1}[/bold cyan]"]
            for j in range(8):
                if i == j:
                    row_items.append("[dim]—[/dim]")
                else:
                    link_obj = matrix[i][j]
                    pl = link_obj.get("pathLoss", 0.0)
                    is_los = link_obj.get("isLOS", True)
                    nlos_mark = "" if is_los else "*"

                    # Color coding based on loss
                    if pl < 65:
                        row_items.append(f"[green]{pl:4.1f}{nlos_mark}[/green]")
                    elif pl < 85:
                        row_items.append(f"[yellow]{pl:4.1f}{nlos_mark}[/yellow]")
                    else:
                        row_items.append(f"[red]{pl:4.1f}{nlos_mark}[/red]")
            table.add_row(*row_items)
    else:
        for i in range(8):
            table.add_row(f"[bold cyan]N{i+1}[/bold cyan]", *["[dim]--[/dim]"] * 8)

    layout_group = [status_text, table]
    return Panel(
        table,
        title=f"[bold green]OCTAMAN MANET EMULATION SERVER[/bold green] (Packets: {state.packet_count:,})",
        subtitle="[dim]*: 차폐(NLOS) 회절 링크 | App: http://localhost:8000/client | Dashboard: http://localhost:8000/dashboard[/dim]",
        border_style="green" if state.client_connected else "cyan"
    )

async def console_updater_task():
    """Background task to refresh the rich terminal display."""
    with Live(build_rich_display(), console=console, refresh_per_second=2, screen=False) as live:
        while True:
            live.update(build_rich_display())
            await asyncio.sleep(0.5)

@asynccontextmanager
async def lifespan(app: FastAPI):
    updater = None
    if state.enable_console_table:
        updater = asyncio.create_task(console_updater_task())
    yield
    if updater:
        updater.cancel()

app = FastAPI(title="Octaman Emulator Server", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CLIENT_DIR = os.path.join(BASE_DIR, "static", "client")
DASHBOARD_DIR = os.path.join(BASE_DIR, "static", "dashboard")

app.mount("/static/client", StaticFiles(directory=CLIENT_DIR), name="client_static")
app.mount("/static/dashboard", StaticFiles(directory=DASHBOARD_DIR), name="dashboard_static")

@app.get("/")
async def root():
    return RedirectResponse(url="/client")

@app.get("/client", response_class=HTMLResponse)
async def serve_client():
    index_file = os.path.join(CLIENT_DIR, "index.html")
    with open(index_file, "r", encoding="utf-8") as f:
        return f.read()

@app.get("/dashboard", response_class=HTMLResponse)
async def serve_dashboard():
    index_file = os.path.join(DASHBOARD_DIR, "index.html")
    with open(index_file, "r", encoding="utf-8") as f:
        return f.read()

@app.get("/api/status")
async def get_status():
    return {
        "status": "online",
        "client_connected": state.client_connected,
        "dashboard_subscribers": len(state.active_dashboard_sockets),
        "total_packets": state.packet_count,
        "rx_fps": state.rx_fps,
        "has_data": state.latest_payload is not None
    }

@app.get("/api/latest-matrix")
async def get_latest_matrix():
    if not state.latest_payload:
        return JSONResponse({"status": "no_data_received_yet"}, status_code=404)
    return state.latest_payload

@app.websocket("/ws/client")
async def websocket_client_endpoint(websocket: WebSocket):
    await websocket.accept()
    state.active_client_sockets.add(websocket)
    state.client_connected = True

    try:
        while True:
            raw_text = await websocket.receive_text()
            data = json.loads(raw_text)

            state.latest_payload = data
            state.packet_count += 1
            state.frames_in_interval += 1

            now = time.time()
            elapsed = now - state.last_fps_time
            if elapsed >= 1.0:
                state.rx_fps = round(state.frames_in_interval / elapsed, 1)
                state.frames_in_interval = 0
                state.last_fps_time = now

            # Broadcast to web dashboard
            if state.active_dashboard_sockets:
                disconnected = set()
                for dash_ws in state.active_dashboard_sockets:
                    try:
                        await dash_ws.send_text(raw_text)
                    except Exception:
                        disconnected.add(dash_ws)
                state.active_dashboard_sockets.difference_update(disconnected)

    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        state.active_client_sockets.discard(websocket)
        state.client_connected = len(state.active_client_sockets) > 0

@app.websocket("/ws/dashboard")
async def websocket_dashboard_endpoint(websocket: WebSocket):
    await websocket.accept()
    state.active_dashboard_sockets.add(websocket)

    if state.latest_payload:
        try:
            await websocket.send_text(json.dumps(state.latest_payload))
        except Exception:
            pass

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        state.active_dashboard_sockets.discard(websocket)

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Octaman MANET Server")
    parser.add_argument("--host", default="0.0.0.0", help="Host IP")
    parser.add_argument("--port", type=int, default=8000, help="Port (default: 8000)")
    parser.add_argument("--no-console", action="store_true", help="Disable Rich terminal live table")
    args = parser.parse_args()

    if args.no_console:
        state.enable_console_table = False

    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")
