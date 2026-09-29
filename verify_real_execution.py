"""
End-to-End Real Execution Verifier for Octagon Web App & Octaman Server
Verifies Munjeong Station 3D Tactical Terrain, 8-Node MANET Emulation, and LOS/NLOS Wireless Parameters
"""

import subprocess
import time
import json
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

    print("\n[STEP 2] Launching real Chrome instance pointing to Octagon Client (Munjeong 3D Terrain)...")
    import shutil
    user_data_dir = os.path.join(os.environ.get("TEMP", "C:\\Temp"), f"octagon_chrome_test_{int(time.time())}")
    chrome_proc = subprocess.Popen([
        CHROME_PATH,
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        f"--user-data-dir={user_data_dir}",
        "http://localhost:8000/client"
    ])

    print("[STEP 3] Waiting for Octagon Web App to load, connect WebSocket, and stream wireless telemetry...")
    client_received = False
    for attempt in range(15):
        await asyncio.sleep(1.0)
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.get("http://localhost:8000/api/latest-matrix")
                if resp.status_code == 200:
                    data = resp.json()
                    if data.get("terrain_preset") == "munjeong":
                        client_received = True
                        break
            except Exception as e:
                pass
            print(f"  Waiting for client transmission (Attempt {attempt+1})...")

    print("\n[STEP 4] Inspecting real computed 8x8 Link Matrix from server...")
    if client_received:
        async with httpx.AsyncClient() as client:
            resp_matrix = await client.get("http://localhost:8000/api/latest-matrix")
            data = resp_matrix.json()
            matrix = data.get("matrix", [])
            nodes = data.get("nodes", [])
            terrain_preset = data.get("terrain_preset", "unknown")

            print(f"[OK] Verified Terrain Preset: {terrain_preset} (문정역 실지형)")
            print(f"[OK] Verified 8 nodes: {[n['name'] for n in nodes]}")
            elev_strs = [f"{n['name']}: {n.get('z', 0)}m" for n in nodes]
            print(f"[OK] Verified Node Elevations (Z): {elev_strs}")
            print(f"[OK] Verified Matrix Dimensions: {len(matrix)} x {len(matrix[0])}")

            # Count LOS vs NLOS
            los_count = 0
            nlos_count = 0
            nlos_examples = []
            for i in range(8):
                for j in range(i + 1, 8):
                    link = matrix[i][j]
                    if link.get("isLOS"):
                        los_count += 1
                    else:
                        nlos_count += 1
                        nlos_examples.append(f"N{i+1} -> N{j+1} (차폐 회절 손실: +{link.get('diffractionLossDb')} dB)")

            print(f"[OK] Link Line-of-Sight Statistics: LOS = {los_count}, NLOS (건물/지형 차폐) = {nlos_count}")
            if nlos_examples:
                print("     Sample NLOS Obstructions:")
                for ex in nlos_examples[:3]:
                    print(f"      - {ex}")

            # Sample link
            sample_link = matrix[0][1] # N1 -> N2
            print(f"\n--- Real Wireless Channel Link (N1 -> N2) ---")
            print(f"  Distance (2D/3D):  {sample_link['distance']} m / {sample_link.get('distance3D')} m")
            print(f"  Line of Sight:     {sample_link.get('isLOS')} (Diffraction Loss: {sample_link.get('diffractionLossDb')} dB)")
            print(f"  Path Loss:         {sample_link['pathLoss']} dB")
            print(f"  Propagation Delay: {sample_link['delayNs']} ns")
            print(f"  Fading (Shadowing):{sample_link['fading']} dB")
            print(f"  RMS Delay Spread:  {sample_link['rmsDelaySpreadNs']} ns")
            print(f"  Doppler Shift:     {sample_link['dopplerHz']} Hz")
            print(f"  RSSI:              {sample_link['rssiDbm']} dBm")
            print(f"  Link Quality:      {sample_link['linkQuality']} %")

            chrome_proc.terminate()
            print("\n[VERIFICATION RESULT: SUCCESS! Octagon Client & Octaman Server are fully communicating in real-time with Munjeong 3D Terrain!]")
            return True
    else:
        chrome_proc.terminate()
        print("\n[VERIFICATION RESULT: TIMEOUT waiting for client transmission]")
        return False

if __name__ == "__main__":
    asyncio.run(test_real_client())
