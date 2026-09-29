"""
Test script for verifying Octaman Server and WebSocket data exchange
"""

import asyncio
import json
import websockets
import httpx

async def run_test():
    base_url = "http://127.0.0.1:8000"
    ws_client_url = "ws://127.0.0.1:8000/ws/client"
    ws_dashboard_url = "ws://127.0.0.1:8000/ws/dashboard"

    print("[TEST] 1. Checking HTTP status endpoint...")
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{base_url}/api/status")
        assert resp.status_code == 200, f"Status code failed: {resp.status_code}"
        print(f"[PASS] Status response: {resp.json()}")

        resp_client_page = await client.get(f"{base_url}/client")
        assert resp_client_page.status_code == 200, "Client page failed"
        assert "OCTAGON" in resp_client_page.text
        print("[PASS] Octagon client page served successfully.")

        resp_dashboard_page = await client.get(f"{base_url}/dashboard")
        assert resp_dashboard_page.status_code == 200, "Dashboard page failed"
        assert "OCTAMAN" in resp_dashboard_page.text
        print("[PASS] Server dashboard page served successfully.")

    print("\n[TEST] 2. Testing WebSocket connection & data relay...")
    async with websockets.connect(ws_dashboard_url) as ws_dash:
        print("[PASS] Dashboard WebSocket connected.")

        async with websockets.connect(ws_client_url) as ws_client:
            print("[PASS] Client WebSocket connected.")

            # Prepare a dummy 8x8 matrix payload
            nodes = [{"id": i + 1, "name": f"N{i+1}", "x": i * 10.0, "y": 0.0, "vx": 1.2, "vy": 0.0} for i in range(8)]
            matrix = []
            for i in range(8):
                row = []
                for j in range(8):
                    dist = abs(i - j) * 10.0
                    pl = 40.0 + 28.0 * (dist / 10.0) if dist > 0 else 0
                    row.append({
                        "source": i + 1,
                        "target": j + 1,
                        "distance": dist,
                        "pathLoss": round(pl, 1),
                        "delayNs": round(dist * 3.33, 1),
                        "fading": 1.5,
                        "rmsDelaySpreadNs": 18.0,
                        "dopplerHz": 5.0,
                        "rssiDbm": -65.0,
                        "multipath": [
                            {"delayNs": 0, "powerRatioDb": 0},
                            {"delayNs": 15, "powerRatioDb": -5},
                            {"delayNs": 35, "powerRatioDb": -14}
                        ]
                    })
                matrix.append(row)

            test_payload = {
                "timestamp": 1720000000000,
                "scale_m": 50,
                "carrier_freq_ghz": 2.4,
                "nodes": nodes,
                "matrix": matrix
            }

            # Send from client
            await ws_client.send(json.dumps(test_payload))
            print("[PASS] Sent 8x8 matrix payload from client.")

            # Receive on dashboard
            dash_received = await asyncio.wait_for(ws_dash.recv(), timeout=3.0)
            dash_data = json.loads(dash_received)
            assert dash_data["scale_m"] == 50
            assert len(dash_data["matrix"]) == 8
            assert len(dash_data["matrix"][0]) == 8
            print(f"[PASS] Dashboard received broadcasted matrix successfully! (8x8 cells, N1->N2 PL: {dash_data['matrix'][0][1]['pathLoss']} dB)")

    print("\n[ALL TESTS PASSED SUCCESSFULLY!]")

if __name__ == "__main__":
    asyncio.run(run_test())
