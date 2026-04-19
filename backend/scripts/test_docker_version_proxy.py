#!/usr/bin/env python3
"""Regression tests for docker-version-proxy.py.

Verifies that VERSION_RE rewrites are applied correctly even when the
request line is fragmented across two TCP segments at every possible
byte offset.
"""
import importlib.util, pathlib, sys, unittest

# Load proxy module without executing the server startup at module scope.
# We patch socket.socket before import to prevent the server from binding.
import socket as _socket_module
import unittest.mock as _mock

_proxy_path = pathlib.Path(__file__).parent / "docker-version-proxy.py"

with _mock.patch("socket.socket") as _mock_sock_cls, \
     _mock.patch("os.unlink"), \
     _mock.patch("os.chmod"):
    # Make server.accept() raise OSError on first call so the while-loop exits
    _mock_sock_cls.return_value.accept.side_effect = OSError("test teardown")
    spec = importlib.util.spec_from_file_location("docker_version_proxy", _proxy_path)
    _proxy = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(_proxy)
    except OSError:
        pass

_carry_len  = _proxy._carry_len
_is_pattern_prefix = _proxy._is_pattern_prefix
VERSION_RE  = _proxy.VERSION_RE
_MAX_PARTIAL = _proxy._MAX_PARTIAL


def _simulate(request_bytes: bytes, split: int) -> bytes:
    """Feed request_bytes in two chunks ([:split] and [split:]) through the
    carry+rewrite logic and return the accumulated output."""
    out = b""
    carry = b""

    for chunk in (request_bytes[:split], request_bytes[split:]):
        if not chunk:
            continue
        data = carry + chunk
        rewritten = VERSION_RE.sub(rb'\1/v1.41/', data)
        n = _carry_len(rewritten)
        if n:
            out += rewritten[:-n]
            carry = rewritten[-n:]
        else:
            out += rewritten
            carry = b""

    # flush any remaining carry
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
        # After rewrite the line no longer contains /v1.32/; carry should be 0
        rewritten = VERSION_RE.sub(rb'\1/v1.41/', line)
        self.assertEqual(_carry_len(rewritten), 0)

    def test_carry_for_partial_method(self):
        # Data ending mid-method
        self.assertGreater(_carry_len(b"some-prefix\r\nGET"), 0)

    def test_carry_for_partial_version(self):
        self.assertGreater(_carry_len(b"GET /v1.3"), 0)
        self.assertGreater(_carry_len(b"POST /v1."), 0)

    def test_no_carry_for_normal_data(self):
        self.assertEqual(_carry_len(b"Content-Type: application/json\r\n"), 0)


class TestVersionRewriteAllSplits(unittest.TestCase):
    """Split every canonical request line at every byte offset and verify
    the full output is correctly rewritten."""

    REQUESTS = [
        b"GET /v1.32/containers/json HTTP/1.1\r\nHost: localhost\r\n\r\n",
        b"GET /v1.41/containers/json HTTP/1.1\r\nHost: localhost\r\n\r\n",  # already v1.41
        b"POST /v1.32/containers/create HTTP/1.1\r\n\r\n{}",
        b"DELETE /v1.20/containers/abc HTTP/1.1\r\n\r\n",
        b"GET /v1.4/images/json HTTP/1.1\r\n\r\n",
        b"OPTIONS /v1.123/version HTTP/1.1\r\n\r\n",
    ]

    def _check(self, original: bytes):
        expected = VERSION_RE.sub(rb'\1/v1.41/', original)
        for split in range(0, len(original) + 1):
            result = _simulate(original, split)
            self.assertEqual(
                result, expected,
                f"split={split} original={original!r}\ngot={result!r}\nwant={expected!r}"
            )

    def test_get_v1_32(self):
        self._check(self.REQUESTS[0])

    def test_already_v1_41(self):
        self._check(self.REQUESTS[1])

    def test_post_v1_32(self):
        self._check(self.REQUESTS[2])

    def test_delete_v1_20(self):
        self._check(self.REQUESTS[3])

    def test_get_v1_4(self):
        self._check(self.REQUESTS[4])

    def test_options_v1_123(self):
        self._check(self.REQUESTS[5])

    def test_no_v1_32_in_output(self):
        """No /v1.32/ survives rewriting regardless of split point."""
        req = b"GET /v1.32/version HTTP/1.1\r\n\r\n"
        for split in range(len(req) + 1):
            result = _simulate(req, split)
            self.assertNotIn(b"/v1.32/", result, f"split={split}")

    def test_consecutive_requests_on_same_connection(self):
        """Two requests concatenated (keep-alive) are both rewritten."""
        two = (b"GET /v1.32/version HTTP/1.1\r\n\r\n"
               b"GET /v1.32/containers/json HTTP/1.1\r\n\r\n")
        expected = VERSION_RE.sub(rb'\1/v1.41/', two)
        for split in range(len(two) + 1):
            result = _simulate(two, split)
            self.assertEqual(result, expected, f"split={split}")


if __name__ == "__main__":
    unittest.main()
