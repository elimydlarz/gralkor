"""Reifies gralkor/TEST_TREES.md > Retry ownership > Vertex-upstream rate-limit class.

The google-genai SDK (L6.5) owns retries for HTTP 429 only. 408/5xx surface
immediately through the server's downstream-error-handling envelope. No layer
above the SDK retries this class.
"""

from __future__ import annotations

import main as main_mod


def test_genai_client_http_options_per_attempt_timeout_is_set():
    client = main_mod._build_genai_client()
    http_options = client._api_client._http_options

    assert http_options.timeout == 3_000


def test_genai_client_http_options_retry_attempts_is_bounded_to_two():
    client = main_mod._build_genai_client()
    retry_options = client._api_client._http_options.retry_options

    assert retry_options is not None
    assert retry_options.attempts == 2


def test_genai_client_http_options_retry_backoff_is_flat_one_second():
    client = main_mod._build_genai_client()
    retry_options = client._api_client._http_options.retry_options

    assert retry_options.initial_delay == 1.0
    assert retry_options.exp_base == 1


def test_genai_client_http_options_retry_targets_429_only():
    client = main_mod._build_genai_client()
    retry_options = client._api_client._http_options.retry_options

    assert set(retry_options.http_status_codes) == {429}
