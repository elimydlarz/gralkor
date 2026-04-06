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
