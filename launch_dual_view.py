"""
OCTAMAN Dual View Launcher
Launches Octagon Web App on the left half of the screen
and Octaman Server Dashboard on the right half of the screen.
"""

import subprocess
import os
import time
import urllib.request

CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
EDGE_PATH = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

def find_browser():
    if os.path.exists(CHROME_PATH):
        return CHROME_PATH
    if os.path.exists(EDGE_PATH):
        return EDGE_PATH
    return None

def wait_for_server(url="http://localhost:8000/api/status", timeout=6):
    start = time.time()
    while time.time() - start < timeout:
        try:
            with urllib.request.urlopen(url, timeout=1) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            time.sleep(0.4)
    return False

def launch():
    print("[1] Verifying Octaman Server status...")
    if not wait_for_server():
        print("[!] Server not running on localhost:8000. Launching server first...")
        subprocess.Popen(["python", "server.py"], cwd=os.path.dirname(os.path.abspath(__file__)))
        time.sleep(2)

    browser = find_browser()
    client_url = "http://localhost:8000/client"
    dash_url = "http://localhost:8000/dashboard"

    if browser:
        print(f"[2] Launching side-by-side windows with: {os.path.basename(browser)}")
        # Left Window: Octagon Web App (x=0, y=0, width=960, height=1030)
        subprocess.Popen([
            browser,
            f"--app={client_url}",
            "--window-position=0,0",
            "--window-size=960,1030"
        ])
        time.sleep(0.5)

        # Right Window: Octaman Server Dashboard (x=960, y=0, width=960, height=1030)
        subprocess.Popen([
            browser,
            f"--app={dash_url}",
            "--window-position=960,0",
            "--window-size=960,1030"
        ])
    else:
        import webbrowser
        print("[2] Opening in default browser tabs...")
        webbrowser.open_new(client_url)
        time.sleep(0.3)
        webbrowser.open_new(dash_url)

    print("\n[SUCCESS] Octagon and Octaman are now live side-by-side!")

if __name__ == "__main__":
    launch()
