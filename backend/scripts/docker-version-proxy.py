#!/usr/bin/env python3
"""Proxy that rewrites Docker API version prefixes to v1.41 — request line only.

Design:
- Only the HTTP request line (first line, up to \\r\\n) is rewritten; headers and
  request bodies are streamed unchanged, preventing body-corruption for uploads.
- A per-connection state machine tracks whether we are still in the request line
  (rewriting mode) or past it (passthrough). Keep-alive is handled by re-arming
  rewriting when a new request line is detected at the start of a recv() chunk.
- A carry buffer holds back at most _MAX_PARTIAL trailing bytes that could be the
  start of a split version token, avoiding deadlocks on pending request completion.
- Listens on a Unix-domain socket (mode 0600) — no unauthenticated TCP exposure.
  Override the path via DOCKER_PROXY_SOCK; a live socket causes a fast-fail exit.
"""
import os, stat, sys, socket, threading, re, logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("docker-proxy")

PROXY_SOCK  = os.environ.get("DOCKER_PROXY_SOCK", "/tmp/docker-proxy.sock")
DOCKER_SOCK = "/var/run/docker.sock"
VERSION_RE  = re.compile(rb'((?:GET|POST|PUT|DELETE|HEAD|OPTIONS|PATCH) )/v1\.\d+/')

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
        # after_request_line=True: past the first \\r\\n; stream unchanged until
        # a new request line arrives (keep-alive detection).
        after_request_line = False
        try:
            while True:
                chunk = client.recv(65536)
                if not chunk:
                    break

                if after_request_line:
                    # Re-arm rewriting when a new request line starts.  docker-java
                    # (OkHttp) does not pipeline, so new-request data arrives in a
                    # fresh recv() call after the previous response is complete.
                    if any(chunk.startswith(m + b" ") for m in _METHODS):
                        after_request_line = False
                    else:
                        upstream.sendall(chunk)
                        continue

                # Rewriting mode: apply VERSION_RE to bytes up to end of request line.
                data = carry + chunk
                crlf = data.find(b"\r\n")
                if crlf != -1:
                    rewritten_line = VERSION_RE.sub(rb'\1/v1.41/', data[:crlf + 2])
                    upstream.sendall(rewritten_line)
                    rest = data[crlf + 2:]
                    if rest:
                        upstream.sendall(rest)
                    carry = b""
                    after_request_line = True
                else:
                    # Request line not yet complete; hold back potential version prefix.
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


# Clean up stale socket; fail fast if a live proxy already owns the path.
if os.path.exists(PROXY_SOCK):
    _st = os.lstat(PROXY_SOCK)
    if not stat.S_ISSOCK(_st.st_mode):
        sys.exit(
            f"[docker-proxy] {PROXY_SOCK} exists and is not a socket; refusing to remove it. "
            f"Set DOCKER_PROXY_SOCK to use a different path."
        )
    _probe = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        _probe.connect(PROXY_SOCK)
        _probe.close()
        sys.exit(
            f"[docker-proxy] A proxy is already listening on {PROXY_SOCK}. "
            f"Set DOCKER_PROXY_SOCK to use a different path."
        )
    except OSError as _e:
        import errno
        if _e.errno == errno.ECONNREFUSED:
            os.unlink(PROXY_SOCK)   # stale socket, safe to remove
        else:
            sys.exit(f"[docker-proxy] Unexpected error probing {PROXY_SOCK}: {_e}")

server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
server.bind(PROXY_SOCK)
os.chmod(PROXY_SOCK, 0o600)
server.listen(100)
log.info("Docker version proxy on unix://%s", PROXY_SOCK)
while True:
    c, _ = server.accept()
    threading.Thread(target=handle, args=(c,), daemon=True).start()
