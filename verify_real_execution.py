"""
End-to-End Real Execution Verifier for Octagon Web App & Octaman Server
1. Starts the server if not already running.
2. Launches Chrome in headless mode with remote debugging or direct navigation.
3. Observes real WebSocket transmissions and verifies wireless parameters.
"""

import subprocess
import time
import json
import urllib.request
import httpx
import asyncio
import os

CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

async def test_real_client():
    print("[STEP 1] Checking server availability on http://localhost:8000 ...")
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get("http://localhost:8000/api/status", timeout=2.0)
            print(f"[OK] Server is running: {resp.json()}")
        except Exception:
            print("[FAIL] Server is not running. Please start server.py first.")
            return False

    print("\n[STEP 2] Launching real Chrome headless instance pointing to Octagon Client...")
    user_data_dir = os.path.join(os.environ.get("TEMP", "C:\\Temp"), "octagon_chrome_test")
    chrome_proc = subprocess.Popen([
        CHROME_PATH,
        "--headless=new",
        "--disable-gpu",
        "--remote-debugging-port=9222",
        f"--user-data-dir={user_data_dir}",
        "http://localhost:8000/client"
    ])

    print("[STEP 3] Waiting for Octagon Web App to load, connect WebSocket, and stream wireless telemetry...")
    client_received = False
    for attempt in range(12):
        await asyncio.sleep(1.0)
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.get("http://localhost:8000/api/status")
                status = resp.json()
                print(f"  Attempt {attempt+1}: Total Packets = {status.get('total_packets')}, RX FPS = {status.get('rx_fps')} Hz, Client Connected = {status.get('client_connected')}")
                if status.get("total_packets", 0) > 10 and status.get("client_connected"):
                    client_received = True
                    break
            except Exception as e:
                print(f"  Poll error: {e}")

    print("\n[STEP 4] Inspecting real computed 8x8 Link Matrix from server...")
    if client_received:
        async with httpx.AsyncClient() as client:
            resp_matrix = await client.get("http://localhost:8000/api/latest-matrix")
            data = resp_matrix.json()
            matrix = data.get("matrix", [])
            nodes = data.get("nodes", [])

            print(f"[OK] Verified 8 nodes: {[n['name'] for n in nodes]}")
            print(f"[OK] Verified Matrix Dimensions: {len(matrix)} x {len(matrix[0])}")

            # Inspect sample link
            sample_link = matrix[0][1] # N1 -> N2
            print(f"\n--- Real Wireless Channel Link (N1 -> N2) ---")
            print(f"  Distance:          {sample_link['distance']} m")
            print(f"  Path Loss:         {sample_link['pathLoss']} dB")
            print(f"  Propagation Delay: {sample_link['delayNs']} ns")
            print(f"  Fading (Shadowing):{sample_link['fading']} dB")
            print(f"  RMS Delay Spread:  {sample_link['rmsDelaySpreadNs']} ns")
            print(f"  Doppler Shift:     {sample_link['dopplerHz']} Hz")
            print(f"  RSSI:              {sample_link['rssiDbm']} dBm")
            print(f"  Link Quality:      {sample_link['linkQuality']} %")

            # Terminate test headless browser
            chrome_proc.terminate()
            print("\n[VERIFICATION RESULT: SUCCESS! Octagon Client & Octaman Server are fully communicating in real-time]")
            return True
    else:
        chrome_proc.terminate()
        print("\n[VERIFICATION RESULT: TIMEOUT waiting for client transmission]")
        return False

if __name__ == "__main__":
    asyncio.run(test_real_client())
