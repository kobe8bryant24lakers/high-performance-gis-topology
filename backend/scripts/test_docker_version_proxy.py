#!/usr/bin/env python3
"""Regression tests for docker-version-proxy.py.

Verifies that:
- VERSION_RE rewrites are applied correctly even when the request line is
  fragmented across two TCP segments at every possible byte offset.
- Request bodies are never rewritten, even when they contain version-like strings.
- Keep-alive: the second request on a reused connection is also rewritten.
"""
import importlib.util, pathlib, unittest
import unittest.mock as _mock

_proxy_path = pathlib.Path(__file__).parent / "docker-version-proxy.py"

with _mock.patch("socket.socket") as _mock_sock_cls, \
     _mock.patch("os.path.exists", return_value=False), \
     _mock.patch("os.lstat"), \
     _mock.patch("os.chmod"):
    _mock_sock_cls.return_value.accept.side_effect = OSError("test teardown")
    spec = importlib.util.spec_from_file_location("docker_version_proxy", _proxy_path)
    _proxy = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(_proxy)
    except OSError:
        pass

_carry_len         = _proxy._carry_len
_is_pattern_prefix = _proxy._is_pattern_prefix
VERSION_RE         = _proxy.VERSION_RE
_MAX_PARTIAL       = _proxy._MAX_PARTIAL
_METHODS           = _proxy._METHODS


def _simulate(request_bytes: bytes, split: int) -> bytes:
    """Feed request_bytes in two chunks ([:split] and [split:]) through the
    proxy's client_to_upstream state machine and return the accumulated output.

    Matches the logic in client_to_upstream(): only the HTTP request line
    (bytes up to the first \\r\\n) is rewritten; everything after is forwarded
    unchanged.  Keep-alive re-arms when a chunk starts with an HTTP method."""
    out = b""
    carry = b""
    after_request_line = False

    for chunk in (request_bytes[:split], request_bytes[split:]):
        if not chunk:
            continue

        if after_request_line:
            if any(chunk.startswith(m + b" ") for m in _METHODS):
                after_request_line = False   # new request detected; fall through
            else:
                out += chunk
                continue

        # Rewriting mode: VERSION_RE applied only to bytes before first \\r\\n.
        data = carry + chunk
        crlf = data.find(b"\r\n")
        if crlf != -1:
            rewritten_line = VERSION_RE.sub(rb'\1/v1.41/', data[:crlf + 2])
            out += rewritten_line + data[crlf + 2:]   # rest from original, not rewritten
            carry = b""
            after_request_line = True
        else:
            rewritten = VERSION_RE.sub(rb'\1/v1.41/', data)
            n = _carry_len(rewritten)
            if n:
                out += rewritten[:-n]
                carry = rewritten[-n:]
            else:
                out += rewritten
                carry = b""

    out += carry
    return out


class TestIsPatternPrefix(unittest.TestCase):
    def test_method_prefixes(self):
        for frag in (b"G", b"GE", b"GET", b"GET ", b"GET /", b"GET /v", b"GET /v1", b"GET /v1."):
            self.assertTrue(_is_pattern_prefix(frag), frag)

    def test_digit_prefixes(self):
        for frag in (b"GET /v1.4", b"GET /v1.32", b"GET /v1.123",
                     b"POST /v1.4", b"DELETE /v1.20"):
            self.assertTrue(_is_pattern_prefix(frag), frag)

    def test_non_prefixes(self):
        self.assertFalse(_is_pattern_prefix(b""))
        self.assertFalse(_is_pattern_prefix(b"GET /v1.41/"))   # complete, not a prefix
        self.assertFalse(_is_pattern_prefix(b"HTTP/1.1"))
        self.assertFalse(_is_pattern_prefix(b"GET /v2."))


class TestCarryLen(unittest.TestCase):
    def test_no_carry_for_complete_request(self):
        line = b"GET /v1.32/containers/json HTTP/1.1\r\n"
        rewritten = VERSION_RE.sub(rb'\1/v1.41/', line)
        self.assertEqual(_carry_len(rewritten), 0)

    def test_carry_for_partial_method(self):
        self.assertGreater(_carry_len(b"some-prefix\r\nGET"), 0)

    def test_carry_for_partial_version(self):
        self.assertGreater(_carry_len(b"GET /v1.3"), 0)
        self.assertGreater(_carry_len(b"POST /v1."), 0)

    def test_no_carry_for_normal_data(self):
        self.assertEqual(_carry_len(b"Content-Type: application/json\r\n"), 0)


