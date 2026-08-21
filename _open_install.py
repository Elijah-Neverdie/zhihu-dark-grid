import urllib.request
import subprocess
import time
import sys

url = "http://127.0.0.1:8766/zhihu-dark-grid.user.js"
try:
    r = urllib.request.urlopen(url, timeout=2)
    print("OK", r.status)
except Exception as e:
    print("starting server...", e)
    subprocess.Popen(
        [sys.executable, r"C:\Users\A\Projects\zhihu-dark-grid\_serve_userscript.py"],
        cwd=r"C:\Users\A\Projects\zhihu-dark-grid",
        creationflags=0x00000008,  # DETACHED_PROCESS
    )
    time.sleep(1.5)
    r = urllib.request.urlopen(url, timeout=3)
    print("OK after start", r.status)

# open edge
subprocess.Popen(["cmd", "/c", "start", "msedge", url + "?v=335"], shell=False)
print("opened edge")
