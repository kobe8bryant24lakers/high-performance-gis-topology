#!/usr/bin/env python3
"""Proxy that rewrites ALL Docker API version prefixes to v1.41.

Design: forwarding is streaming with a minimal "bridge buffer" that holds
back only bytes that could form the START of a version pattern spanning a
TCP-packet boundary.  Body bytes and response data are never buffered, so
there is no risk of deadlocking on pending request completion.

Listens on a Unix-domain socket (/tmp/docker-proxy.sock, mode 0600) so only
the owning user can connect — no unauthenticated TCP exposure.
"""
import os, socket, threading, re, logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("docker-proxy")

PROXY_SOCK   = "/tmp/docker-proxy.sock"
DOCKER_SOCK  = "/var/run/docker.sock"
VERSION_RE   = re.compile(rb'((?:GET|POST|PUT|DELETE|HEAD|OPTIONS|PATCH) )/v1\.\d+/')

_METHODS = [b"GET", b"POST", b"PUT", b"DELETE", b"HEAD", b"OPTIONS", b"PATCH"]
# Maximum bytes we ever need to carry: longest method + " /v1." + up to 3 digits
_MAX_PARTIAL = max(len(m) for m in _METHODS) + len(b" /v1.") + 3


def _is_pattern_prefix(s: bytes) -> bool:
    """True iff s is a non-empty proper prefix of a string that VERSION_RE can match."""
    if not s:
        return False
    for method in _METHODS:
        stem = method + b" /v1."
        if stem.startswith(s):          # e.g. s == b"GET" or b"GET /v1"
            return True
        if s.startswith(stem):
            rest = s[len(stem):]        # digits seen so far after "v1."
            if 1 <= len(rest) <= 3 and rest.isdigit():
                return True             # e.g. s == b"GET /v1.4" or b"POST /v1.32"
    return False


def _carry_len(data: bytes) -> int:
    """Return how many trailing bytes of *data* must be held for the next chunk."""
    for n in range(min(_MAX_PARTIAL, len(data)), 0, -1):
        if _is_pattern_prefix(data[-n:]):
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


try:
    os.unlink(PROXY_SOCK)
except FileNotFoundError:
    pass

server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
server.bind(PROXY_SOCK)
os.chmod(PROXY_SOCK, 0o600)
server.listen(100)
log.info("Docker version proxy on unix://%s", PROXY_SOCK)
while True:
    c, _ = server.accept()
    threading.Thread(target=handle, args=(c,), daemon=True).start()
