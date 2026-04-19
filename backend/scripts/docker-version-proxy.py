#!/usr/bin/env python3
"""Proxy that rewrites ALL Docker API version prefixes to v1.41."""
import socket, threading, re

LISTEN_PORT = 12375
DOCKER_SOCK = "/var/run/docker.sock"
VERSION_RE = re.compile(rb'((?:GET|POST|PUT|DELETE|HEAD|OPTIONS) )/v1\.\d+/')

def rewrite(data):
    return VERSION_RE.sub(rb'\1/v1.41/', data)

def handle(client):
    upstream = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        upstream.connect(DOCKER_SOCK)
    except Exception as e:
        client.close()
        return

    buf = b""
    # client → upstream (rewriting)
    def client_to_upstream():
        nonlocal buf
        try:
            while True:
                chunk = client.recv(65536)
                if not chunk:
                    break
                buf += chunk
                # rewrite every HTTP request line we see
                rewritten = rewrite(buf)
                upstream.sendall(rewritten)
                buf = b""
        except:
            pass
        finally:
            try: upstream.shutdown(socket.SHUT_WR)
            except: pass

    # upstream → client (pass through)
    def upstream_to_client():
        try:
            while True:
                chunk = upstream.recv(65536)
                if not chunk:
                    break
                client.sendall(chunk)
        except:
            pass
        finally:
            try: client.shutdown(socket.SHUT_WR)
            except: pass

    t1 = threading.Thread(target=client_to_upstream, daemon=True)
    t2 = threading.Thread(target=upstream_to_client, daemon=True)
    t1.start(); t2.start()
    t1.join(); t2.join()
    try: client.close()
    except: pass
    try: upstream.close()
    except: pass

server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
server.bind(("127.0.0.1", LISTEN_PORT))
server.listen(100)
print(f"Docker version proxy on tcp://127.0.0.1:{LISTEN_PORT}", flush=True)
while True:
    c, _ = server.accept()
    threading.Thread(target=handle, args=(c,), daemon=True).start()
