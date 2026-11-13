"""Fetch a web page's readable text with SSRF protection.

Rules: only http/https; the hostname is resolved and EVERY resulting address must be a public
(global) IP - private, loopback, link-local (169.254.x.x cloud metadata), multicast, reserved
are blocked, which also blocks docker service names like `mongo`/`backend`. 10s timeout,
3 MB cap (streamed, so a huge page is never fully downloaded), max 5 redirects with each
redirect target re-checked, text/html only. We store clean text (trafilatura), never HTML.
"""
import asyncio
import ipaddress
import socket
from urllib.parse import urljoin, urlparse

import httpx
import trafilatura
from starlette.concurrency import run_in_threadpool

MAX_BYTES = 3 * 1024 * 1024
TIMEOUT = 10.0
MAX_REDIRECTS = 5
MAX_PARAGRAPHS = 2000
BLOCKED_NAMES = {"localhost", "mongo", "backend", "frontend"}


class WebpageError(Exception):
    """Raised with a user-friendly Hebrew message when fetching fails."""


def is_public_ip(addr: str) -> bool:
    try:
        ip = ipaddress.ip_address(addr.split("%")[0])
    except ValueError:
        return False
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    return ip.is_global and not ip.is_multicast


async def check_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise WebpageError("אפשר לשלוף רק כתובות שמתחילות ב-http:// או https://")
    host = (parsed.hostname or "").lower()
    if not host:
        raise WebpageError("הכתובת אינה תקינה")
    if host in BLOCKED_NAMES or host.endswith(".localhost") or host.endswith(".internal"):
        raise WebpageError("לא ניתן לשלוף כתובת פנימית")
    try:
        infos = await asyncio.get_running_loop().getaddrinfo(
            host, parsed.port or (443 if parsed.scheme == "https" else 80), type=socket.SOCK_STREAM)
    except (socket.gaierror, UnicodeError):
        raise WebpageError("לא מצאנו את האתר הזה. בדקי שהקישור נכון")
    if not infos or not all(is_public_ip(info[4][0]) for info in infos):
        raise WebpageError("לא ניתן לשלוף כתובת פנימית או פרטית")


def split_extracted(text: str) -> list[str]:
    paragraphs = [" ".join(p.split()) for p in text.split("\n")]
    return [p for p in paragraphs if p][:MAX_PARAGRAPHS]


def _extract(html: str) -> tuple[str | None, str | None, str | None]:
    text = trafilatura.extract(html, include_comments=False, include_tables=False)
    meta = trafilatura.extract_metadata(html)
    title = getattr(meta, "title", None) if meta else None
    site = getattr(meta, "sitename", None) if meta else None
    return text, title, site


async def fetch_readable_text(url: str) -> tuple[list[str], str | None]:
    """Return (paragraphs, site_name). Raises WebpageError on any failure."""
    current = url
    try:
        async with httpx.AsyncClient(
            follow_redirects=False, timeout=TIMEOUT,
            headers={"User-Agent": "Mozilla/5.0 (compatible; RewindReader/1.0)",
                     "Accept": "text/html,application/xhtml+xml"},
        ) as client:
            for _ in range(MAX_REDIRECTS + 1):
                await check_url(current)  # every hop is validated before connecting
                async with client.stream("GET", current) as resp:
                    if resp.is_redirect and "location" in resp.headers:
                        current = urljoin(current, resp.headers["location"])
                        continue
                    if resp.status_code >= 400:
                        raise WebpageError("הדף לא זמין כרגע (האתר החזיר שגיאה). נסי קישור אחר")
                    ctype = resp.headers.get("content-type", "").lower()
                    if "text/html" not in ctype and "application/xhtml" not in ctype:
                        raise WebpageError("הקישור לא מוביל לדף אינטרנט רגיל (HTML)")
                    body = bytearray()
                    async for chunk in resp.aiter_bytes():
                        body.extend(chunk)
                        if len(body) > MAX_BYTES:
                            raise WebpageError("הדף גדול מדי (מעל 3MB)")
                    encoding = resp.encoding or "utf-8"
                    break
            else:
                raise WebpageError("יותר מדי הפניות (redirects) בכתובת הזו")
    except httpx.TimeoutException:
        raise WebpageError("הדף לא הגיב בזמן (10 שניות). נסי שוב או קישור אחר")
    except httpx.HTTPError:
        raise WebpageError("לא הצלחנו להגיע לכתובת הזו")

    html = bytes(body).decode(encoding, errors="replace")
    text, _title, site = await run_in_threadpool(_extract, html)
    paragraphs = split_extracted(text or "")
    if not paragraphs:
        raise WebpageError("לא הצלחנו לשלוף טקסט קריא מהדף הזה. נסי קישור אחר, "
                           "או העתיקי את הטקסט והוסיפי אותו כ'טקסט להדבקה'")
    # The domain is clearer than metadata names like "Wikimedia Foundation, Inc.".
    host = (urlparse(current).hostname or "").removeprefix("www.")
    return paragraphs, host or site
