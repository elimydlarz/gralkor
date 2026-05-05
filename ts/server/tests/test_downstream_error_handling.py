"""Unit tests for downstream LLM error detection and mapping."""

from __future__ import annotations

import main as main_mod


class _Err(Exception):
    def __init__(self, msg, *, status_code=None, code=None):
        super().__init__(msg)
        if status_code is not None:
            self.status_code = status_code
        if code is not None:
            self.code = code


def test_find_downstream_llm_error_detects_status_code_400():
    exc = _Err("invalid model name", status_code=400)
    assert main_mod._find_downstream_llm_error(exc) is exc


def test_find_downstream_llm_error_ignores_429():
    exc = _Err("quota exceeded", status_code=429)
    assert main_mod._find_downstream_llm_error(exc) is None


def test_find_downstream_llm_error_detects_via_code_attribute():
    exc = _Err("API key expired", code=400)
    assert main_mod._find_downstream_llm_error(exc) is exc


def test_find_downstream_llm_error_walks_exception_chain():
    cause = _Err("API key expired", status_code=400)
    wrapper = RuntimeError("graphiti call failed")
    wrapper.__cause__ = cause
    assert main_mod._find_downstream_llm_error(wrapper) is cause


def test_find_downstream_llm_error_returns_none_when_no_status_code():
    exc = RuntimeError("connection refused")
    assert main_mod._find_downstream_llm_error(exc) is None


import json


def test_downstream_llm_response_400_non_credential_returns_500():
    exc = _Err("invalid model name", status_code=400)
    resp = main_mod._downstream_llm_response(exc)
    assert resp.status_code == 500
    body = json.loads(resp.body)
    assert body["error"] == "provider error"
    assert "invalid model name" in body["detail"]


def test_downstream_llm_response_400_credential_hint_returns_503():
    exc = _Err("400 INVALID_ARGUMENT: API key expired. Please renew the API key.", status_code=400)
    resp = main_mod._downstream_llm_response(exc)
    assert resp.status_code == 503
    body = json.loads(resp.body)
    assert body["error"] == "provider error"


def test_downstream_llm_response_401_returns_503():
    exc = _Err("invalid api key", status_code=401)
    assert main_mod._downstream_llm_response(exc).status_code == 503


def test_downstream_llm_response_403_returns_503():
    exc = _Err("permission denied", status_code=403)
    assert main_mod._downstream_llm_response(exc).status_code == 503


def test_downstream_llm_response_404_returns_500():
    exc = _Err("model not found", status_code=404)
    assert main_mod._downstream_llm_response(exc).status_code == 500


def test_downstream_llm_response_422_returns_500():
    exc = _Err("unprocessable entity", status_code=422)
    assert main_mod._downstream_llm_response(exc).status_code == 500


def test_downstream_llm_response_other_4xx_returns_502():
    exc = _Err("conflict", status_code=409)
    assert main_mod._downstream_llm_response(exc).status_code == 502


def test_downstream_llm_response_5xx_returns_502():
    exc = _Err("service unavailable", status_code=503)
    assert main_mod._downstream_llm_response(exc).status_code == 502
