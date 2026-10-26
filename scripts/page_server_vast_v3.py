#!/usr/bin/env python3
"""Vast.ai URL adapter around the immutable v3 beta.16 Page server."""

import os
from http.server import ThreadingHTTPServer
from urllib.parse import quote

import page_server as v3


def _vast_url(internal_port):
    host = os.environ.get('PUBLIC_IPADDR', '').strip()
    port = os.environ.get(f'VAST_TCP_PORT_{internal_port}', '').strip()
    return f'http://{host}:{port}' if host and port else None


def mcp_url():
    code = v3.mcp_code()
    if not code:
        return None
    explicit = os.environ.get('KENDO_MCP_PUBLIC_URL', '').strip()
    if explicit:
        return explicit.replace('{code}', quote(code, safe=''))
    public = _vast_url(v3.MCP_PORT)
    if public:
        return f'{public}/mcp/{quote(code, safe="")}'
    return f'http://127.0.0.1:{v3.MCP_PORT}/mcp/{quote(code, safe="")}'


def comfy_url():
    explicit = os.environ.get('KENDO_COMFY_PUBLIC_URL', '').strip()
    if explicit:
        return explicit.rstrip('/') + '/'
    public = _vast_url(v3.COMFY_PORT)
    if public:
        return public + '/'
    return f'http://127.0.0.1:{v3.COMFY_PORT}/'


v3.mcp_url = mcp_url
v3.comfy_url = comfy_url


if __name__ == '__main__':
    ThreadingHTTPServer((v3.base.LISTEN_HOST, v3.base.LISTEN_PORT), v3.V3Handler).serve_forever()
