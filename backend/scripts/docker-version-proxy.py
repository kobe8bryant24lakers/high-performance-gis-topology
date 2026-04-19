#!/usr/bin/env python3
"""Proxy that rewrites ALL Docker API version prefixes to v1.41.

Design: forwarding is streaming with a minimal "bridge buffer" that holds
back only bytes that could form the START of a version pattern spanning a
TCP-packet boundary.  Body bytes and response data are never buffered, so
there is no risk of deadlocking on pending request completion.
"""
import socket, threading, re, logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("docker-proxy")

LISTEN_PORT = 12375
DOCKER_SOCK  = "/var/run/docker.sock"
VERSION_RE   = re.compile(rb'((?:GET|POST|PUT|DELETE|HEAD|OPTIONS|PATCH) )/v1\.\d+/')

# Pre-compute every prefix of "METHOD /v1." that could be split across chunks.
# We only hold back bytes that are an exact prefix of one of these strings.
_METHODS = [b"GET", b"POST", b"PUT", b"DELETE", b"HEAD", b"OPTIONS", b"PATCH"]
_PARTIAL_PREFIXES: set[bytes] = set()
for _m in _METHODS:
    _base = _m + b" /v1."
    for _i in range(1, len(_base)):           # "G", "GE", …, "OPTIONS /v1"
        _PARTIAL_PREFIXES.add(_base[:_i])
    for _digits in (b"1", b"12", b"123"):     # also partial version numbers
        _PARTIAL_PREFIXES.add(_base + _digits)
_MAX_PARTIAL = max(len(p) for p in _PARTIAL_PREFIXES)   # ≤ 17


def _carry_len(data: bytes) -> int:
    """Return how many trailing bytes of *data* must be held for the next chunk."""
    for n in range(1, min(_MAX_PARTIAL, len(data)) + 1):
        if data[-n:] in _PARTIAL_PREFIXES:
            return n
    return 0


def handle(client: socket.socket) -> None:
    upstream = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        upstream.connect(DOCKER_SOCK)
    except Exception as e:
        log.warning("Failed to connect to Docker socket: %s", e)
        client.close()
        return

    def client_to_upstream() -> None:
        carry = b""
        try:
            while True:
                chunk = client.recv(65536)
                if not chunk:
                    break
                data = carry + chunk
                rewritten = VERSION_RE.sub(rb'\1/v1.41/', data)
                n = _carry_len(rewritten)
                if n:
                    upstream.sendall(rewritten[:-n])
                    carry = rewritten[-n:]
                else:
                    upstream.sendall(rewritten)
                    carry = b""
        except Exception as e:
            log.warning("client→upstream error: %s", e)
        finally:
            if carry:
                try: upstream.sendall(carry)
                except Exception: pass
            try: upstream.shutdown(socket.SHUT_WR)
            except Exception: pass

    def upstream_to_client() -> None:
        try:
            while True:
                chunk = upstream.recv(65536)
                if not chunk:
                    break
                client.sendall(chunk)
        except Exception as e:
            log.warning("upstream→client error: %s", e)
        finally:
            try: client.shutdown(socket.SHUT_WR)
            except Exception: pass

    t1 = threading.Thread(target=client_to_upstream, daemon=True)
    t2 = threading.Thread(target=upstream_to_client, daemon=True)
    t1.start(); t2.start()
    t1.join(); t2.join()
    try: client.close()
    except Exception: pass
    try: upstream.close()
    except Exception: pass


server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
server.bind(("127.0.0.1", LISTEN_PORT))
server.listen(100)
log.info("Docker version proxy on tcp://127.0.0.1:%d", LISTEN_PORT)
while True:
    c, _ = server.accept()
    threading.Thread(target=handle, args=(c,), daemon=True).start()
