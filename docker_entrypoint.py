import os
import socket
import sys
import time


def wait_tcp(host: str, port: int, label: str, attempts: int = 90) -> None:
    for _ in range(attempts):
        try:
            s = socket.create_connection((host, port), timeout=2)
            s.close()
            print(f"ready: {label} ({host}:{port})", flush=True)
            return
        except OSError:
            time.sleep(1)
    raise SystemExit(f"timeout waiting for {label} at {host}:{port}")


if __name__ == "__main__":
    wait_tcp("postgres", 5432, "PostgreSQL")
    wait_tcp("minio", 9000, "MinIO")
    os.execvp(sys.argv[1], sys.argv[1:])
