import os
import subprocess

def run_backend():
    try:
        subprocess.run(["node", "server.js"], check=True, cwd=os.path.dirname(os.path.abspath(__file__)))
    except subprocess.CalledProcessError as e:
        print(f"Error running backend: {e}")

if __name__ == "__main__":
    run_backend()