class TestVersionRewriteAllSplits(unittest.TestCase):
    """Split every request line at every byte offset and verify correct rewrite."""

    def _expected(self, original: bytes) -> bytes:
        """Expected output: only the request line is rewritten."""
        crlf = original.find(b"\r\n")
        if crlf == -1:
            return VERSION_RE.sub(rb'\1/v1.41/', original)
        return VERSION_RE.sub(rb'\1/v1.41/', original[:crlf + 2]) + original[crlf + 2:]

    def _check(self, original: bytes):
        expected = self._expected(original)
        for split in range(0, len(original) + 1):
            result = _simulate(original, split)
            self.assertEqual(
                result, expected,
                f"split={split} original={original!r}\ngot={result!r}\nwant={expected!r}"
            )

    def test_get_v1_32(self):
        self._check(b"GET /v1.32/containers/json HTTP/1.1\r\nHost: localhost\r\n\r\n")

    def test_already_v1_41(self):
        self._check(b"GET /v1.41/containers/json HTTP/1.1\r\nHost: localhost\r\n\r\n")

    def test_post_v1_32(self):
        self._check(b"POST /v1.32/containers/create HTTP/1.1\r\n\r\n{}")

    def test_delete_v1_20(self):
        self._check(b"DELETE /v1.20/containers/abc HTTP/1.1\r\n\r\n")

    def test_get_v1_4(self):
        self._check(b"GET /v1.4/images/json HTTP/1.1\r\n\r\n")

    def test_options_v1_123(self):
        self._check(b"OPTIONS /v1.123/version HTTP/1.1\r\n\r\n")

    def test_no_v1_32_in_output(self):
        """No /v1.32/ survives rewriting in the request line."""
        req = b"GET /v1.32/version HTTP/1.1\r\n\r\n"
        for split in range(len(req) + 1):
            result = _simulate(req, split)
            self.assertNotIn(b"/v1.32/", result, f"split={split}")


class TestBodyNotRewritten(unittest.TestCase):
    """Request bodies must never be rewritten, even when they contain version patterns."""

    def test_post_body_with_version_pattern(self):
        """A POST body containing GET /v1.32/ must reach the daemon unmodified."""
        body = b'{"path": "GET /v1.32/containers"}'
        req = b"POST /v1.32/build HTTP/1.1\r\nContent-Length: 33\r\n\r\n" + body
        result = _simulate(req, len(req))
        self.assertIn(b"POST /v1.41/build", result)     # request line rewritten
        self.assertIn(body, result)                      # body intact

    def test_body_not_rewritten_same_chunk(self):
        """Body arriving in the same recv() chunk as headers is never rewritten."""
        body = b'{"path": "GET /v1.32/containers"}'
        req = b"POST /v1.32/exec HTTP/1.1\r\n\r\n" + body
        result = _simulate(req, 0)   # all in one chunk
        self.assertIn(b"POST /v1.41/exec", result)
        self.assertIn(body, result)

    def test_body_not_rewritten_own_chunk_non_method_start(self):
        """Body chunk that does not start with an HTTP method is forwarded unchanged.

        The proxy's keep-alive heuristic only re-arms when a chunk starts with
        METHOD<space>.  Docker API JSON bodies start with '{', so they are safe.
        """
        body = b'{"action": "rebuild", "path": "GET /v1.32/containers"}'
        req = b"POST /v1.32/exec HTTP/1.1\r\n\r\n" + body
        headers_len = len(b"POST /v1.32/exec HTTP/1.1\r\n\r\n")
        result = _simulate(req, headers_len)   # split at exact headers/body boundary
        self.assertIn(b"POST /v1.41/exec", result)
        self.assertIn(body, result)

    def test_header_value_not_rewritten(self):
        """Header values containing version-like strings are not rewritten."""
        req = b"GET /v1.32/version HTTP/1.1\r\nX-Custom: GET /v1.32/foo\r\n\r\n"
        result = _simulate(req, len(req))
        self.assertIn(b"GET /v1.41/version", result)            # request line rewritten
        self.assertIn(b"X-Custom: GET /v1.32/foo", result)      # header value intact


class TestKeepAlive(unittest.TestCase):
    """Keep-alive: second request on a reused connection must also be rewritten."""

    def test_two_requests_at_exact_boundary(self):
        """Split at the exact boundary between request 1 and request 2."""
        req1 = b"GET /v1.32/version HTTP/1.1\r\n\r\n"
        req2 = b"GET /v1.32/containers/json HTTP/1.1\r\n\r\n"
        result = _simulate(req1 + req2, len(req1))
        self.assertIn(b"GET /v1.41/version", result)
        self.assertIn(b"GET /v1.41/containers/json", result)
        self.assertNotIn(b"/v1.32/", result)

    def test_post_then_get(self):
        """POST with body followed by a GET on the same connection."""
        req1 = b"POST /v1.32/containers/create HTTP/1.1\r\n\r\n{}"
        req2 = b"GET /v1.32/version HTTP/1.1\r\n\r\n"
        result = _simulate(req1 + req2, len(req1))
        self.assertIn(b"POST /v1.41/containers/create", result)
        self.assertIn(b"GET /v1.41/version", result)
        self.assertNotIn(b"/v1.32/", result)


if __name__ == "__main__":
    unittest.main()
