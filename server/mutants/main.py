"""Thin FastAPI server wrapping graphiti-core for the Gralkor plugin."""

from __future__ import annotations

import asyncio
import logging
import os
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Literal

import yaml
from fastapi import FastAPI, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, create_model



from graphiti_core import Graphiti
from graphiti_core.driver.falkordb_driver import FalkorDriver
from graphiti_core.edges import EntityEdge
from graphiti_core.nodes import CommunityNode, EntityNode, EpisodicNode, EpisodeType, Node
from graphiti_core.llm_client import LLMConfig
from typing import Annotated
from typing import Callable
from typing import ClassVar

MutantDict = Annotated[dict[str, Callable], "Mutant"] # type: ignore


def _mutmut_trampoline(orig, mutants, call_args, call_kwargs, self_arg = None): # type: ignore
    """Forward call to original or mutated function, depending on the environment"""
    import os # type: ignore
    mutant_under_test = os.environ['MUTANT_UNDER_TEST'] # type: ignore
    if mutant_under_test == 'fail': # type: ignore
        from mutmut.__main__ import MutmutProgrammaticFailException # type: ignore
        raise MutmutProgrammaticFailException('Failed programmatically')       # type: ignore
    elif mutant_under_test == 'stats': # type: ignore
        from mutmut.__main__ import record_trampoline_hit # type: ignore
        record_trampoline_hit(orig.__module__ + '.' + orig.__name__) # type: ignore
        # (for class methods, orig is bound and thus does not need the explicit self argument)
        result = orig(*call_args, **call_kwargs) # type: ignore
        return result # type: ignore
    prefix = orig.__module__ + '.' + orig.__name__ + '__mutmut_' # type: ignore
    if not mutant_under_test.startswith(prefix): # type: ignore
        result = orig(*call_args, **call_kwargs) # type: ignore
        return result # type: ignore
    mutant_name = mutant_under_test.rpartition('.')[-1] # type: ignore
    if self_arg is not None: # type: ignore
        # call to a class method where self is not bound
        result = mutants[mutant_name](self_arg, *call_args, **call_kwargs) # type: ignore
    else:
        result = mutants[mutant_name](*call_args, **call_kwargs) # type: ignore
    return result # type: ignore


# ── Config ────────────────────────────────────────────────────


def _load_config() -> dict:
    args = []# type: ignore
    kwargs = {}# type: ignore
    return _mutmut_trampoline(x__load_config__mutmut_orig, x__load_config__mutmut_mutants, args, kwargs, None)


# ── Config ────────────────────────────────────────────────────


def x__load_config__mutmut_orig() -> dict:
    path = os.getenv("CONFIG_PATH", "/app/config.yaml")
    if os.path.exists(path):
        with open(path) as f:
            return yaml.safe_load(f) or {}
    return {}


# ── Config ────────────────────────────────────────────────────


def x__load_config__mutmut_1() -> dict:
    path = None
    if os.path.exists(path):
        with open(path) as f:
            return yaml.safe_load(f) or {}
    return {}


# ── Config ────────────────────────────────────────────────────


def x__load_config__mutmut_2() -> dict:
    path = os.getenv(None, "/app/config.yaml")
    if os.path.exists(path):
        with open(path) as f:
            return yaml.safe_load(f) or {}
    return {}


# ── Config ────────────────────────────────────────────────────


def x__load_config__mutmut_3() -> dict:
    path = os.getenv("CONFIG_PATH", None)
    if os.path.exists(path):
        with open(path) as f:
            return yaml.safe_load(f) or {}
    return {}


# ── Config ────────────────────────────────────────────────────


def x__load_config__mutmut_4() -> dict:
    path = os.getenv("/app/config.yaml")
    if os.path.exists(path):
        with open(path) as f:
            return yaml.safe_load(f) or {}
    return {}


# ── Config ────────────────────────────────────────────────────


def x__load_config__mutmut_5() -> dict:
    path = os.getenv("CONFIG_PATH", )
    if os.path.exists(path):
        with open(path) as f:
            return yaml.safe_load(f) or {}
    return {}


# ── Config ────────────────────────────────────────────────────


def x__load_config__mutmut_6() -> dict:
    path = os.getenv("XXCONFIG_PATHXX", "/app/config.yaml")
    if os.path.exists(path):
        with open(path) as f:
            return yaml.safe_load(f) or {}
    return {}


# ── Config ────────────────────────────────────────────────────


def x__load_config__mutmut_7() -> dict:
    path = os.getenv("config_path", "/app/config.yaml")
    if os.path.exists(path):
        with open(path) as f:
            return yaml.safe_load(f) or {}
    return {}


# ── Config ────────────────────────────────────────────────────


def x__load_config__mutmut_8() -> dict:
    path = os.getenv("CONFIG_PATH", "XX/app/config.yamlXX")
    if os.path.exists(path):
        with open(path) as f:
            return yaml.safe_load(f) or {}
    return {}


# ── Config ────────────────────────────────────────────────────


def x__load_config__mutmut_9() -> dict:
    path = os.getenv("CONFIG_PATH", "/APP/CONFIG.YAML")
    if os.path.exists(path):
        with open(path) as f:
            return yaml.safe_load(f) or {}
    return {}


# ── Config ────────────────────────────────────────────────────


def x__load_config__mutmut_10() -> dict:
    path = os.getenv("CONFIG_PATH", "/app/config.yaml")
    if os.path.exists(None):
        with open(path) as f:
            return yaml.safe_load(f) or {}
    return {}

x__load_config__mutmut_mutants : ClassVar[MutantDict] = { # type: ignore
'x__load_config__mutmut_1': x__load_config__mutmut_1, 
    'x__load_config__mutmut_2': x__load_config__mutmut_2, 
    'x__load_config__mutmut_3': x__load_config__mutmut_3, 
    'x__load_config__mutmut_4': x__load_config__mutmut_4, 
    'x__load_config__mutmut_5': x__load_config__mutmut_5, 
    'x__load_config__mutmut_6': x__load_config__mutmut_6, 
    'x__load_config__mutmut_7': x__load_config__mutmut_7, 
    'x__load_config__mutmut_8': x__load_config__mutmut_8, 
    'x__load_config__mutmut_9': x__load_config__mutmut_9, 
    'x__load_config__mutmut_10': x__load_config__mutmut_10
}
x__load_config__mutmut_orig.__name__ = 'x__load_config'


def _build_llm_client(cfg: dict):
    args = [cfg]# type: ignore
    kwargs = {}# type: ignore
    return _mutmut_trampoline(x__build_llm_client__mutmut_orig, x__build_llm_client__mutmut_mutants, args, kwargs, None)


def x__build_llm_client__mutmut_orig(cfg: dict):
    provider = cfg.get("llm", {}).get("provider", "gemini")
    model = cfg.get("llm", {}).get("model")
    llm_cfg = LLMConfig(model=model) if model else None

    if provider == "anthropic":
        from graphiti_core.llm_client.anthropic_client import AnthropicClient

        return AnthropicClient(config=llm_cfg)
    if provider == "gemini":
        from graphiti_core.llm_client.gemini_client import GeminiClient

        return GeminiClient(config=llm_cfg)
    if provider == "groq":
        from graphiti_core.llm_client.groq_client import GroqClient

        return GroqClient(config=llm_cfg)

    # Default: openai (also covers azure_openai with base_url set via env)
    from graphiti_core.llm_client import OpenAIClient

    return OpenAIClient(config=llm_cfg)


def x__build_llm_client__mutmut_1(cfg: dict):
    provider = None
    model = cfg.get("llm", {}).get("model")
    llm_cfg = LLMConfig(model=model) if model else None

    if provider == "anthropic":
        from graphiti_core.llm_client.anthropic_client import AnthropicClient

        return AnthropicClient(config=llm_cfg)
    if provider == "gemini":
        from graphiti_core.llm_client.gemini_client import GeminiClient

        return GeminiClient(config=llm_cfg)
    if provider == "groq":
        from graphiti_core.llm_client.groq_client import GroqClient

        return GroqClient(config=llm_cfg)

    # Default: openai (also covers azure_openai with base_url set via env)
    from graphiti_core.llm_client import OpenAIClient

    return OpenAIClient(config=llm_cfg)


def x__build_llm_client__mutmut_2(cfg: dict):
    provider = cfg.get("llm", {}).get(None, "gemini")
    model = cfg.get("llm", {}).get("model")
    llm_cfg = LLMConfig(model=model) if model else None

    if provider == "anthropic":
        from graphiti_core.llm_client.anthropic_client import AnthropicClient

        return AnthropicClient(config=llm_cfg)
    if provider == "gemini":
        from graphiti_core.llm_client.gemini_client import GeminiClient

        return GeminiClient(config=llm_cfg)
    if provider == "groq":
        from graphiti_core.llm_client.groq_client import GroqClient

        return GroqClient(config=llm_cfg)

    # Default: openai (also covers azure_openai with base_url set via env)
    from graphiti_core.llm_client import OpenAIClient

    return OpenAIClient(config=llm_cfg)


def x__build_llm_client__mutmut_3(cfg: dict):
    provider = cfg.get("llm", {}).get("provider", None)
    model = cfg.get("llm", {}).get("model")
    llm_cfg = LLMConfig(model=model) if model else None

    if provider == "anthropic":
        from graphiti_core.llm_client.anthropic_client import AnthropicClient

        return AnthropicClient(config=llm_cfg)
    if provider == "gemini":
        from graphiti_core.llm_client.gemini_client import GeminiClient

        return GeminiClient(config=llm_cfg)
    if provider == "groq":
        from graphiti_core.llm_client.groq_client import GroqClient

        return GroqClient(config=llm_cfg)

    # Default: openai (also covers azure_openai with base_url set via env)
    from graphiti_core.llm_client import OpenAIClient

    return OpenAIClient(config=llm_cfg)


def x__build_llm_client__mutmut_4(cfg: dict):
    provider = cfg.get("llm", {}).get("gemini")
    model = cfg.get("llm", {}).get("model")
    llm_cfg = LLMConfig(model=model) if model else None

    if provider == "anthropic":
        from graphiti_core.llm_client.anthropic_client import AnthropicClient

        return AnthropicClient(config=llm_cfg)
    if provider == "gemini":
        from graphiti_core.llm_client.gemini_client import GeminiClient

        return GeminiClient(config=llm_cfg)
    if provider == "groq":
        from graphiti_core.llm_client.groq_client import GroqClient

        return GroqClient(config=llm_cfg)

    # Default: openai (also covers azure_openai with base_url set via env)
    from graphiti_core.llm_client import OpenAIClient

    return OpenAIClient(config=llm_cfg)


def x__build_llm_client__mutmut_5(cfg: dict):
    provider = cfg.get("llm", {}).get("provider", )
    model = cfg.get("llm", {}).get("model")
    llm_cfg = LLMConfig(model=model) if model else None

    if provider == "anthropic":
        from graphiti_core.llm_client.anthropic_client import AnthropicClient

        return AnthropicClient(config=llm_cfg)
    if provider == "gemini":
        from graphiti_core.llm_client.gemini_client import GeminiClient

        return GeminiClient(config=llm_cfg)
    if provider == "groq":
        from graphiti_core.llm_client.groq_client import GroqClient

        return GroqClient(config=llm_cfg)

    # Default: openai (also covers azure_openai with base_url set via env)
    from graphiti_core.llm_client import OpenAIClient

    return OpenAIClient(config=llm_cfg)


def x__build_llm_client__mutmut_6(cfg: dict):
    provider = cfg.get(None, {}).get("provider", "gemini")
    model = cfg.get("llm", {}).get("model")
    llm_cfg = LLMConfig(model=model) if model else None

    if provider == "anthropic":
        from graphiti_core.llm_client.anthropic_client import AnthropicClient

        return AnthropicClient(config=llm_cfg)
    if provider == "gemini":
        from graphiti_core.llm_client.gemini_client import GeminiClient

        return GeminiClient(config=llm_cfg)
    if provider == "groq":
        from graphiti_core.llm_client.groq_client import GroqClient

        return GroqClient(config=llm_cfg)

    # Default: openai (also covers azure_openai with base_url set via env)
    from graphiti_core.llm_client import OpenAIClient

    return OpenAIClient(config=llm_cfg)


def x__build_llm_client__mutmut_7(cfg: dict):
    provider = cfg.get("llm", None).get("provider", "gemini")
    model = cfg.get("llm", {}).get("model")
    llm_cfg = LLMConfig(model=model) if model else None

    if provider == "anthropic":
        from graphiti_core.llm_client.anthropic_client import AnthropicClient

        return AnthropicClient(config=llm_cfg)
    if provider == "gemini":
        from graphiti_core.llm_client.gemini_client import GeminiClient

        return GeminiClient(config=llm_cfg)
    if provider == "groq":
        from graphiti_core.llm_client.groq_client import GroqClient

        return GroqClient(config=llm_cfg)

    # Default: openai (also covers azure_openai with base_url set via env)
    from graphiti_core.llm_client import OpenAIClient

    return OpenAIClient(config=llm_cfg)


def x__build_llm_client__mutmut_8(cfg: dict):
    provider = cfg.get({}).get("provider", "gemini")
    model = cfg.get("llm", {}).get("model")
    llm_cfg = LLMConfig(model=model) if model else None

    if provider == "anthropic":
        from graphiti_core.llm_client.anthropic_client import AnthropicClient

        return AnthropicClient(config=llm_cfg)
    if provider == "gemini":
        from graphiti_core.llm_client.gemini_client import GeminiClient

        return GeminiClient(config=llm_cfg)
    if provider == "groq":
        from graphiti_core.llm_client.groq_client import GroqClient

        return GroqClient(config=llm_cfg)

    # Default: openai (also covers azure_openai with base_url set via env)
    from graphiti_core.llm_client import OpenAIClient

    return OpenAIClient(config=llm_cfg)


def x__build_llm_client__mutmut_9(cfg: dict):
    provider = cfg.get("llm", ).get("provider", "gemini")
    model = cfg.get("llm", {}).get("model")
    llm_cfg = LLMConfig(model=model) if model else None

    if provider == "anthropic":
        from graphiti_core.llm_client.anthropic_client import AnthropicClient

        return AnthropicClient(config=llm_cfg)
    if provider == "gemini":
        from graphiti_core.llm_client.gemini_client import GeminiClient

        return GeminiClient(config=llm_cfg)
    if provider == "groq":
        from graphiti_core.llm_client.groq_client import GroqClient

        return GroqClient(config=llm_cfg)

    # Default: openai (also covers azure_openai with base_url set via env)
    from graphiti_core.llm_client import OpenAIClient

    return OpenAIClient(config=llm_cfg)


def x__build_llm_client__mutmut_10(cfg: dict):
    provider = cfg.get("XXllmXX", {}).get("provider", "gemini")
    model = cfg.get("llm", {}).get("model")
    llm_cfg = LLMConfig(model=model) if model else None

    if provider == "anthropic":
        from graphiti_core.llm_client.anthropic_client import AnthropicClient

        return AnthropicClient(config=llm_cfg)
    if provider == "gemini":
        from graphiti_core.llm_client.gemini_client import GeminiClient

        return GeminiClient(config=llm_cfg)
    if provider == "groq":
        from graphiti_core.llm_client.groq_client import GroqClient

        return GroqClient(config=llm_cfg)

    # Default: openai (also covers azure_openai with base_url set via env)
    from graphiti_core.llm_client import OpenAIClient

    return OpenAIClient(config=llm_cfg)


def x__build_llm_client__mutmut_11(cfg: dict):
    provider = cfg.get("LLM", {}).get("provider", "gemini")
    model = cfg.get("llm", {}).get("model")
    llm_cfg = LLMConfig(model=model) if model else None

    if provider == "anthropic":
        from graphiti_core.llm_client.anthropic_client import AnthropicClient

        return AnthropicClient(config=llm_cfg)
    if provider == "gemini":
        from graphiti_core.llm_client.gemini_client import GeminiClient

        return GeminiClient(config=llm_cfg)
    if provider == "groq":
        from graphiti_core.llm_client.groq_client import GroqClient

        return GroqClient(config=llm_cfg)

    # Default: openai (also covers azure_openai with base_url set via env)
    from graphiti_core.llm_client import OpenAIClient

    return OpenAIClient(config=llm_cfg)


def x__build_llm_client__mutmut_12(cfg: dict):
    provider = cfg.get("llm", {}).get("XXproviderXX", "gemini")
    model = cfg.get("llm", {}).get("model")
    llm_cfg = LLMConfig(model=model) if model else None

    if provider == "anthropic":
        from graphiti_core.llm_client.anthropic_client import AnthropicClient

        return AnthropicClient(config=llm_cfg)
    if provider == "gemini":
        from graphiti_core.llm_client.gemini_client import GeminiClient

        return GeminiClient(config=llm_cfg)
    if provider == "groq":
        from graphiti_core.llm_client.groq_client import GroqClient

        return GroqClient(config=llm_cfg)

    # Default: openai (also covers azure_openai with base_url set via env)
    from graphiti_core.llm_client import OpenAIClient

    return OpenAIClient(config=llm_cfg)


def x__build_llm_client__mutmut_13(cfg: dict):
    provider = cfg.get("llm", {}).get("PROVIDER", "gemini")
    model = cfg.get("llm", {}).get("model")
    llm_cfg = LLMConfig(model=model) if model else None

    if provider == "anthropic":
        from graphiti_core.llm_client.anthropic_client import AnthropicClient

        return AnthropicClient(config=llm_cfg)
    if provider == "gemini":
        from graphiti_core.llm_client.gemini_client import GeminiClient

        return GeminiClient(config=llm_cfg)
    if provider == "groq":
        from graphiti_core.llm_client.groq_client import GroqClient

        return GroqClient(config=llm_cfg)

    # Default: openai (also covers azure_openai with base_url set via env)
    from graphiti_core.llm_client import OpenAIClient

    return OpenAIClient(config=llm_cfg)


def x__build_llm_client__mutmut_14(cfg: dict):
    provider = cfg.get("llm", {}).get("provider", "XXgeminiXX")
    model = cfg.get("llm", {}).get("model")
    llm_cfg = LLMConfig(model=model) if model else None

    if provider == "anthropic":
        from graphiti_core.llm_client.anthropic_client import AnthropicClient

        return AnthropicClient(config=llm_cfg)
    if provider == "gemini":
        from graphiti_core.llm_client.gemini_client import GeminiClient

        return GeminiClient(config=llm_cfg)
    if provider == "groq":
        from graphiti_core.llm_client.groq_client import GroqClient

        return GroqClient(config=llm_cfg)

    # Default: openai (also covers azure_openai with base_url set via env)
    from graphiti_core.llm_client import OpenAIClient

    return OpenAIClient(config=llm_cfg)


def x__build_llm_client__mutmut_15(cfg: dict):
    provider = cfg.get("llm", {}).get("provider", "GEMINI")
    model = cfg.get("llm", {}).get("model")
    llm_cfg = LLMConfig(model=model) if model else None

    if provider == "anthropic":
        from graphiti_core.llm_client.anthropic_client import AnthropicClient

        return AnthropicClient(config=llm_cfg)
    if provider == "gemini":
        from graphiti_core.llm_client.gemini_client import GeminiClient

        return GeminiClient(config=llm_cfg)
    if provider == "groq":
        from graphiti_core.llm_client.groq_client import GroqClient

        return GroqClient(config=llm_cfg)

    # Default: openai (also covers azure_openai with base_url set via env)
    from graphiti_core.llm_client import OpenAIClient

    return OpenAIClient(config=llm_cfg)


def x__build_llm_client__mutmut_16(cfg: dict):
    provider = cfg.get("llm", {}).get("provider", "gemini")
    model = None
    llm_cfg = LLMConfig(model=model) if model else None

    if provider == "anthropic":
        from graphiti_core.llm_client.anthropic_client import AnthropicClient

        return AnthropicClient(config=llm_cfg)
    if provider == "gemini":
        from graphiti_core.llm_client.gemini_client import GeminiClient

        return GeminiClient(config=llm_cfg)
    if provider == "groq":
        from graphiti_core.llm_client.groq_client import GroqClient

        return GroqClient(config=llm_cfg)

    # Default: openai (also covers azure_openai with base_url set via env)
    from graphiti_core.llm_client import OpenAIClient

    return OpenAIClient(config=llm_cfg)


def x__build_llm_client__mutmut_17(cfg: dict):
    provider = cfg.get("llm", {}).get("provider", "gemini")
    model = cfg.get("llm", {}).get(None)
    llm_cfg = LLMConfig(model=model) if model else None

    if provider == "anthropic":
        from graphiti_core.llm_client.anthropic_client import AnthropicClient

        return AnthropicClient(config=llm_cfg)
    if provider == "gemini":
        from graphiti_core.llm_client.gemini_client import GeminiClient

        return GeminiClient(config=llm_cfg)
    if provider == "groq":
        from graphiti_core.llm_client.groq_client import GroqClient

        return GroqClient(config=llm_cfg)

    # Default: openai (also covers azure_openai with base_url set via env)
    from graphiti_core.llm_client import OpenAIClient

    return OpenAIClient(config=llm_cfg)


def x__build_llm_client__mutmut_18(cfg: dict):
    provider = cfg.get("llm", {}).get("provider", "gemini")
    model = cfg.get(None, {}).get("model")
    llm_cfg = LLMConfig(model=model) if model else None

    if provider == "anthropic":
        from graphiti_core.llm_client.anthropic_client import AnthropicClient

        return AnthropicClient(config=llm_cfg)
    if provider == "gemini":
        from graphiti_core.llm_client.gemini_client import GeminiClient

        return GeminiClient(config=llm_cfg)
    if provider == "groq":
        from graphiti_core.llm_client.groq_client import GroqClient

        return GroqClient(config=llm_cfg)

    # Default: openai (also covers azure_openai with base_url set via env)
    from graphiti_core.llm_client import OpenAIClient

    return OpenAIClient(config=llm_cfg)


def x__build_llm_client__mutmut_19(cfg: dict):
    provider = cfg.get("llm", {}).get("provider", "gemini")
    model = cfg.get("llm", None).get("model")
    llm_cfg = LLMConfig(model=model) if model else None

    if provider == "anthropic":
        from graphiti_core.llm_client.anthropic_client import AnthropicClient

        return AnthropicClient(config=llm_cfg)
    if provider == "gemini":
        from graphiti_core.llm_client.gemini_client import GeminiClient

        return GeminiClient(config=llm_cfg)
    if provider == "groq":
        from graphiti_core.llm_client.groq_client import GroqClient

        return GroqClient(config=llm_cfg)

    # Default: openai (also covers azure_openai with base_url set via env)
    from graphiti_core.llm_client import OpenAIClient

    return OpenAIClient(config=llm_cfg)


def x__build_llm_client__mutmut_20(cfg: dict):
    provider = cfg.get("llm", {}).get("provider", "gemini")
    model = cfg.get({}).get("model")
    llm_cfg = LLMConfig(model=model) if model else None

    if provider == "anthropic":
        from graphiti_core.llm_client.anthropic_client import AnthropicClient

        return AnthropicClient(config=llm_cfg)
    if provider == "gemini":
        from graphiti_core.llm_client.gemini_client import GeminiClient

        return GeminiClient(config=llm_cfg)
    if provider == "groq":
        from graphiti_core.llm_client.groq_client import GroqClient

        return GroqClient(config=llm_cfg)

    # Default: openai (also covers azure_openai with base_url set via env)
    from graphiti_core.llm_client import OpenAIClient

    return OpenAIClient(config=llm_cfg)


def x__build_llm_client__mutmut_21(cfg: dict):
    provider = cfg.get("llm", {}).get("provider", "gemini")
    model = cfg.get("llm", ).get("model")
    llm_cfg = LLMConfig(model=model) if model else None

    if provider == "anthropic":
        from graphiti_core.llm_client.anthropic_client import AnthropicClient

        return AnthropicClient(config=llm_cfg)
    if provider == "gemini":
        from graphiti_core.llm_client.gemini_client import GeminiClient

        return GeminiClient(config=llm_cfg)
    if provider == "groq":
        from graphiti_core.llm_client.groq_client import GroqClient

        return GroqClient(config=llm_cfg)

    # Default: openai (also covers azure_openai with base_url set via env)
    from graphiti_core.llm_client import OpenAIClient

    return OpenAIClient(config=llm_cfg)


def x__build_llm_client__mutmut_22(cfg: dict):
    provider = cfg.get("llm", {}).get("provider", "gemini")
    model = cfg.get("XXllmXX", {}).get("model")
    llm_cfg = LLMConfig(model=model) if model else None

    if provider == "anthropic":
        from graphiti_core.llm_client.anthropic_client import AnthropicClient

        return AnthropicClient(config=llm_cfg)
    if provider == "gemini":
        from graphiti_core.llm_client.gemini_client import GeminiClient

        return GeminiClient(config=llm_cfg)
    if provider == "groq":
        from graphiti_core.llm_client.groq_client import GroqClient

        return GroqClient(config=llm_cfg)

    # Default: openai (also covers azure_openai with base_url set via env)
    from graphiti_core.llm_client import OpenAIClient

    return OpenAIClient(config=llm_cfg)


def x__build_llm_client__mutmut_23(cfg: dict):
    provider = cfg.get("llm", {}).get("provider", "gemini")
    model = cfg.get("LLM", {}).get("model")
    llm_cfg = LLMConfig(model=model) if model else None

    if provider == "anthropic":
        from graphiti_core.llm_client.anthropic_client import AnthropicClient

        return AnthropicClient(config=llm_cfg)
    if provider == "gemini":
        from graphiti_core.llm_client.gemini_client import GeminiClient

        return GeminiClient(config=llm_cfg)
    if provider == "groq":
        from graphiti_core.llm_client.groq_client import GroqClient

        return GroqClient(config=llm_cfg)

    # Default: openai (also covers azure_openai with base_url set via env)
    from graphiti_core.llm_client import OpenAIClient

    return OpenAIClient(config=llm_cfg)


def x__build_llm_client__mutmut_24(cfg: dict):
    provider = cfg.get("llm", {}).get("provider", "gemini")
    model = cfg.get("llm", {}).get("XXmodelXX")
    llm_cfg = LLMConfig(model=model) if model else None

    if provider == "anthropic":
        from graphiti_core.llm_client.anthropic_client import AnthropicClient

        return AnthropicClient(config=llm_cfg)
    if provider == "gemini":
        from graphiti_core.llm_client.gemini_client import GeminiClient

        return GeminiClient(config=llm_cfg)
    if provider == "groq":
        from graphiti_core.llm_client.groq_client import GroqClient

        return GroqClient(config=llm_cfg)

    # Default: openai (also covers azure_openai with base_url set via env)
    from graphiti_core.llm_client import OpenAIClient

    return OpenAIClient(config=llm_cfg)


def x__build_llm_client__mutmut_25(cfg: dict):
    provider = cfg.get("llm", {}).get("provider", "gemini")
    model = cfg.get("llm", {}).get("MODEL")
    llm_cfg = LLMConfig(model=model) if model else None

    if provider == "anthropic":
        from graphiti_core.llm_client.anthropic_client import AnthropicClient

        return AnthropicClient(config=llm_cfg)
    if provider == "gemini":
        from graphiti_core.llm_client.gemini_client import GeminiClient

        return GeminiClient(config=llm_cfg)
    if provider == "groq":
        from graphiti_core.llm_client.groq_client import GroqClient

        return GroqClient(config=llm_cfg)

    # Default: openai (also covers azure_openai with base_url set via env)
    from graphiti_core.llm_client import OpenAIClient

    return OpenAIClient(config=llm_cfg)


def x__build_llm_client__mutmut_26(cfg: dict):
    provider = cfg.get("llm", {}).get("provider", "gemini")
    model = cfg.get("llm", {}).get("model")
    llm_cfg = None

    if provider == "anthropic":
        from graphiti_core.llm_client.anthropic_client import AnthropicClient

        return AnthropicClient(config=llm_cfg)
    if provider == "gemini":
        from graphiti_core.llm_client.gemini_client import GeminiClient

        return GeminiClient(config=llm_cfg)
    if provider == "groq":
        from graphiti_core.llm_client.groq_client import GroqClient

        return GroqClient(config=llm_cfg)

    # Default: openai (also covers azure_openai with base_url set via env)
    from graphiti_core.llm_client import OpenAIClient

    return OpenAIClient(config=llm_cfg)


def x__build_llm_client__mutmut_27(cfg: dict):
    provider = cfg.get("llm", {}).get("provider", "gemini")
    model = cfg.get("llm", {}).get("model")
    llm_cfg = LLMConfig(model=None) if model else None

    if provider == "anthropic":
        from graphiti_core.llm_client.anthropic_client import AnthropicClient

        return AnthropicClient(config=llm_cfg)
    if provider == "gemini":
        from graphiti_core.llm_client.gemini_client import GeminiClient

        return GeminiClient(config=llm_cfg)
    if provider == "groq":
        from graphiti_core.llm_client.groq_client import GroqClient

        return GroqClient(config=llm_cfg)

    # Default: openai (also covers azure_openai with base_url set via env)
    from graphiti_core.llm_client import OpenAIClient

    return OpenAIClient(config=llm_cfg)


def x__build_llm_client__mutmut_28(cfg: dict):
    provider = cfg.get("llm", {}).get("provider", "gemini")
    model = cfg.get("llm", {}).get("model")
    llm_cfg = LLMConfig(model=model) if model else None

    if provider != "anthropic":
        from graphiti_core.llm_client.anthropic_client import AnthropicClient

        return AnthropicClient(config=llm_cfg)
    if provider == "gemini":
        from graphiti_core.llm_client.gemini_client import GeminiClient

        return GeminiClient(config=llm_cfg)
    if provider == "groq":
        from graphiti_core.llm_client.groq_client import GroqClient

        return GroqClient(config=llm_cfg)

    # Default: openai (also covers azure_openai with base_url set via env)
    from graphiti_core.llm_client import OpenAIClient

    return OpenAIClient(config=llm_cfg)


def x__build_llm_client__mutmut_29(cfg: dict):
    provider = cfg.get("llm", {}).get("provider", "gemini")
    model = cfg.get("llm", {}).get("model")
    llm_cfg = LLMConfig(model=model) if model else None

    if provider == "XXanthropicXX":
        from graphiti_core.llm_client.anthropic_client import AnthropicClient

        return AnthropicClient(config=llm_cfg)
    if provider == "gemini":
        from graphiti_core.llm_client.gemini_client import GeminiClient

        return GeminiClient(config=llm_cfg)
    if provider == "groq":
        from graphiti_core.llm_client.groq_client import GroqClient

        return GroqClient(config=llm_cfg)

    # Default: openai (also covers azure_openai with base_url set via env)
    from graphiti_core.llm_client import OpenAIClient

    return OpenAIClient(config=llm_cfg)


def x__build_llm_client__mutmut_30(cfg: dict):
    provider = cfg.get("llm", {}).get("provider", "gemini")
    model = cfg.get("llm", {}).get("model")
    llm_cfg = LLMConfig(model=model) if model else None

    if provider == "ANTHROPIC":
        from graphiti_core.llm_client.anthropic_client import AnthropicClient

        return AnthropicClient(config=llm_cfg)
    if provider == "gemini":
        from graphiti_core.llm_client.gemini_client import GeminiClient

        return GeminiClient(config=llm_cfg)
    if provider == "groq":
        from graphiti_core.llm_client.groq_client import GroqClient

        return GroqClient(config=llm_cfg)

    # Default: openai (also covers azure_openai with base_url set via env)
    from graphiti_core.llm_client import OpenAIClient

    return OpenAIClient(config=llm_cfg)


def x__build_llm_client__mutmut_31(cfg: dict):
    provider = cfg.get("llm", {}).get("provider", "gemini")
    model = cfg.get("llm", {}).get("model")
    llm_cfg = LLMConfig(model=model) if model else None

    if provider == "anthropic":
        from graphiti_core.llm_client.anthropic_client import AnthropicClient

        return AnthropicClient(config=llm_cfg)
    if provider != "gemini":
        from graphiti_core.llm_client.gemini_client import GeminiClient

        return GeminiClient(config=llm_cfg)
    if provider == "groq":
        from graphiti_core.llm_client.groq_client import GroqClient

        return GroqClient(config=llm_cfg)

    # Default: openai (also covers azure_openai with base_url set via env)
    from graphiti_core.llm_client import OpenAIClient

    return OpenAIClient(config=llm_cfg)


def x__build_llm_client__mutmut_32(cfg: dict):
    provider = cfg.get("llm", {}).get("provider", "gemini")
    model = cfg.get("llm", {}).get("model")
    llm_cfg = LLMConfig(model=model) if model else None

    if provider == "anthropic":
        from graphiti_core.llm_client.anthropic_client import AnthropicClient

        return AnthropicClient(config=llm_cfg)
    if provider == "XXgeminiXX":
        from graphiti_core.llm_client.gemini_client import GeminiClient

        return GeminiClient(config=llm_cfg)
    if provider == "groq":
        from graphiti_core.llm_client.groq_client import GroqClient

        return GroqClient(config=llm_cfg)

    # Default: openai (also covers azure_openai with base_url set via env)
    from graphiti_core.llm_client import OpenAIClient

    return OpenAIClient(config=llm_cfg)


def x__build_llm_client__mutmut_33(cfg: dict):
    provider = cfg.get("llm", {}).get("provider", "gemini")
    model = cfg.get("llm", {}).get("model")
    llm_cfg = LLMConfig(model=model) if model else None

    if provider == "anthropic":
        from graphiti_core.llm_client.anthropic_client import AnthropicClient

        return AnthropicClient(config=llm_cfg)
    if provider == "GEMINI":
        from graphiti_core.llm_client.gemini_client import GeminiClient

        return GeminiClient(config=llm_cfg)
    if provider == "groq":
        from graphiti_core.llm_client.groq_client import GroqClient

        return GroqClient(config=llm_cfg)

    # Default: openai (also covers azure_openai with base_url set via env)
    from graphiti_core.llm_client import OpenAIClient

    return OpenAIClient(config=llm_cfg)


def x__build_llm_client__mutmut_34(cfg: dict):
    provider = cfg.get("llm", {}).get("provider", "gemini")
    model = cfg.get("llm", {}).get("model")
    llm_cfg = LLMConfig(model=model) if model else None

    if provider == "anthropic":
        from graphiti_core.llm_client.anthropic_client import AnthropicClient

        return AnthropicClient(config=llm_cfg)
    if provider == "gemini":
        from graphiti_core.llm_client.gemini_client import GeminiClient

        return GeminiClient(config=None)
    if provider == "groq":
        from graphiti_core.llm_client.groq_client import GroqClient

        return GroqClient(config=llm_cfg)

    # Default: openai (also covers azure_openai with base_url set via env)
    from graphiti_core.llm_client import OpenAIClient

    return OpenAIClient(config=llm_cfg)

x__build_llm_client__mutmut_mutants : ClassVar[MutantDict] = { # type: ignore
'x__build_llm_client__mutmut_1': x__build_llm_client__mutmut_1, 
    'x__build_llm_client__mutmut_2': x__build_llm_client__mutmut_2, 
    'x__build_llm_client__mutmut_3': x__build_llm_client__mutmut_3, 
    'x__build_llm_client__mutmut_4': x__build_llm_client__mutmut_4, 
    'x__build_llm_client__mutmut_5': x__build_llm_client__mutmut_5, 
    'x__build_llm_client__mutmut_6': x__build_llm_client__mutmut_6, 
    'x__build_llm_client__mutmut_7': x__build_llm_client__mutmut_7, 
    'x__build_llm_client__mutmut_8': x__build_llm_client__mutmut_8, 
    'x__build_llm_client__mutmut_9': x__build_llm_client__mutmut_9, 
    'x__build_llm_client__mutmut_10': x__build_llm_client__mutmut_10, 
    'x__build_llm_client__mutmut_11': x__build_llm_client__mutmut_11, 
    'x__build_llm_client__mutmut_12': x__build_llm_client__mutmut_12, 
    'x__build_llm_client__mutmut_13': x__build_llm_client__mutmut_13, 
    'x__build_llm_client__mutmut_14': x__build_llm_client__mutmut_14, 
    'x__build_llm_client__mutmut_15': x__build_llm_client__mutmut_15, 
    'x__build_llm_client__mutmut_16': x__build_llm_client__mutmut_16, 
    'x__build_llm_client__mutmut_17': x__build_llm_client__mutmut_17, 
    'x__build_llm_client__mutmut_18': x__build_llm_client__mutmut_18, 
    'x__build_llm_client__mutmut_19': x__build_llm_client__mutmut_19, 
    'x__build_llm_client__mutmut_20': x__build_llm_client__mutmut_20, 
    'x__build_llm_client__mutmut_21': x__build_llm_client__mutmut_21, 
    'x__build_llm_client__mutmut_22': x__build_llm_client__mutmut_22, 
    'x__build_llm_client__mutmut_23': x__build_llm_client__mutmut_23, 
    'x__build_llm_client__mutmut_24': x__build_llm_client__mutmut_24, 
    'x__build_llm_client__mutmut_25': x__build_llm_client__mutmut_25, 
    'x__build_llm_client__mutmut_26': x__build_llm_client__mutmut_26, 
    'x__build_llm_client__mutmut_27': x__build_llm_client__mutmut_27, 
    'x__build_llm_client__mutmut_28': x__build_llm_client__mutmut_28, 
    'x__build_llm_client__mutmut_29': x__build_llm_client__mutmut_29, 
    'x__build_llm_client__mutmut_30': x__build_llm_client__mutmut_30, 
    'x__build_llm_client__mutmut_31': x__build_llm_client__mutmut_31, 
    'x__build_llm_client__mutmut_32': x__build_llm_client__mutmut_32, 
    'x__build_llm_client__mutmut_33': x__build_llm_client__mutmut_33, 
    'x__build_llm_client__mutmut_34': x__build_llm_client__mutmut_34
}
x__build_llm_client__mutmut_orig.__name__ = 'x__build_llm_client'


def _build_embedder(cfg: dict):
    args = [cfg]# type: ignore
    kwargs = {}# type: ignore
    return _mutmut_trampoline(x__build_embedder__mutmut_orig, x__build_embedder__mutmut_mutants, args, kwargs, None)


def x__build_embedder__mutmut_orig(cfg: dict):
    provider = cfg.get("embedder", {}).get("provider", "gemini")
    model = cfg.get("embedder", {}).get("model")

    if provider == "gemini":
        from graphiti_core.embedder.gemini import GeminiEmbedder, GeminiEmbedderConfig

        ecfg = GeminiEmbedderConfig(embedding_model=model) if model else GeminiEmbedderConfig()
        return GeminiEmbedder(ecfg)

    from graphiti_core.embedder import OpenAIEmbedder, OpenAIEmbedderConfig

    ecfg = OpenAIEmbedderConfig(embedding_model=model) if model else OpenAIEmbedderConfig()
    return OpenAIEmbedder(ecfg)


def x__build_embedder__mutmut_1(cfg: dict):
    provider = None
    model = cfg.get("embedder", {}).get("model")

    if provider == "gemini":
        from graphiti_core.embedder.gemini import GeminiEmbedder, GeminiEmbedderConfig

        ecfg = GeminiEmbedderConfig(embedding_model=model) if model else GeminiEmbedderConfig()
        return GeminiEmbedder(ecfg)

    from graphiti_core.embedder import OpenAIEmbedder, OpenAIEmbedderConfig

    ecfg = OpenAIEmbedderConfig(embedding_model=model) if model else OpenAIEmbedderConfig()
    return OpenAIEmbedder(ecfg)


def x__build_embedder__mutmut_2(cfg: dict):
    provider = cfg.get("embedder", {}).get(None, "gemini")
    model = cfg.get("embedder", {}).get("model")

    if provider == "gemini":
        from graphiti_core.embedder.gemini import GeminiEmbedder, GeminiEmbedderConfig

        ecfg = GeminiEmbedderConfig(embedding_model=model) if model else GeminiEmbedderConfig()
        return GeminiEmbedder(ecfg)

    from graphiti_core.embedder import OpenAIEmbedder, OpenAIEmbedderConfig

    ecfg = OpenAIEmbedderConfig(embedding_model=model) if model else OpenAIEmbedderConfig()
    return OpenAIEmbedder(ecfg)


def x__build_embedder__mutmut_3(cfg: dict):
    provider = cfg.get("embedder", {}).get("provider", None)
    model = cfg.get("embedder", {}).get("model")

    if provider == "gemini":
        from graphiti_core.embedder.gemini import GeminiEmbedder, GeminiEmbedderConfig

        ecfg = GeminiEmbedderConfig(embedding_model=model) if model else GeminiEmbedderConfig()
        return GeminiEmbedder(ecfg)

    from graphiti_core.embedder import OpenAIEmbedder, OpenAIEmbedderConfig

    ecfg = OpenAIEmbedderConfig(embedding_model=model) if model else OpenAIEmbedderConfig()
    return OpenAIEmbedder(ecfg)


def x__build_embedder__mutmut_4(cfg: dict):
    provider = cfg.get("embedder", {}).get("gemini")
    model = cfg.get("embedder", {}).get("model")

    if provider == "gemini":
        from graphiti_core.embedder.gemini import GeminiEmbedder, GeminiEmbedderConfig

        ecfg = GeminiEmbedderConfig(embedding_model=model) if model else GeminiEmbedderConfig()
        return GeminiEmbedder(ecfg)

    from graphiti_core.embedder import OpenAIEmbedder, OpenAIEmbedderConfig

    ecfg = OpenAIEmbedderConfig(embedding_model=model) if model else OpenAIEmbedderConfig()
    return OpenAIEmbedder(ecfg)


def x__build_embedder__mutmut_5(cfg: dict):
    provider = cfg.get("embedder", {}).get("provider", )
    model = cfg.get("embedder", {}).get("model")

    if provider == "gemini":
        from graphiti_core.embedder.gemini import GeminiEmbedder, GeminiEmbedderConfig

        ecfg = GeminiEmbedderConfig(embedding_model=model) if model else GeminiEmbedderConfig()
        return GeminiEmbedder(ecfg)

    from graphiti_core.embedder import OpenAIEmbedder, OpenAIEmbedderConfig

    ecfg = OpenAIEmbedderConfig(embedding_model=model) if model else OpenAIEmbedderConfig()
    return OpenAIEmbedder(ecfg)


def x__build_embedder__mutmut_6(cfg: dict):
    provider = cfg.get(None, {}).get("provider", "gemini")
    model = cfg.get("embedder", {}).get("model")

    if provider == "gemini":
        from graphiti_core.embedder.gemini import GeminiEmbedder, GeminiEmbedderConfig

        ecfg = GeminiEmbedderConfig(embedding_model=model) if model else GeminiEmbedderConfig()
        return GeminiEmbedder(ecfg)

    from graphiti_core.embedder import OpenAIEmbedder, OpenAIEmbedderConfig

    ecfg = OpenAIEmbedderConfig(embedding_model=model) if model else OpenAIEmbedderConfig()
    return OpenAIEmbedder(ecfg)


def x__build_embedder__mutmut_7(cfg: dict):
    provider = cfg.get("embedder", None).get("provider", "gemini")
    model = cfg.get("embedder", {}).get("model")

    if provider == "gemini":
        from graphiti_core.embedder.gemini import GeminiEmbedder, GeminiEmbedderConfig

        ecfg = GeminiEmbedderConfig(embedding_model=model) if model else GeminiEmbedderConfig()
        return GeminiEmbedder(ecfg)

    from graphiti_core.embedder import OpenAIEmbedder, OpenAIEmbedderConfig

    ecfg = OpenAIEmbedderConfig(embedding_model=model) if model else OpenAIEmbedderConfig()
    return OpenAIEmbedder(ecfg)


def x__build_embedder__mutmut_8(cfg: dict):
    provider = cfg.get({}).get("provider", "gemini")
    model = cfg.get("embedder", {}).get("model")

    if provider == "gemini":
        from graphiti_core.embedder.gemini import GeminiEmbedder, GeminiEmbedderConfig

        ecfg = GeminiEmbedderConfig(embedding_model=model) if model else GeminiEmbedderConfig()
        return GeminiEmbedder(ecfg)

    from graphiti_core.embedder import OpenAIEmbedder, OpenAIEmbedderConfig

    ecfg = OpenAIEmbedderConfig(embedding_model=model) if model else OpenAIEmbedderConfig()
    return OpenAIEmbedder(ecfg)


def x__build_embedder__mutmut_9(cfg: dict):
    provider = cfg.get("embedder", ).get("provider", "gemini")
    model = cfg.get("embedder", {}).get("model")

    if provider == "gemini":
        from graphiti_core.embedder.gemini import GeminiEmbedder, GeminiEmbedderConfig

        ecfg = GeminiEmbedderConfig(embedding_model=model) if model else GeminiEmbedderConfig()
        return GeminiEmbedder(ecfg)

    from graphiti_core.embedder import OpenAIEmbedder, OpenAIEmbedderConfig

    ecfg = OpenAIEmbedderConfig(embedding_model=model) if model else OpenAIEmbedderConfig()
    return OpenAIEmbedder(ecfg)


def x__build_embedder__mutmut_10(cfg: dict):
    provider = cfg.get("XXembedderXX", {}).get("provider", "gemini")
    model = cfg.get("embedder", {}).get("model")

    if provider == "gemini":
        from graphiti_core.embedder.gemini import GeminiEmbedder, GeminiEmbedderConfig

        ecfg = GeminiEmbedderConfig(embedding_model=model) if model else GeminiEmbedderConfig()
        return GeminiEmbedder(ecfg)

    from graphiti_core.embedder import OpenAIEmbedder, OpenAIEmbedderConfig

    ecfg = OpenAIEmbedderConfig(embedding_model=model) if model else OpenAIEmbedderConfig()
    return OpenAIEmbedder(ecfg)


def x__build_embedder__mutmut_11(cfg: dict):
    provider = cfg.get("EMBEDDER", {}).get("provider", "gemini")
    model = cfg.get("embedder", {}).get("model")

    if provider == "gemini":
        from graphiti_core.embedder.gemini import GeminiEmbedder, GeminiEmbedderConfig

        ecfg = GeminiEmbedderConfig(embedding_model=model) if model else GeminiEmbedderConfig()
        return GeminiEmbedder(ecfg)

    from graphiti_core.embedder import OpenAIEmbedder, OpenAIEmbedderConfig

    ecfg = OpenAIEmbedderConfig(embedding_model=model) if model else OpenAIEmbedderConfig()
    return OpenAIEmbedder(ecfg)


def x__build_embedder__mutmut_12(cfg: dict):
    provider = cfg.get("embedder", {}).get("XXproviderXX", "gemini")
    model = cfg.get("embedder", {}).get("model")

    if provider == "gemini":
        from graphiti_core.embedder.gemini import GeminiEmbedder, GeminiEmbedderConfig

        ecfg = GeminiEmbedderConfig(embedding_model=model) if model else GeminiEmbedderConfig()
        return GeminiEmbedder(ecfg)

    from graphiti_core.embedder import OpenAIEmbedder, OpenAIEmbedderConfig

    ecfg = OpenAIEmbedderConfig(embedding_model=model) if model else OpenAIEmbedderConfig()
    return OpenAIEmbedder(ecfg)


def x__build_embedder__mutmut_13(cfg: dict):
    provider = cfg.get("embedder", {}).get("PROVIDER", "gemini")
    model = cfg.get("embedder", {}).get("model")

    if provider == "gemini":
        from graphiti_core.embedder.gemini import GeminiEmbedder, GeminiEmbedderConfig

        ecfg = GeminiEmbedderConfig(embedding_model=model) if model else GeminiEmbedderConfig()
        return GeminiEmbedder(ecfg)

    from graphiti_core.embedder import OpenAIEmbedder, OpenAIEmbedderConfig

    ecfg = OpenAIEmbedderConfig(embedding_model=model) if model else OpenAIEmbedderConfig()
    return OpenAIEmbedder(ecfg)


def x__build_embedder__mutmut_14(cfg: dict):
    provider = cfg.get("embedder", {}).get("provider", "XXgeminiXX")
    model = cfg.get("embedder", {}).get("model")

    if provider == "gemini":
        from graphiti_core.embedder.gemini import GeminiEmbedder, GeminiEmbedderConfig

        ecfg = GeminiEmbedderConfig(embedding_model=model) if model else GeminiEmbedderConfig()
        return GeminiEmbedder(ecfg)

    from graphiti_core.embedder import OpenAIEmbedder, OpenAIEmbedderConfig

    ecfg = OpenAIEmbedderConfig(embedding_model=model) if model else OpenAIEmbedderConfig()
    return OpenAIEmbedder(ecfg)


def x__build_embedder__mutmut_15(cfg: dict):
    provider = cfg.get("embedder", {}).get("provider", "GEMINI")
    model = cfg.get("embedder", {}).get("model")

    if provider == "gemini":
        from graphiti_core.embedder.gemini import GeminiEmbedder, GeminiEmbedderConfig

        ecfg = GeminiEmbedderConfig(embedding_model=model) if model else GeminiEmbedderConfig()
        return GeminiEmbedder(ecfg)

    from graphiti_core.embedder import OpenAIEmbedder, OpenAIEmbedderConfig

    ecfg = OpenAIEmbedderConfig(embedding_model=model) if model else OpenAIEmbedderConfig()
    return OpenAIEmbedder(ecfg)


def x__build_embedder__mutmut_16(cfg: dict):
    provider = cfg.get("embedder", {}).get("provider", "gemini")
    model = None

    if provider == "gemini":
        from graphiti_core.embedder.gemini import GeminiEmbedder, GeminiEmbedderConfig

        ecfg = GeminiEmbedderConfig(embedding_model=model) if model else GeminiEmbedderConfig()
        return GeminiEmbedder(ecfg)

    from graphiti_core.embedder import OpenAIEmbedder, OpenAIEmbedderConfig

    ecfg = OpenAIEmbedderConfig(embedding_model=model) if model else OpenAIEmbedderConfig()
    return OpenAIEmbedder(ecfg)


def x__build_embedder__mutmut_17(cfg: dict):
    provider = cfg.get("embedder", {}).get("provider", "gemini")
    model = cfg.get("embedder", {}).get(None)

    if provider == "gemini":
        from graphiti_core.embedder.gemini import GeminiEmbedder, GeminiEmbedderConfig

        ecfg = GeminiEmbedderConfig(embedding_model=model) if model else GeminiEmbedderConfig()
        return GeminiEmbedder(ecfg)

    from graphiti_core.embedder import OpenAIEmbedder, OpenAIEmbedderConfig

    ecfg = OpenAIEmbedderConfig(embedding_model=model) if model else OpenAIEmbedderConfig()
    return OpenAIEmbedder(ecfg)


def x__build_embedder__mutmut_18(cfg: dict):
    provider = cfg.get("embedder", {}).get("provider", "gemini")
    model = cfg.get(None, {}).get("model")

    if provider == "gemini":
        from graphiti_core.embedder.gemini import GeminiEmbedder, GeminiEmbedderConfig

        ecfg = GeminiEmbedderConfig(embedding_model=model) if model else GeminiEmbedderConfig()
        return GeminiEmbedder(ecfg)

    from graphiti_core.embedder import OpenAIEmbedder, OpenAIEmbedderConfig

    ecfg = OpenAIEmbedderConfig(embedding_model=model) if model else OpenAIEmbedderConfig()
    return OpenAIEmbedder(ecfg)


def x__build_embedder__mutmut_19(cfg: dict):
    provider = cfg.get("embedder", {}).get("provider", "gemini")
    model = cfg.get("embedder", None).get("model")

    if provider == "gemini":
        from graphiti_core.embedder.gemini import GeminiEmbedder, GeminiEmbedderConfig

        ecfg = GeminiEmbedderConfig(embedding_model=model) if model else GeminiEmbedderConfig()
        return GeminiEmbedder(ecfg)

    from graphiti_core.embedder import OpenAIEmbedder, OpenAIEmbedderConfig

    ecfg = OpenAIEmbedderConfig(embedding_model=model) if model else OpenAIEmbedderConfig()
    return OpenAIEmbedder(ecfg)


def x__build_embedder__mutmut_20(cfg: dict):
    provider = cfg.get("embedder", {}).get("provider", "gemini")
    model = cfg.get({}).get("model")

    if provider == "gemini":
        from graphiti_core.embedder.gemini import GeminiEmbedder, GeminiEmbedderConfig

        ecfg = GeminiEmbedderConfig(embedding_model=model) if model else GeminiEmbedderConfig()
        return GeminiEmbedder(ecfg)

    from graphiti_core.embedder import OpenAIEmbedder, OpenAIEmbedderConfig

    ecfg = OpenAIEmbedderConfig(embedding_model=model) if model else OpenAIEmbedderConfig()
    return OpenAIEmbedder(ecfg)


def x__build_embedder__mutmut_21(cfg: dict):
    provider = cfg.get("embedder", {}).get("provider", "gemini")
    model = cfg.get("embedder", ).get("model")

    if provider == "gemini":
        from graphiti_core.embedder.gemini import GeminiEmbedder, GeminiEmbedderConfig

        ecfg = GeminiEmbedderConfig(embedding_model=model) if model else GeminiEmbedderConfig()
        return GeminiEmbedder(ecfg)

    from graphiti_core.embedder import OpenAIEmbedder, OpenAIEmbedderConfig

    ecfg = OpenAIEmbedderConfig(embedding_model=model) if model else OpenAIEmbedderConfig()
    return OpenAIEmbedder(ecfg)


def x__build_embedder__mutmut_22(cfg: dict):
    provider = cfg.get("embedder", {}).get("provider", "gemini")
    model = cfg.get("XXembedderXX", {}).get("model")

    if provider == "gemini":
        from graphiti_core.embedder.gemini import GeminiEmbedder, GeminiEmbedderConfig

        ecfg = GeminiEmbedderConfig(embedding_model=model) if model else GeminiEmbedderConfig()
        return GeminiEmbedder(ecfg)

    from graphiti_core.embedder import OpenAIEmbedder, OpenAIEmbedderConfig

    ecfg = OpenAIEmbedderConfig(embedding_model=model) if model else OpenAIEmbedderConfig()
    return OpenAIEmbedder(ecfg)


def x__build_embedder__mutmut_23(cfg: dict):
    provider = cfg.get("embedder", {}).get("provider", "gemini")
    model = cfg.get("EMBEDDER", {}).get("model")

    if provider == "gemini":
        from graphiti_core.embedder.gemini import GeminiEmbedder, GeminiEmbedderConfig

        ecfg = GeminiEmbedderConfig(embedding_model=model) if model else GeminiEmbedderConfig()
        return GeminiEmbedder(ecfg)

    from graphiti_core.embedder import OpenAIEmbedder, OpenAIEmbedderConfig

    ecfg = OpenAIEmbedderConfig(embedding_model=model) if model else OpenAIEmbedderConfig()
    return OpenAIEmbedder(ecfg)


def x__build_embedder__mutmut_24(cfg: dict):
    provider = cfg.get("embedder", {}).get("provider", "gemini")
    model = cfg.get("embedder", {}).get("XXmodelXX")

    if provider == "gemini":
        from graphiti_core.embedder.gemini import GeminiEmbedder, GeminiEmbedderConfig

        ecfg = GeminiEmbedderConfig(embedding_model=model) if model else GeminiEmbedderConfig()
        return GeminiEmbedder(ecfg)

    from graphiti_core.embedder import OpenAIEmbedder, OpenAIEmbedderConfig

    ecfg = OpenAIEmbedderConfig(embedding_model=model) if model else OpenAIEmbedderConfig()
    return OpenAIEmbedder(ecfg)


def x__build_embedder__mutmut_25(cfg: dict):
    provider = cfg.get("embedder", {}).get("provider", "gemini")
    model = cfg.get("embedder", {}).get("MODEL")

    if provider == "gemini":
        from graphiti_core.embedder.gemini import GeminiEmbedder, GeminiEmbedderConfig

        ecfg = GeminiEmbedderConfig(embedding_model=model) if model else GeminiEmbedderConfig()
        return GeminiEmbedder(ecfg)

    from graphiti_core.embedder import OpenAIEmbedder, OpenAIEmbedderConfig

    ecfg = OpenAIEmbedderConfig(embedding_model=model) if model else OpenAIEmbedderConfig()
    return OpenAIEmbedder(ecfg)


def x__build_embedder__mutmut_26(cfg: dict):
    provider = cfg.get("embedder", {}).get("provider", "gemini")
    model = cfg.get("embedder", {}).get("model")

    if provider != "gemini":
        from graphiti_core.embedder.gemini import GeminiEmbedder, GeminiEmbedderConfig

        ecfg = GeminiEmbedderConfig(embedding_model=model) if model else GeminiEmbedderConfig()
        return GeminiEmbedder(ecfg)

    from graphiti_core.embedder import OpenAIEmbedder, OpenAIEmbedderConfig

    ecfg = OpenAIEmbedderConfig(embedding_model=model) if model else OpenAIEmbedderConfig()
    return OpenAIEmbedder(ecfg)


def x__build_embedder__mutmut_27(cfg: dict):
    provider = cfg.get("embedder", {}).get("provider", "gemini")
    model = cfg.get("embedder", {}).get("model")

    if provider == "XXgeminiXX":
        from graphiti_core.embedder.gemini import GeminiEmbedder, GeminiEmbedderConfig

        ecfg = GeminiEmbedderConfig(embedding_model=model) if model else GeminiEmbedderConfig()
        return GeminiEmbedder(ecfg)

    from graphiti_core.embedder import OpenAIEmbedder, OpenAIEmbedderConfig

    ecfg = OpenAIEmbedderConfig(embedding_model=model) if model else OpenAIEmbedderConfig()
    return OpenAIEmbedder(ecfg)


def x__build_embedder__mutmut_28(cfg: dict):
    provider = cfg.get("embedder", {}).get("provider", "gemini")
    model = cfg.get("embedder", {}).get("model")

    if provider == "GEMINI":
        from graphiti_core.embedder.gemini import GeminiEmbedder, GeminiEmbedderConfig

        ecfg = GeminiEmbedderConfig(embedding_model=model) if model else GeminiEmbedderConfig()
        return GeminiEmbedder(ecfg)

    from graphiti_core.embedder import OpenAIEmbedder, OpenAIEmbedderConfig

    ecfg = OpenAIEmbedderConfig(embedding_model=model) if model else OpenAIEmbedderConfig()
    return OpenAIEmbedder(ecfg)


def x__build_embedder__mutmut_29(cfg: dict):
    provider = cfg.get("embedder", {}).get("provider", "gemini")
    model = cfg.get("embedder", {}).get("model")

    if provider == "gemini":
        from graphiti_core.embedder.gemini import GeminiEmbedder, GeminiEmbedderConfig

        ecfg = None
        return GeminiEmbedder(ecfg)

    from graphiti_core.embedder import OpenAIEmbedder, OpenAIEmbedderConfig

    ecfg = OpenAIEmbedderConfig(embedding_model=model) if model else OpenAIEmbedderConfig()
    return OpenAIEmbedder(ecfg)


def x__build_embedder__mutmut_30(cfg: dict):
    provider = cfg.get("embedder", {}).get("provider", "gemini")
    model = cfg.get("embedder", {}).get("model")

    if provider == "gemini":
        from graphiti_core.embedder.gemini import GeminiEmbedder, GeminiEmbedderConfig

        ecfg = GeminiEmbedderConfig(embedding_model=None) if model else GeminiEmbedderConfig()
        return GeminiEmbedder(ecfg)

    from graphiti_core.embedder import OpenAIEmbedder, OpenAIEmbedderConfig

    ecfg = OpenAIEmbedderConfig(embedding_model=model) if model else OpenAIEmbedderConfig()
    return OpenAIEmbedder(ecfg)


def x__build_embedder__mutmut_31(cfg: dict):
    provider = cfg.get("embedder", {}).get("provider", "gemini")
    model = cfg.get("embedder", {}).get("model")

    if provider == "gemini":
        from graphiti_core.embedder.gemini import GeminiEmbedder, GeminiEmbedderConfig

        ecfg = GeminiEmbedderConfig(embedding_model=model) if model else GeminiEmbedderConfig()
        return GeminiEmbedder(None)

    from graphiti_core.embedder import OpenAIEmbedder, OpenAIEmbedderConfig

    ecfg = OpenAIEmbedderConfig(embedding_model=model) if model else OpenAIEmbedderConfig()
    return OpenAIEmbedder(ecfg)

x__build_embedder__mutmut_mutants : ClassVar[MutantDict] = { # type: ignore
'x__build_embedder__mutmut_1': x__build_embedder__mutmut_1, 
    'x__build_embedder__mutmut_2': x__build_embedder__mutmut_2, 
    'x__build_embedder__mutmut_3': x__build_embedder__mutmut_3, 
    'x__build_embedder__mutmut_4': x__build_embedder__mutmut_4, 
    'x__build_embedder__mutmut_5': x__build_embedder__mutmut_5, 
    'x__build_embedder__mutmut_6': x__build_embedder__mutmut_6, 
    'x__build_embedder__mutmut_7': x__build_embedder__mutmut_7, 
    'x__build_embedder__mutmut_8': x__build_embedder__mutmut_8, 
    'x__build_embedder__mutmut_9': x__build_embedder__mutmut_9, 
    'x__build_embedder__mutmut_10': x__build_embedder__mutmut_10, 
    'x__build_embedder__mutmut_11': x__build_embedder__mutmut_11, 
    'x__build_embedder__mutmut_12': x__build_embedder__mutmut_12, 
    'x__build_embedder__mutmut_13': x__build_embedder__mutmut_13, 
    'x__build_embedder__mutmut_14': x__build_embedder__mutmut_14, 
    'x__build_embedder__mutmut_15': x__build_embedder__mutmut_15, 
    'x__build_embedder__mutmut_16': x__build_embedder__mutmut_16, 
    'x__build_embedder__mutmut_17': x__build_embedder__mutmut_17, 
    'x__build_embedder__mutmut_18': x__build_embedder__mutmut_18, 
    'x__build_embedder__mutmut_19': x__build_embedder__mutmut_19, 
    'x__build_embedder__mutmut_20': x__build_embedder__mutmut_20, 
    'x__build_embedder__mutmut_21': x__build_embedder__mutmut_21, 
    'x__build_embedder__mutmut_22': x__build_embedder__mutmut_22, 
    'x__build_embedder__mutmut_23': x__build_embedder__mutmut_23, 
    'x__build_embedder__mutmut_24': x__build_embedder__mutmut_24, 
    'x__build_embedder__mutmut_25': x__build_embedder__mutmut_25, 
    'x__build_embedder__mutmut_26': x__build_embedder__mutmut_26, 
    'x__build_embedder__mutmut_27': x__build_embedder__mutmut_27, 
    'x__build_embedder__mutmut_28': x__build_embedder__mutmut_28, 
    'x__build_embedder__mutmut_29': x__build_embedder__mutmut_29, 
    'x__build_embedder__mutmut_30': x__build_embedder__mutmut_30, 
    'x__build_embedder__mutmut_31': x__build_embedder__mutmut_31
}
x__build_embedder__mutmut_orig.__name__ = 'x__build_embedder'


_TYPE_MAP: dict[str, type] = {
    "string": str,
    "int": int,
    "float": float,
    "bool": bool,
    "datetime": datetime,
}


def _build_type_defs(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    args = [defs]# type: ignore
    kwargs = {}# type: ignore
    return _mutmut_trampoline(x__build_type_defs__mutmut_orig, x__build_type_defs__mutmut_mutants, args, kwargs, None)


def x__build_type_defs__mutmut_orig(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("attributes") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "enum" in attr_val:
                    lit_type = Literal[tuple(attr_val["enum"])]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get("description", "")))
                else:
                    py_type = _TYPE_MAP[attr_val["type"]]
                    fields[attr_name] = (py_type, Field(description=attr_val.get("description", "")))
        model = create_model(name, **fields)
        model.__doc__ = defn.get("description", "")
        models[name] = model
    return models


def x__build_type_defs__mutmut_1(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = None
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("attributes") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "enum" in attr_val:
                    lit_type = Literal[tuple(attr_val["enum"])]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get("description", "")))
                else:
                    py_type = _TYPE_MAP[attr_val["type"]]
                    fields[attr_name] = (py_type, Field(description=attr_val.get("description", "")))
        model = create_model(name, **fields)
        model.__doc__ = defn.get("description", "")
        models[name] = model
    return models


def x__build_type_defs__mutmut_2(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = None
        for attr_name, attr_val in (defn.get("attributes") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "enum" in attr_val:
                    lit_type = Literal[tuple(attr_val["enum"])]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get("description", "")))
                else:
                    py_type = _TYPE_MAP[attr_val["type"]]
                    fields[attr_name] = (py_type, Field(description=attr_val.get("description", "")))
        model = create_model(name, **fields)
        model.__doc__ = defn.get("description", "")
        models[name] = model
    return models


def x__build_type_defs__mutmut_3(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("attributes") and {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "enum" in attr_val:
                    lit_type = Literal[tuple(attr_val["enum"])]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get("description", "")))
                else:
                    py_type = _TYPE_MAP[attr_val["type"]]
                    fields[attr_name] = (py_type, Field(description=attr_val.get("description", "")))
        model = create_model(name, **fields)
        model.__doc__ = defn.get("description", "")
        models[name] = model
    return models


def x__build_type_defs__mutmut_4(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get(None) or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "enum" in attr_val:
                    lit_type = Literal[tuple(attr_val["enum"])]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get("description", "")))
                else:
                    py_type = _TYPE_MAP[attr_val["type"]]
                    fields[attr_name] = (py_type, Field(description=attr_val.get("description", "")))
        model = create_model(name, **fields)
        model.__doc__ = defn.get("description", "")
        models[name] = model
    return models


def x__build_type_defs__mutmut_5(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("XXattributesXX") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "enum" in attr_val:
                    lit_type = Literal[tuple(attr_val["enum"])]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get("description", "")))
                else:
                    py_type = _TYPE_MAP[attr_val["type"]]
                    fields[attr_name] = (py_type, Field(description=attr_val.get("description", "")))
        model = create_model(name, **fields)
        model.__doc__ = defn.get("description", "")
        models[name] = model
    return models


def x__build_type_defs__mutmut_6(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("ATTRIBUTES") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "enum" in attr_val:
                    lit_type = Literal[tuple(attr_val["enum"])]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get("description", "")))
                else:
                    py_type = _TYPE_MAP[attr_val["type"]]
                    fields[attr_name] = (py_type, Field(description=attr_val.get("description", "")))
        model = create_model(name, **fields)
        model.__doc__ = defn.get("description", "")
        models[name] = model
    return models


def x__build_type_defs__mutmut_7(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("attributes") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = None
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "enum" in attr_val:
                    lit_type = Literal[tuple(attr_val["enum"])]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get("description", "")))
                else:
                    py_type = _TYPE_MAP[attr_val["type"]]
                    fields[attr_name] = (py_type, Field(description=attr_val.get("description", "")))
        model = create_model(name, **fields)
        model.__doc__ = defn.get("description", "")
        models[name] = model
    return models


def x__build_type_defs__mutmut_8(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("attributes") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=None))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "enum" in attr_val:
                    lit_type = Literal[tuple(attr_val["enum"])]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get("description", "")))
                else:
                    py_type = _TYPE_MAP[attr_val["type"]]
                    fields[attr_name] = (py_type, Field(description=attr_val.get("description", "")))
        model = create_model(name, **fields)
        model.__doc__ = defn.get("description", "")
        models[name] = model
    return models


def x__build_type_defs__mutmut_9(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("attributes") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = None  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "enum" in attr_val:
                    lit_type = Literal[tuple(attr_val["enum"])]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get("description", "")))
                else:
                    py_type = _TYPE_MAP[attr_val["type"]]
                    fields[attr_name] = (py_type, Field(description=attr_val.get("description", "")))
        model = create_model(name, **fields)
        model.__doc__ = defn.get("description", "")
        models[name] = model
    return models


def x__build_type_defs__mutmut_10(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("attributes") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(None)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "enum" in attr_val:
                    lit_type = Literal[tuple(attr_val["enum"])]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get("description", "")))
                else:
                    py_type = _TYPE_MAP[attr_val["type"]]
                    fields[attr_name] = (py_type, Field(description=attr_val.get("description", "")))
        model = create_model(name, **fields)
        model.__doc__ = defn.get("description", "")
        models[name] = model
    return models


def x__build_type_defs__mutmut_11(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("attributes") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = None
            elif isinstance(attr_val, dict):
                if "enum" in attr_val:
                    lit_type = Literal[tuple(attr_val["enum"])]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get("description", "")))
                else:
                    py_type = _TYPE_MAP[attr_val["type"]]
                    fields[attr_name] = (py_type, Field(description=attr_val.get("description", "")))
        model = create_model(name, **fields)
        model.__doc__ = defn.get("description", "")
        models[name] = model
    return models


def x__build_type_defs__mutmut_12(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("attributes") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "XXenumXX" in attr_val:
                    lit_type = Literal[tuple(attr_val["enum"])]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get("description", "")))
                else:
                    py_type = _TYPE_MAP[attr_val["type"]]
                    fields[attr_name] = (py_type, Field(description=attr_val.get("description", "")))
        model = create_model(name, **fields)
        model.__doc__ = defn.get("description", "")
        models[name] = model
    return models


def x__build_type_defs__mutmut_13(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("attributes") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "ENUM" in attr_val:
                    lit_type = Literal[tuple(attr_val["enum"])]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get("description", "")))
                else:
                    py_type = _TYPE_MAP[attr_val["type"]]
                    fields[attr_name] = (py_type, Field(description=attr_val.get("description", "")))
        model = create_model(name, **fields)
        model.__doc__ = defn.get("description", "")
        models[name] = model
    return models


def x__build_type_defs__mutmut_14(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("attributes") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "enum" not in attr_val:
                    lit_type = Literal[tuple(attr_val["enum"])]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get("description", "")))
                else:
                    py_type = _TYPE_MAP[attr_val["type"]]
                    fields[attr_name] = (py_type, Field(description=attr_val.get("description", "")))
        model = create_model(name, **fields)
        model.__doc__ = defn.get("description", "")
        models[name] = model
    return models


def x__build_type_defs__mutmut_15(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("attributes") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "enum" in attr_val:
                    lit_type = None  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get("description", "")))
                else:
                    py_type = _TYPE_MAP[attr_val["type"]]
                    fields[attr_name] = (py_type, Field(description=attr_val.get("description", "")))
        model = create_model(name, **fields)
        model.__doc__ = defn.get("description", "")
        models[name] = model
    return models


def x__build_type_defs__mutmut_16(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("attributes") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "enum" in attr_val:
                    lit_type = Literal[tuple(None)]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get("description", "")))
                else:
                    py_type = _TYPE_MAP[attr_val["type"]]
                    fields[attr_name] = (py_type, Field(description=attr_val.get("description", "")))
        model = create_model(name, **fields)
        model.__doc__ = defn.get("description", "")
        models[name] = model
    return models


def x__build_type_defs__mutmut_17(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("attributes") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "enum" in attr_val:
                    lit_type = Literal[tuple(attr_val["XXenumXX"])]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get("description", "")))
                else:
                    py_type = _TYPE_MAP[attr_val["type"]]
                    fields[attr_name] = (py_type, Field(description=attr_val.get("description", "")))
        model = create_model(name, **fields)
        model.__doc__ = defn.get("description", "")
        models[name] = model
    return models


def x__build_type_defs__mutmut_18(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("attributes") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "enum" in attr_val:
                    lit_type = Literal[tuple(attr_val["ENUM"])]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get("description", "")))
                else:
                    py_type = _TYPE_MAP[attr_val["type"]]
                    fields[attr_name] = (py_type, Field(description=attr_val.get("description", "")))
        model = create_model(name, **fields)
        model.__doc__ = defn.get("description", "")
        models[name] = model
    return models


def x__build_type_defs__mutmut_19(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("attributes") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "enum" in attr_val:
                    lit_type = Literal[tuple(attr_val["enum"])]  # type: ignore[valid-type]
                    fields[attr_name] = None
                else:
                    py_type = _TYPE_MAP[attr_val["type"]]
                    fields[attr_name] = (py_type, Field(description=attr_val.get("description", "")))
        model = create_model(name, **fields)
        model.__doc__ = defn.get("description", "")
        models[name] = model
    return models


def x__build_type_defs__mutmut_20(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("attributes") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "enum" in attr_val:
                    lit_type = Literal[tuple(attr_val["enum"])]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=None))
                else:
                    py_type = _TYPE_MAP[attr_val["type"]]
                    fields[attr_name] = (py_type, Field(description=attr_val.get("description", "")))
        model = create_model(name, **fields)
        model.__doc__ = defn.get("description", "")
        models[name] = model
    return models


def x__build_type_defs__mutmut_21(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("attributes") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "enum" in attr_val:
                    lit_type = Literal[tuple(attr_val["enum"])]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get(None, "")))
                else:
                    py_type = _TYPE_MAP[attr_val["type"]]
                    fields[attr_name] = (py_type, Field(description=attr_val.get("description", "")))
        model = create_model(name, **fields)
        model.__doc__ = defn.get("description", "")
        models[name] = model
    return models


def x__build_type_defs__mutmut_22(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("attributes") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "enum" in attr_val:
                    lit_type = Literal[tuple(attr_val["enum"])]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get("description", None)))
                else:
                    py_type = _TYPE_MAP[attr_val["type"]]
                    fields[attr_name] = (py_type, Field(description=attr_val.get("description", "")))
        model = create_model(name, **fields)
        model.__doc__ = defn.get("description", "")
        models[name] = model
    return models


def x__build_type_defs__mutmut_23(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("attributes") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "enum" in attr_val:
                    lit_type = Literal[tuple(attr_val["enum"])]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get("")))
                else:
                    py_type = _TYPE_MAP[attr_val["type"]]
                    fields[attr_name] = (py_type, Field(description=attr_val.get("description", "")))
        model = create_model(name, **fields)
        model.__doc__ = defn.get("description", "")
        models[name] = model
    return models


def x__build_type_defs__mutmut_24(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("attributes") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "enum" in attr_val:
                    lit_type = Literal[tuple(attr_val["enum"])]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get("description", )))
                else:
                    py_type = _TYPE_MAP[attr_val["type"]]
                    fields[attr_name] = (py_type, Field(description=attr_val.get("description", "")))
        model = create_model(name, **fields)
        model.__doc__ = defn.get("description", "")
        models[name] = model
    return models


def x__build_type_defs__mutmut_25(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("attributes") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "enum" in attr_val:
                    lit_type = Literal[tuple(attr_val["enum"])]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get("XXdescriptionXX", "")))
                else:
                    py_type = _TYPE_MAP[attr_val["type"]]
                    fields[attr_name] = (py_type, Field(description=attr_val.get("description", "")))
        model = create_model(name, **fields)
        model.__doc__ = defn.get("description", "")
        models[name] = model
    return models


def x__build_type_defs__mutmut_26(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("attributes") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "enum" in attr_val:
                    lit_type = Literal[tuple(attr_val["enum"])]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get("DESCRIPTION", "")))
                else:
                    py_type = _TYPE_MAP[attr_val["type"]]
                    fields[attr_name] = (py_type, Field(description=attr_val.get("description", "")))
        model = create_model(name, **fields)
        model.__doc__ = defn.get("description", "")
        models[name] = model
    return models


def x__build_type_defs__mutmut_27(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("attributes") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "enum" in attr_val:
                    lit_type = Literal[tuple(attr_val["enum"])]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get("description", "XXXX")))
                else:
                    py_type = _TYPE_MAP[attr_val["type"]]
                    fields[attr_name] = (py_type, Field(description=attr_val.get("description", "")))
        model = create_model(name, **fields)
        model.__doc__ = defn.get("description", "")
        models[name] = model
    return models


def x__build_type_defs__mutmut_28(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("attributes") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "enum" in attr_val:
                    lit_type = Literal[tuple(attr_val["enum"])]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get("description", "")))
                else:
                    py_type = None
                    fields[attr_name] = (py_type, Field(description=attr_val.get("description", "")))
        model = create_model(name, **fields)
        model.__doc__ = defn.get("description", "")
        models[name] = model
    return models


def x__build_type_defs__mutmut_29(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("attributes") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "enum" in attr_val:
                    lit_type = Literal[tuple(attr_val["enum"])]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get("description", "")))
                else:
                    py_type = _TYPE_MAP[attr_val["XXtypeXX"]]
                    fields[attr_name] = (py_type, Field(description=attr_val.get("description", "")))
        model = create_model(name, **fields)
        model.__doc__ = defn.get("description", "")
        models[name] = model
    return models


def x__build_type_defs__mutmut_30(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("attributes") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "enum" in attr_val:
                    lit_type = Literal[tuple(attr_val["enum"])]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get("description", "")))
                else:
                    py_type = _TYPE_MAP[attr_val["TYPE"]]
                    fields[attr_name] = (py_type, Field(description=attr_val.get("description", "")))
        model = create_model(name, **fields)
        model.__doc__ = defn.get("description", "")
        models[name] = model
    return models


def x__build_type_defs__mutmut_31(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("attributes") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "enum" in attr_val:
                    lit_type = Literal[tuple(attr_val["enum"])]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get("description", "")))
                else:
                    py_type = _TYPE_MAP[attr_val["type"]]
                    fields[attr_name] = None
        model = create_model(name, **fields)
        model.__doc__ = defn.get("description", "")
        models[name] = model
    return models


def x__build_type_defs__mutmut_32(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("attributes") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "enum" in attr_val:
                    lit_type = Literal[tuple(attr_val["enum"])]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get("description", "")))
                else:
                    py_type = _TYPE_MAP[attr_val["type"]]
                    fields[attr_name] = (py_type, Field(description=None))
        model = create_model(name, **fields)
        model.__doc__ = defn.get("description", "")
        models[name] = model
    return models


def x__build_type_defs__mutmut_33(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("attributes") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "enum" in attr_val:
                    lit_type = Literal[tuple(attr_val["enum"])]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get("description", "")))
                else:
                    py_type = _TYPE_MAP[attr_val["type"]]
                    fields[attr_name] = (py_type, Field(description=attr_val.get(None, "")))
        model = create_model(name, **fields)
        model.__doc__ = defn.get("description", "")
        models[name] = model
    return models


def x__build_type_defs__mutmut_34(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("attributes") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "enum" in attr_val:
                    lit_type = Literal[tuple(attr_val["enum"])]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get("description", "")))
                else:
                    py_type = _TYPE_MAP[attr_val["type"]]
                    fields[attr_name] = (py_type, Field(description=attr_val.get("description", None)))
        model = create_model(name, **fields)
        model.__doc__ = defn.get("description", "")
        models[name] = model
    return models


def x__build_type_defs__mutmut_35(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("attributes") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "enum" in attr_val:
                    lit_type = Literal[tuple(attr_val["enum"])]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get("description", "")))
                else:
                    py_type = _TYPE_MAP[attr_val["type"]]
                    fields[attr_name] = (py_type, Field(description=attr_val.get("")))
        model = create_model(name, **fields)
        model.__doc__ = defn.get("description", "")
        models[name] = model
    return models


def x__build_type_defs__mutmut_36(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("attributes") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "enum" in attr_val:
                    lit_type = Literal[tuple(attr_val["enum"])]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get("description", "")))
                else:
                    py_type = _TYPE_MAP[attr_val["type"]]
                    fields[attr_name] = (py_type, Field(description=attr_val.get("description", )))
        model = create_model(name, **fields)
        model.__doc__ = defn.get("description", "")
        models[name] = model
    return models


def x__build_type_defs__mutmut_37(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("attributes") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "enum" in attr_val:
                    lit_type = Literal[tuple(attr_val["enum"])]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get("description", "")))
                else:
                    py_type = _TYPE_MAP[attr_val["type"]]
                    fields[attr_name] = (py_type, Field(description=attr_val.get("XXdescriptionXX", "")))
        model = create_model(name, **fields)
        model.__doc__ = defn.get("description", "")
        models[name] = model
    return models


def x__build_type_defs__mutmut_38(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("attributes") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "enum" in attr_val:
                    lit_type = Literal[tuple(attr_val["enum"])]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get("description", "")))
                else:
                    py_type = _TYPE_MAP[attr_val["type"]]
                    fields[attr_name] = (py_type, Field(description=attr_val.get("DESCRIPTION", "")))
        model = create_model(name, **fields)
        model.__doc__ = defn.get("description", "")
        models[name] = model
    return models


def x__build_type_defs__mutmut_39(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("attributes") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "enum" in attr_val:
                    lit_type = Literal[tuple(attr_val["enum"])]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get("description", "")))
                else:
                    py_type = _TYPE_MAP[attr_val["type"]]
                    fields[attr_name] = (py_type, Field(description=attr_val.get("description", "XXXX")))
        model = create_model(name, **fields)
        model.__doc__ = defn.get("description", "")
        models[name] = model
    return models


def x__build_type_defs__mutmut_40(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("attributes") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "enum" in attr_val:
                    lit_type = Literal[tuple(attr_val["enum"])]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get("description", "")))
                else:
                    py_type = _TYPE_MAP[attr_val["type"]]
                    fields[attr_name] = (py_type, Field(description=attr_val.get("description", "")))
        model = None
        model.__doc__ = defn.get("description", "")
        models[name] = model
    return models


def x__build_type_defs__mutmut_41(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("attributes") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "enum" in attr_val:
                    lit_type = Literal[tuple(attr_val["enum"])]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get("description", "")))
                else:
                    py_type = _TYPE_MAP[attr_val["type"]]
                    fields[attr_name] = (py_type, Field(description=attr_val.get("description", "")))
        model = create_model(None, **fields)
        model.__doc__ = defn.get("description", "")
        models[name] = model
    return models


def x__build_type_defs__mutmut_42(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("attributes") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "enum" in attr_val:
                    lit_type = Literal[tuple(attr_val["enum"])]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get("description", "")))
                else:
                    py_type = _TYPE_MAP[attr_val["type"]]
                    fields[attr_name] = (py_type, Field(description=attr_val.get("description", "")))
        model = create_model(**fields)
        model.__doc__ = defn.get("description", "")
        models[name] = model
    return models


def x__build_type_defs__mutmut_43(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("attributes") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "enum" in attr_val:
                    lit_type = Literal[tuple(attr_val["enum"])]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get("description", "")))
                else:
                    py_type = _TYPE_MAP[attr_val["type"]]
                    fields[attr_name] = (py_type, Field(description=attr_val.get("description", "")))
        model = create_model(name, )
        model.__doc__ = defn.get("description", "")
        models[name] = model
    return models


def x__build_type_defs__mutmut_44(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("attributes") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "enum" in attr_val:
                    lit_type = Literal[tuple(attr_val["enum"])]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get("description", "")))
                else:
                    py_type = _TYPE_MAP[attr_val["type"]]
                    fields[attr_name] = (py_type, Field(description=attr_val.get("description", "")))
        model = create_model(name, **fields)
        model.__doc__ = None
        models[name] = model
    return models


def x__build_type_defs__mutmut_45(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("attributes") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "enum" in attr_val:
                    lit_type = Literal[tuple(attr_val["enum"])]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get("description", "")))
                else:
                    py_type = _TYPE_MAP[attr_val["type"]]
                    fields[attr_name] = (py_type, Field(description=attr_val.get("description", "")))
        model = create_model(name, **fields)
        model.__doc__ = defn.get(None, "")
        models[name] = model
    return models


def x__build_type_defs__mutmut_46(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("attributes") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "enum" in attr_val:
                    lit_type = Literal[tuple(attr_val["enum"])]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get("description", "")))
                else:
                    py_type = _TYPE_MAP[attr_val["type"]]
                    fields[attr_name] = (py_type, Field(description=attr_val.get("description", "")))
        model = create_model(name, **fields)
        model.__doc__ = defn.get("description", None)
        models[name] = model
    return models


def x__build_type_defs__mutmut_47(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("attributes") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "enum" in attr_val:
                    lit_type = Literal[tuple(attr_val["enum"])]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get("description", "")))
                else:
                    py_type = _TYPE_MAP[attr_val["type"]]
                    fields[attr_name] = (py_type, Field(description=attr_val.get("description", "")))
        model = create_model(name, **fields)
        model.__doc__ = defn.get("")
        models[name] = model
    return models


def x__build_type_defs__mutmut_48(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("attributes") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "enum" in attr_val:
                    lit_type = Literal[tuple(attr_val["enum"])]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get("description", "")))
                else:
                    py_type = _TYPE_MAP[attr_val["type"]]
                    fields[attr_name] = (py_type, Field(description=attr_val.get("description", "")))
        model = create_model(name, **fields)
        model.__doc__ = defn.get("description", )
        models[name] = model
    return models


def x__build_type_defs__mutmut_49(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("attributes") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "enum" in attr_val:
                    lit_type = Literal[tuple(attr_val["enum"])]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get("description", "")))
                else:
                    py_type = _TYPE_MAP[attr_val["type"]]
                    fields[attr_name] = (py_type, Field(description=attr_val.get("description", "")))
        model = create_model(name, **fields)
        model.__doc__ = defn.get("XXdescriptionXX", "")
        models[name] = model
    return models


def x__build_type_defs__mutmut_50(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("attributes") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "enum" in attr_val:
                    lit_type = Literal[tuple(attr_val["enum"])]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get("description", "")))
                else:
                    py_type = _TYPE_MAP[attr_val["type"]]
                    fields[attr_name] = (py_type, Field(description=attr_val.get("description", "")))
        model = create_model(name, **fields)
        model.__doc__ = defn.get("DESCRIPTION", "")
        models[name] = model
    return models


def x__build_type_defs__mutmut_51(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("attributes") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "enum" in attr_val:
                    lit_type = Literal[tuple(attr_val["enum"])]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get("description", "")))
                else:
                    py_type = _TYPE_MAP[attr_val["type"]]
                    fields[attr_name] = (py_type, Field(description=attr_val.get("description", "")))
        model = create_model(name, **fields)
        model.__doc__ = defn.get("description", "XXXX")
        models[name] = model
    return models


def x__build_type_defs__mutmut_52(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("attributes") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "enum" in attr_val:
                    lit_type = Literal[tuple(attr_val["enum"])]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get("description", "")))
                else:
                    py_type = _TYPE_MAP[attr_val["type"]]
                    fields[attr_name] = (py_type, Field(description=attr_val.get("description", "")))
        model = create_model(name, **fields)
        model.__doc__ = defn.get("description", "")
        models[name] = None
    return models

x__build_type_defs__mutmut_mutants : ClassVar[MutantDict] = { # type: ignore
'x__build_type_defs__mutmut_1': x__build_type_defs__mutmut_1, 
    'x__build_type_defs__mutmut_2': x__build_type_defs__mutmut_2, 
    'x__build_type_defs__mutmut_3': x__build_type_defs__mutmut_3, 
    'x__build_type_defs__mutmut_4': x__build_type_defs__mutmut_4, 
    'x__build_type_defs__mutmut_5': x__build_type_defs__mutmut_5, 
    'x__build_type_defs__mutmut_6': x__build_type_defs__mutmut_6, 
    'x__build_type_defs__mutmut_7': x__build_type_defs__mutmut_7, 
    'x__build_type_defs__mutmut_8': x__build_type_defs__mutmut_8, 
    'x__build_type_defs__mutmut_9': x__build_type_defs__mutmut_9, 
    'x__build_type_defs__mutmut_10': x__build_type_defs__mutmut_10, 
    'x__build_type_defs__mutmut_11': x__build_type_defs__mutmut_11, 
    'x__build_type_defs__mutmut_12': x__build_type_defs__mutmut_12, 
    'x__build_type_defs__mutmut_13': x__build_type_defs__mutmut_13, 
    'x__build_type_defs__mutmut_14': x__build_type_defs__mutmut_14, 
    'x__build_type_defs__mutmut_15': x__build_type_defs__mutmut_15, 
    'x__build_type_defs__mutmut_16': x__build_type_defs__mutmut_16, 
    'x__build_type_defs__mutmut_17': x__build_type_defs__mutmut_17, 
    'x__build_type_defs__mutmut_18': x__build_type_defs__mutmut_18, 
    'x__build_type_defs__mutmut_19': x__build_type_defs__mutmut_19, 
    'x__build_type_defs__mutmut_20': x__build_type_defs__mutmut_20, 
    'x__build_type_defs__mutmut_21': x__build_type_defs__mutmut_21, 
    'x__build_type_defs__mutmut_22': x__build_type_defs__mutmut_22, 
    'x__build_type_defs__mutmut_23': x__build_type_defs__mutmut_23, 
    'x__build_type_defs__mutmut_24': x__build_type_defs__mutmut_24, 
    'x__build_type_defs__mutmut_25': x__build_type_defs__mutmut_25, 
    'x__build_type_defs__mutmut_26': x__build_type_defs__mutmut_26, 
    'x__build_type_defs__mutmut_27': x__build_type_defs__mutmut_27, 
    'x__build_type_defs__mutmut_28': x__build_type_defs__mutmut_28, 
    'x__build_type_defs__mutmut_29': x__build_type_defs__mutmut_29, 
    'x__build_type_defs__mutmut_30': x__build_type_defs__mutmut_30, 
    'x__build_type_defs__mutmut_31': x__build_type_defs__mutmut_31, 
    'x__build_type_defs__mutmut_32': x__build_type_defs__mutmut_32, 
    'x__build_type_defs__mutmut_33': x__build_type_defs__mutmut_33, 
    'x__build_type_defs__mutmut_34': x__build_type_defs__mutmut_34, 
    'x__build_type_defs__mutmut_35': x__build_type_defs__mutmut_35, 
    'x__build_type_defs__mutmut_36': x__build_type_defs__mutmut_36, 
    'x__build_type_defs__mutmut_37': x__build_type_defs__mutmut_37, 
    'x__build_type_defs__mutmut_38': x__build_type_defs__mutmut_38, 
    'x__build_type_defs__mutmut_39': x__build_type_defs__mutmut_39, 
    'x__build_type_defs__mutmut_40': x__build_type_defs__mutmut_40, 
    'x__build_type_defs__mutmut_41': x__build_type_defs__mutmut_41, 
    'x__build_type_defs__mutmut_42': x__build_type_defs__mutmut_42, 
    'x__build_type_defs__mutmut_43': x__build_type_defs__mutmut_43, 
    'x__build_type_defs__mutmut_44': x__build_type_defs__mutmut_44, 
    'x__build_type_defs__mutmut_45': x__build_type_defs__mutmut_45, 
    'x__build_type_defs__mutmut_46': x__build_type_defs__mutmut_46, 
    'x__build_type_defs__mutmut_47': x__build_type_defs__mutmut_47, 
    'x__build_type_defs__mutmut_48': x__build_type_defs__mutmut_48, 
    'x__build_type_defs__mutmut_49': x__build_type_defs__mutmut_49, 
    'x__build_type_defs__mutmut_50': x__build_type_defs__mutmut_50, 
    'x__build_type_defs__mutmut_51': x__build_type_defs__mutmut_51, 
    'x__build_type_defs__mutmut_52': x__build_type_defs__mutmut_52
}
x__build_type_defs__mutmut_orig.__name__ = 'x__build_type_defs'


def _build_ontology(
    cfg: dict,
) -> tuple[
    dict[str, type[BaseModel]] | None,
    dict[str, type[BaseModel]] | None,
    dict[tuple[str, str], list[str]] | None,
    list[str] | None,
]:
    args = [cfg]# type: ignore
    kwargs = {}# type: ignore
    return _mutmut_trampoline(x__build_ontology__mutmut_orig, x__build_ontology__mutmut_mutants, args, kwargs, None)


def x__build_ontology__mutmut_orig(
    cfg: dict,
) -> tuple[
    dict[str, type[BaseModel]] | None,
    dict[str, type[BaseModel]] | None,
    dict[tuple[str, str], list[str]] | None,
    list[str] | None,
]:
    """Build ontology from config. Returns (entity_types, edge_types, edge_type_map, excluded)."""
    raw = cfg.get("ontology")
    if not raw:
        return None, None, None, None

    entity_defs = raw.get("entities") or {}
    edge_defs = raw.get("edges") or {}
    edge_map_raw = raw.get("edgeMap") or {}
    excluded_raw = raw.get("excludedEntityTypes")

    entity_types = _build_type_defs(entity_defs) if entity_defs else None
    edge_types = _build_type_defs(edge_defs) if edge_defs else None

    edge_type_map: dict[tuple[str, str], list[str]] | None = None
    if edge_map_raw:
        edge_type_map = {}
        for key, values in edge_map_raw.items():
            parts = key.split(",")
            edge_type_map[(parts[0], parts[1])] = values

    excluded = list(excluded_raw) if excluded_raw else None

    if not entity_types and not edge_types and not edge_type_map and not excluded:
        return None, None, None, None

    return entity_types, edge_types, edge_type_map, excluded


def x__build_ontology__mutmut_1(
    cfg: dict,
) -> tuple[
    dict[str, type[BaseModel]] | None,
    dict[str, type[BaseModel]] | None,
    dict[tuple[str, str], list[str]] | None,
    list[str] | None,
]:
    """Build ontology from config. Returns (entity_types, edge_types, edge_type_map, excluded)."""
    raw = None
    if not raw:
        return None, None, None, None

    entity_defs = raw.get("entities") or {}
    edge_defs = raw.get("edges") or {}
    edge_map_raw = raw.get("edgeMap") or {}
    excluded_raw = raw.get("excludedEntityTypes")

    entity_types = _build_type_defs(entity_defs) if entity_defs else None
    edge_types = _build_type_defs(edge_defs) if edge_defs else None

    edge_type_map: dict[tuple[str, str], list[str]] | None = None
    if edge_map_raw:
        edge_type_map = {}
        for key, values in edge_map_raw.items():
            parts = key.split(",")
            edge_type_map[(parts[0], parts[1])] = values

    excluded = list(excluded_raw) if excluded_raw else None

    if not entity_types and not edge_types and not edge_type_map and not excluded:
        return None, None, None, None

    return entity_types, edge_types, edge_type_map, excluded


def x__build_ontology__mutmut_2(
    cfg: dict,
) -> tuple[
    dict[str, type[BaseModel]] | None,
    dict[str, type[BaseModel]] | None,
    dict[tuple[str, str], list[str]] | None,
    list[str] | None,
]:
    """Build ontology from config. Returns (entity_types, edge_types, edge_type_map, excluded)."""
    raw = cfg.get(None)
    if not raw:
        return None, None, None, None

    entity_defs = raw.get("entities") or {}
    edge_defs = raw.get("edges") or {}
    edge_map_raw = raw.get("edgeMap") or {}
    excluded_raw = raw.get("excludedEntityTypes")

    entity_types = _build_type_defs(entity_defs) if entity_defs else None
    edge_types = _build_type_defs(edge_defs) if edge_defs else None

    edge_type_map: dict[tuple[str, str], list[str]] | None = None
    if edge_map_raw:
        edge_type_map = {}
        for key, values in edge_map_raw.items():
            parts = key.split(",")
            edge_type_map[(parts[0], parts[1])] = values

    excluded = list(excluded_raw) if excluded_raw else None

    if not entity_types and not edge_types and not edge_type_map and not excluded:
        return None, None, None, None

    return entity_types, edge_types, edge_type_map, excluded


def x__build_ontology__mutmut_3(
    cfg: dict,
) -> tuple[
    dict[str, type[BaseModel]] | None,
    dict[str, type[BaseModel]] | None,
    dict[tuple[str, str], list[str]] | None,
    list[str] | None,
]:
    """Build ontology from config. Returns (entity_types, edge_types, edge_type_map, excluded)."""
    raw = cfg.get("XXontologyXX")
    if not raw:
        return None, None, None, None

    entity_defs = raw.get("entities") or {}
    edge_defs = raw.get("edges") or {}
    edge_map_raw = raw.get("edgeMap") or {}
    excluded_raw = raw.get("excludedEntityTypes")

    entity_types = _build_type_defs(entity_defs) if entity_defs else None
    edge_types = _build_type_defs(edge_defs) if edge_defs else None

    edge_type_map: dict[tuple[str, str], list[str]] | None = None
    if edge_map_raw:
        edge_type_map = {}
        for key, values in edge_map_raw.items():
            parts = key.split(",")
            edge_type_map[(parts[0], parts[1])] = values

    excluded = list(excluded_raw) if excluded_raw else None

    if not entity_types and not edge_types and not edge_type_map and not excluded:
        return None, None, None, None

    return entity_types, edge_types, edge_type_map, excluded


def x__build_ontology__mutmut_4(
    cfg: dict,
) -> tuple[
    dict[str, type[BaseModel]] | None,
    dict[str, type[BaseModel]] | None,
    dict[tuple[str, str], list[str]] | None,
    list[str] | None,
]:
    """Build ontology from config. Returns (entity_types, edge_types, edge_type_map, excluded)."""
    raw = cfg.get("ONTOLOGY")
    if not raw:
        return None, None, None, None

    entity_defs = raw.get("entities") or {}
    edge_defs = raw.get("edges") or {}
    edge_map_raw = raw.get("edgeMap") or {}
    excluded_raw = raw.get("excludedEntityTypes")

    entity_types = _build_type_defs(entity_defs) if entity_defs else None
    edge_types = _build_type_defs(edge_defs) if edge_defs else None

    edge_type_map: dict[tuple[str, str], list[str]] | None = None
    if edge_map_raw:
        edge_type_map = {}
        for key, values in edge_map_raw.items():
            parts = key.split(",")
            edge_type_map[(parts[0], parts[1])] = values

    excluded = list(excluded_raw) if excluded_raw else None

    if not entity_types and not edge_types and not edge_type_map and not excluded:
        return None, None, None, None

    return entity_types, edge_types, edge_type_map, excluded


def x__build_ontology__mutmut_5(
    cfg: dict,
) -> tuple[
    dict[str, type[BaseModel]] | None,
    dict[str, type[BaseModel]] | None,
    dict[tuple[str, str], list[str]] | None,
    list[str] | None,
]:
    """Build ontology from config. Returns (entity_types, edge_types, edge_type_map, excluded)."""
    raw = cfg.get("ontology")
    if raw:
        return None, None, None, None

    entity_defs = raw.get("entities") or {}
    edge_defs = raw.get("edges") or {}
    edge_map_raw = raw.get("edgeMap") or {}
    excluded_raw = raw.get("excludedEntityTypes")

    entity_types = _build_type_defs(entity_defs) if entity_defs else None
    edge_types = _build_type_defs(edge_defs) if edge_defs else None

    edge_type_map: dict[tuple[str, str], list[str]] | None = None
    if edge_map_raw:
        edge_type_map = {}
        for key, values in edge_map_raw.items():
            parts = key.split(",")
            edge_type_map[(parts[0], parts[1])] = values

    excluded = list(excluded_raw) if excluded_raw else None

    if not entity_types and not edge_types and not edge_type_map and not excluded:
        return None, None, None, None

    return entity_types, edge_types, edge_type_map, excluded


def x__build_ontology__mutmut_6(
    cfg: dict,
) -> tuple[
    dict[str, type[BaseModel]] | None,
    dict[str, type[BaseModel]] | None,
    dict[tuple[str, str], list[str]] | None,
    list[str] | None,
]:
    """Build ontology from config. Returns (entity_types, edge_types, edge_type_map, excluded)."""
    raw = cfg.get("ontology")
    if not raw:
        return None, None, None, None

    entity_defs = None
    edge_defs = raw.get("edges") or {}
    edge_map_raw = raw.get("edgeMap") or {}
    excluded_raw = raw.get("excludedEntityTypes")

    entity_types = _build_type_defs(entity_defs) if entity_defs else None
    edge_types = _build_type_defs(edge_defs) if edge_defs else None

    edge_type_map: dict[tuple[str, str], list[str]] | None = None
    if edge_map_raw:
        edge_type_map = {}
        for key, values in edge_map_raw.items():
            parts = key.split(",")
            edge_type_map[(parts[0], parts[1])] = values

    excluded = list(excluded_raw) if excluded_raw else None

    if not entity_types and not edge_types and not edge_type_map and not excluded:
        return None, None, None, None

    return entity_types, edge_types, edge_type_map, excluded


def x__build_ontology__mutmut_7(
    cfg: dict,
) -> tuple[
    dict[str, type[BaseModel]] | None,
    dict[str, type[BaseModel]] | None,
    dict[tuple[str, str], list[str]] | None,
    list[str] | None,
]:
    """Build ontology from config. Returns (entity_types, edge_types, edge_type_map, excluded)."""
    raw = cfg.get("ontology")
    if not raw:
        return None, None, None, None

    entity_defs = raw.get("entities") and {}
    edge_defs = raw.get("edges") or {}
    edge_map_raw = raw.get("edgeMap") or {}
    excluded_raw = raw.get("excludedEntityTypes")

    entity_types = _build_type_defs(entity_defs) if entity_defs else None
    edge_types = _build_type_defs(edge_defs) if edge_defs else None

    edge_type_map: dict[tuple[str, str], list[str]] | None = None
    if edge_map_raw:
        edge_type_map = {}
        for key, values in edge_map_raw.items():
            parts = key.split(",")
            edge_type_map[(parts[0], parts[1])] = values

    excluded = list(excluded_raw) if excluded_raw else None

    if not entity_types and not edge_types and not edge_type_map and not excluded:
        return None, None, None, None

    return entity_types, edge_types, edge_type_map, excluded


def x__build_ontology__mutmut_8(
    cfg: dict,
) -> tuple[
    dict[str, type[BaseModel]] | None,
    dict[str, type[BaseModel]] | None,
    dict[tuple[str, str], list[str]] | None,
    list[str] | None,
]:
    """Build ontology from config. Returns (entity_types, edge_types, edge_type_map, excluded)."""
    raw = cfg.get("ontology")
    if not raw:
        return None, None, None, None

    entity_defs = raw.get(None) or {}
    edge_defs = raw.get("edges") or {}
    edge_map_raw = raw.get("edgeMap") or {}
    excluded_raw = raw.get("excludedEntityTypes")

    entity_types = _build_type_defs(entity_defs) if entity_defs else None
    edge_types = _build_type_defs(edge_defs) if edge_defs else None

    edge_type_map: dict[tuple[str, str], list[str]] | None = None
    if edge_map_raw:
        edge_type_map = {}
        for key, values in edge_map_raw.items():
            parts = key.split(",")
            edge_type_map[(parts[0], parts[1])] = values

    excluded = list(excluded_raw) if excluded_raw else None

    if not entity_types and not edge_types and not edge_type_map and not excluded:
        return None, None, None, None

    return entity_types, edge_types, edge_type_map, excluded


def x__build_ontology__mutmut_9(
    cfg: dict,
) -> tuple[
    dict[str, type[BaseModel]] | None,
    dict[str, type[BaseModel]] | None,
    dict[tuple[str, str], list[str]] | None,
    list[str] | None,
]:
    """Build ontology from config. Returns (entity_types, edge_types, edge_type_map, excluded)."""
    raw = cfg.get("ontology")
    if not raw:
        return None, None, None, None

    entity_defs = raw.get("XXentitiesXX") or {}
    edge_defs = raw.get("edges") or {}
    edge_map_raw = raw.get("edgeMap") or {}
    excluded_raw = raw.get("excludedEntityTypes")

    entity_types = _build_type_defs(entity_defs) if entity_defs else None
    edge_types = _build_type_defs(edge_defs) if edge_defs else None

    edge_type_map: dict[tuple[str, str], list[str]] | None = None
    if edge_map_raw:
        edge_type_map = {}
        for key, values in edge_map_raw.items():
            parts = key.split(",")
            edge_type_map[(parts[0], parts[1])] = values

    excluded = list(excluded_raw) if excluded_raw else None

    if not entity_types and not edge_types and not edge_type_map and not excluded:
        return None, None, None, None

    return entity_types, edge_types, edge_type_map, excluded


def x__build_ontology__mutmut_10(
    cfg: dict,
) -> tuple[
    dict[str, type[BaseModel]] | None,
    dict[str, type[BaseModel]] | None,
    dict[tuple[str, str], list[str]] | None,
    list[str] | None,
]:
    """Build ontology from config. Returns (entity_types, edge_types, edge_type_map, excluded)."""
    raw = cfg.get("ontology")
    if not raw:
        return None, None, None, None

    entity_defs = raw.get("ENTITIES") or {}
    edge_defs = raw.get("edges") or {}
    edge_map_raw = raw.get("edgeMap") or {}
    excluded_raw = raw.get("excludedEntityTypes")

    entity_types = _build_type_defs(entity_defs) if entity_defs else None
    edge_types = _build_type_defs(edge_defs) if edge_defs else None

    edge_type_map: dict[tuple[str, str], list[str]] | None = None
    if edge_map_raw:
        edge_type_map = {}
        for key, values in edge_map_raw.items():
            parts = key.split(",")
            edge_type_map[(parts[0], parts[1])] = values

    excluded = list(excluded_raw) if excluded_raw else None

    if not entity_types and not edge_types and not edge_type_map and not excluded:
        return None, None, None, None

    return entity_types, edge_types, edge_type_map, excluded


def x__build_ontology__mutmut_11(
    cfg: dict,
) -> tuple[
    dict[str, type[BaseModel]] | None,
    dict[str, type[BaseModel]] | None,
    dict[tuple[str, str], list[str]] | None,
    list[str] | None,
]:
    """Build ontology from config. Returns (entity_types, edge_types, edge_type_map, excluded)."""
    raw = cfg.get("ontology")
    if not raw:
        return None, None, None, None

    entity_defs = raw.get("entities") or {}
    edge_defs = None
    edge_map_raw = raw.get("edgeMap") or {}
    excluded_raw = raw.get("excludedEntityTypes")

    entity_types = _build_type_defs(entity_defs) if entity_defs else None
    edge_types = _build_type_defs(edge_defs) if edge_defs else None

    edge_type_map: dict[tuple[str, str], list[str]] | None = None
    if edge_map_raw:
        edge_type_map = {}
        for key, values in edge_map_raw.items():
            parts = key.split(",")
            edge_type_map[(parts[0], parts[1])] = values

    excluded = list(excluded_raw) if excluded_raw else None

    if not entity_types and not edge_types and not edge_type_map and not excluded:
        return None, None, None, None

    return entity_types, edge_types, edge_type_map, excluded


def x__build_ontology__mutmut_12(
    cfg: dict,
) -> tuple[
    dict[str, type[BaseModel]] | None,
    dict[str, type[BaseModel]] | None,
    dict[tuple[str, str], list[str]] | None,
    list[str] | None,
]:
    """Build ontology from config. Returns (entity_types, edge_types, edge_type_map, excluded)."""
    raw = cfg.get("ontology")
    if not raw:
        return None, None, None, None

    entity_defs = raw.get("entities") or {}
    edge_defs = raw.get("edges") and {}
    edge_map_raw = raw.get("edgeMap") or {}
    excluded_raw = raw.get("excludedEntityTypes")

    entity_types = _build_type_defs(entity_defs) if entity_defs else None
    edge_types = _build_type_defs(edge_defs) if edge_defs else None

    edge_type_map: dict[tuple[str, str], list[str]] | None = None
    if edge_map_raw:
        edge_type_map = {}
        for key, values in edge_map_raw.items():
            parts = key.split(",")
            edge_type_map[(parts[0], parts[1])] = values

    excluded = list(excluded_raw) if excluded_raw else None

    if not entity_types and not edge_types and not edge_type_map and not excluded:
        return None, None, None, None

    return entity_types, edge_types, edge_type_map, excluded


def x__build_ontology__mutmut_13(
    cfg: dict,
) -> tuple[
    dict[str, type[BaseModel]] | None,
    dict[str, type[BaseModel]] | None,
    dict[tuple[str, str], list[str]] | None,
    list[str] | None,
]:
    """Build ontology from config. Returns (entity_types, edge_types, edge_type_map, excluded)."""
    raw = cfg.get("ontology")
    if not raw:
        return None, None, None, None

    entity_defs = raw.get("entities") or {}
    edge_defs = raw.get(None) or {}
    edge_map_raw = raw.get("edgeMap") or {}
    excluded_raw = raw.get("excludedEntityTypes")

    entity_types = _build_type_defs(entity_defs) if entity_defs else None
    edge_types = _build_type_defs(edge_defs) if edge_defs else None

    edge_type_map: dict[tuple[str, str], list[str]] | None = None
    if edge_map_raw:
        edge_type_map = {}
        for key, values in edge_map_raw.items():
            parts = key.split(",")
            edge_type_map[(parts[0], parts[1])] = values

    excluded = list(excluded_raw) if excluded_raw else None

    if not entity_types and not edge_types and not edge_type_map and not excluded:
        return None, None, None, None

    return entity_types, edge_types, edge_type_map, excluded


def x__build_ontology__mutmut_14(
    cfg: dict,
) -> tuple[
    dict[str, type[BaseModel]] | None,
    dict[str, type[BaseModel]] | None,
    dict[tuple[str, str], list[str]] | None,
    list[str] | None,
]:
    """Build ontology from config. Returns (entity_types, edge_types, edge_type_map, excluded)."""
    raw = cfg.get("ontology")
    if not raw:
        return None, None, None, None

    entity_defs = raw.get("entities") or {}
    edge_defs = raw.get("XXedgesXX") or {}
    edge_map_raw = raw.get("edgeMap") or {}
    excluded_raw = raw.get("excludedEntityTypes")

    entity_types = _build_type_defs(entity_defs) if entity_defs else None
    edge_types = _build_type_defs(edge_defs) if edge_defs else None

    edge_type_map: dict[tuple[str, str], list[str]] | None = None
    if edge_map_raw:
        edge_type_map = {}
        for key, values in edge_map_raw.items():
            parts = key.split(",")
            edge_type_map[(parts[0], parts[1])] = values

    excluded = list(excluded_raw) if excluded_raw else None

    if not entity_types and not edge_types and not edge_type_map and not excluded:
        return None, None, None, None

    return entity_types, edge_types, edge_type_map, excluded


def x__build_ontology__mutmut_15(
    cfg: dict,
) -> tuple[
    dict[str, type[BaseModel]] | None,
    dict[str, type[BaseModel]] | None,
    dict[tuple[str, str], list[str]] | None,
    list[str] | None,
]:
    """Build ontology from config. Returns (entity_types, edge_types, edge_type_map, excluded)."""
    raw = cfg.get("ontology")
    if not raw:
        return None, None, None, None

    entity_defs = raw.get("entities") or {}
    edge_defs = raw.get("EDGES") or {}
    edge_map_raw = raw.get("edgeMap") or {}
    excluded_raw = raw.get("excludedEntityTypes")

    entity_types = _build_type_defs(entity_defs) if entity_defs else None
    edge_types = _build_type_defs(edge_defs) if edge_defs else None

    edge_type_map: dict[tuple[str, str], list[str]] | None = None
    if edge_map_raw:
        edge_type_map = {}
        for key, values in edge_map_raw.items():
            parts = key.split(",")
            edge_type_map[(parts[0], parts[1])] = values

    excluded = list(excluded_raw) if excluded_raw else None

    if not entity_types and not edge_types and not edge_type_map and not excluded:
        return None, None, None, None

    return entity_types, edge_types, edge_type_map, excluded


def x__build_ontology__mutmut_16(
    cfg: dict,
) -> tuple[
    dict[str, type[BaseModel]] | None,
    dict[str, type[BaseModel]] | None,
    dict[tuple[str, str], list[str]] | None,
    list[str] | None,
]:
    """Build ontology from config. Returns (entity_types, edge_types, edge_type_map, excluded)."""
    raw = cfg.get("ontology")
    if not raw:
        return None, None, None, None

    entity_defs = raw.get("entities") or {}
    edge_defs = raw.get("edges") or {}
    edge_map_raw = None
    excluded_raw = raw.get("excludedEntityTypes")

    entity_types = _build_type_defs(entity_defs) if entity_defs else None
    edge_types = _build_type_defs(edge_defs) if edge_defs else None

    edge_type_map: dict[tuple[str, str], list[str]] | None = None
    if edge_map_raw:
        edge_type_map = {}
        for key, values in edge_map_raw.items():
            parts = key.split(",")
            edge_type_map[(parts[0], parts[1])] = values

    excluded = list(excluded_raw) if excluded_raw else None

    if not entity_types and not edge_types and not edge_type_map and not excluded:
        return None, None, None, None

    return entity_types, edge_types, edge_type_map, excluded


def x__build_ontology__mutmut_17(
    cfg: dict,
) -> tuple[
    dict[str, type[BaseModel]] | None,
    dict[str, type[BaseModel]] | None,
    dict[tuple[str, str], list[str]] | None,
    list[str] | None,
]:
    """Build ontology from config. Returns (entity_types, edge_types, edge_type_map, excluded)."""
    raw = cfg.get("ontology")
    if not raw:
        return None, None, None, None

    entity_defs = raw.get("entities") or {}
    edge_defs = raw.get("edges") or {}
    edge_map_raw = raw.get("edgeMap") and {}
    excluded_raw = raw.get("excludedEntityTypes")

    entity_types = _build_type_defs(entity_defs) if entity_defs else None
    edge_types = _build_type_defs(edge_defs) if edge_defs else None

    edge_type_map: dict[tuple[str, str], list[str]] | None = None
    if edge_map_raw:
        edge_type_map = {}
        for key, values in edge_map_raw.items():
            parts = key.split(",")
            edge_type_map[(parts[0], parts[1])] = values

    excluded = list(excluded_raw) if excluded_raw else None

    if not entity_types and not edge_types and not edge_type_map and not excluded:
        return None, None, None, None

    return entity_types, edge_types, edge_type_map, excluded


def x__build_ontology__mutmut_18(
    cfg: dict,
) -> tuple[
    dict[str, type[BaseModel]] | None,
    dict[str, type[BaseModel]] | None,
    dict[tuple[str, str], list[str]] | None,
    list[str] | None,
]:
    """Build ontology from config. Returns (entity_types, edge_types, edge_type_map, excluded)."""
    raw = cfg.get("ontology")
    if not raw:
        return None, None, None, None

    entity_defs = raw.get("entities") or {}
    edge_defs = raw.get("edges") or {}
    edge_map_raw = raw.get(None) or {}
    excluded_raw = raw.get("excludedEntityTypes")

    entity_types = _build_type_defs(entity_defs) if entity_defs else None
    edge_types = _build_type_defs(edge_defs) if edge_defs else None

    edge_type_map: dict[tuple[str, str], list[str]] | None = None
    if edge_map_raw:
        edge_type_map = {}
        for key, values in edge_map_raw.items():
            parts = key.split(",")
            edge_type_map[(parts[0], parts[1])] = values

    excluded = list(excluded_raw) if excluded_raw else None

    if not entity_types and not edge_types and not edge_type_map and not excluded:
        return None, None, None, None

    return entity_types, edge_types, edge_type_map, excluded


def x__build_ontology__mutmut_19(
    cfg: dict,
) -> tuple[
    dict[str, type[BaseModel]] | None,
    dict[str, type[BaseModel]] | None,
    dict[tuple[str, str], list[str]] | None,
    list[str] | None,
]:
    """Build ontology from config. Returns (entity_types, edge_types, edge_type_map, excluded)."""
    raw = cfg.get("ontology")
    if not raw:
        return None, None, None, None

    entity_defs = raw.get("entities") or {}
    edge_defs = raw.get("edges") or {}
    edge_map_raw = raw.get("XXedgeMapXX") or {}
    excluded_raw = raw.get("excludedEntityTypes")

    entity_types = _build_type_defs(entity_defs) if entity_defs else None
    edge_types = _build_type_defs(edge_defs) if edge_defs else None

    edge_type_map: dict[tuple[str, str], list[str]] | None = None
    if edge_map_raw:
        edge_type_map = {}
        for key, values in edge_map_raw.items():
            parts = key.split(",")
            edge_type_map[(parts[0], parts[1])] = values

    excluded = list(excluded_raw) if excluded_raw else None

    if not entity_types and not edge_types and not edge_type_map and not excluded:
        return None, None, None, None

    return entity_types, edge_types, edge_type_map, excluded


def x__build_ontology__mutmut_20(
    cfg: dict,
) -> tuple[
    dict[str, type[BaseModel]] | None,
    dict[str, type[BaseModel]] | None,
    dict[tuple[str, str], list[str]] | None,
    list[str] | None,
]:
    """Build ontology from config. Returns (entity_types, edge_types, edge_type_map, excluded)."""
    raw = cfg.get("ontology")
    if not raw:
        return None, None, None, None

    entity_defs = raw.get("entities") or {}
    edge_defs = raw.get("edges") or {}
    edge_map_raw = raw.get("edgemap") or {}
    excluded_raw = raw.get("excludedEntityTypes")

    entity_types = _build_type_defs(entity_defs) if entity_defs else None
    edge_types = _build_type_defs(edge_defs) if edge_defs else None

    edge_type_map: dict[tuple[str, str], list[str]] | None = None
    if edge_map_raw:
        edge_type_map = {}
        for key, values in edge_map_raw.items():
            parts = key.split(",")
            edge_type_map[(parts[0], parts[1])] = values

    excluded = list(excluded_raw) if excluded_raw else None

    if not entity_types and not edge_types and not edge_type_map and not excluded:
        return None, None, None, None

    return entity_types, edge_types, edge_type_map, excluded


def x__build_ontology__mutmut_21(
    cfg: dict,
) -> tuple[
    dict[str, type[BaseModel]] | None,
    dict[str, type[BaseModel]] | None,
    dict[tuple[str, str], list[str]] | None,
    list[str] | None,
]:
    """Build ontology from config. Returns (entity_types, edge_types, edge_type_map, excluded)."""
    raw = cfg.get("ontology")
    if not raw:
        return None, None, None, None

    entity_defs = raw.get("entities") or {}
    edge_defs = raw.get("edges") or {}
    edge_map_raw = raw.get("EDGEMAP") or {}
    excluded_raw = raw.get("excludedEntityTypes")

    entity_types = _build_type_defs(entity_defs) if entity_defs else None
    edge_types = _build_type_defs(edge_defs) if edge_defs else None

    edge_type_map: dict[tuple[str, str], list[str]] | None = None
    if edge_map_raw:
        edge_type_map = {}
        for key, values in edge_map_raw.items():
            parts = key.split(",")
            edge_type_map[(parts[0], parts[1])] = values

    excluded = list(excluded_raw) if excluded_raw else None

    if not entity_types and not edge_types and not edge_type_map and not excluded:
        return None, None, None, None

    return entity_types, edge_types, edge_type_map, excluded


def x__build_ontology__mutmut_22(
    cfg: dict,
) -> tuple[
    dict[str, type[BaseModel]] | None,
    dict[str, type[BaseModel]] | None,
    dict[tuple[str, str], list[str]] | None,
    list[str] | None,
]:
    """Build ontology from config. Returns (entity_types, edge_types, edge_type_map, excluded)."""
    raw = cfg.get("ontology")
    if not raw:
        return None, None, None, None

    entity_defs = raw.get("entities") or {}
    edge_defs = raw.get("edges") or {}
    edge_map_raw = raw.get("edgeMap") or {}
    excluded_raw = None

    entity_types = _build_type_defs(entity_defs) if entity_defs else None
    edge_types = _build_type_defs(edge_defs) if edge_defs else None

    edge_type_map: dict[tuple[str, str], list[str]] | None = None
    if edge_map_raw:
        edge_type_map = {}
        for key, values in edge_map_raw.items():
            parts = key.split(",")
            edge_type_map[(parts[0], parts[1])] = values

    excluded = list(excluded_raw) if excluded_raw else None

    if not entity_types and not edge_types and not edge_type_map and not excluded:
        return None, None, None, None

    return entity_types, edge_types, edge_type_map, excluded


def x__build_ontology__mutmut_23(
    cfg: dict,
) -> tuple[
    dict[str, type[BaseModel]] | None,
    dict[str, type[BaseModel]] | None,
    dict[tuple[str, str], list[str]] | None,
    list[str] | None,
]:
    """Build ontology from config. Returns (entity_types, edge_types, edge_type_map, excluded)."""
    raw = cfg.get("ontology")
    if not raw:
        return None, None, None, None

    entity_defs = raw.get("entities") or {}
    edge_defs = raw.get("edges") or {}
    edge_map_raw = raw.get("edgeMap") or {}
    excluded_raw = raw.get(None)

    entity_types = _build_type_defs(entity_defs) if entity_defs else None
    edge_types = _build_type_defs(edge_defs) if edge_defs else None

    edge_type_map: dict[tuple[str, str], list[str]] | None = None
    if edge_map_raw:
        edge_type_map = {}
        for key, values in edge_map_raw.items():
            parts = key.split(",")
            edge_type_map[(parts[0], parts[1])] = values

    excluded = list(excluded_raw) if excluded_raw else None

    if not entity_types and not edge_types and not edge_type_map and not excluded:
        return None, None, None, None

    return entity_types, edge_types, edge_type_map, excluded


def x__build_ontology__mutmut_24(
    cfg: dict,
) -> tuple[
    dict[str, type[BaseModel]] | None,
    dict[str, type[BaseModel]] | None,
    dict[tuple[str, str], list[str]] | None,
    list[str] | None,
]:
    """Build ontology from config. Returns (entity_types, edge_types, edge_type_map, excluded)."""
    raw = cfg.get("ontology")
    if not raw:
        return None, None, None, None

    entity_defs = raw.get("entities") or {}
    edge_defs = raw.get("edges") or {}
    edge_map_raw = raw.get("edgeMap") or {}
    excluded_raw = raw.get("XXexcludedEntityTypesXX")

    entity_types = _build_type_defs(entity_defs) if entity_defs else None
    edge_types = _build_type_defs(edge_defs) if edge_defs else None

    edge_type_map: dict[tuple[str, str], list[str]] | None = None
    if edge_map_raw:
        edge_type_map = {}
        for key, values in edge_map_raw.items():
            parts = key.split(",")
            edge_type_map[(parts[0], parts[1])] = values

    excluded = list(excluded_raw) if excluded_raw else None

    if not entity_types and not edge_types and not edge_type_map and not excluded:
        return None, None, None, None

    return entity_types, edge_types, edge_type_map, excluded


def x__build_ontology__mutmut_25(
    cfg: dict,
) -> tuple[
    dict[str, type[BaseModel]] | None,
    dict[str, type[BaseModel]] | None,
    dict[tuple[str, str], list[str]] | None,
    list[str] | None,
]:
    """Build ontology from config. Returns (entity_types, edge_types, edge_type_map, excluded)."""
    raw = cfg.get("ontology")
    if not raw:
        return None, None, None, None

    entity_defs = raw.get("entities") or {}
    edge_defs = raw.get("edges") or {}
    edge_map_raw = raw.get("edgeMap") or {}
    excluded_raw = raw.get("excludedentitytypes")

    entity_types = _build_type_defs(entity_defs) if entity_defs else None
    edge_types = _build_type_defs(edge_defs) if edge_defs else None

    edge_type_map: dict[tuple[str, str], list[str]] | None = None
    if edge_map_raw:
        edge_type_map = {}
        for key, values in edge_map_raw.items():
            parts = key.split(",")
            edge_type_map[(parts[0], parts[1])] = values

    excluded = list(excluded_raw) if excluded_raw else None

    if not entity_types and not edge_types and not edge_type_map and not excluded:
        return None, None, None, None

    return entity_types, edge_types, edge_type_map, excluded


def x__build_ontology__mutmut_26(
    cfg: dict,
) -> tuple[
    dict[str, type[BaseModel]] | None,
    dict[str, type[BaseModel]] | None,
    dict[tuple[str, str], list[str]] | None,
    list[str] | None,
]:
    """Build ontology from config. Returns (entity_types, edge_types, edge_type_map, excluded)."""
    raw = cfg.get("ontology")
    if not raw:
        return None, None, None, None

    entity_defs = raw.get("entities") or {}
    edge_defs = raw.get("edges") or {}
    edge_map_raw = raw.get("edgeMap") or {}
    excluded_raw = raw.get("EXCLUDEDENTITYTYPES")

    entity_types = _build_type_defs(entity_defs) if entity_defs else None
    edge_types = _build_type_defs(edge_defs) if edge_defs else None

    edge_type_map: dict[tuple[str, str], list[str]] | None = None
    if edge_map_raw:
        edge_type_map = {}
        for key, values in edge_map_raw.items():
            parts = key.split(",")
            edge_type_map[(parts[0], parts[1])] = values

    excluded = list(excluded_raw) if excluded_raw else None

    if not entity_types and not edge_types and not edge_type_map and not excluded:
        return None, None, None, None

    return entity_types, edge_types, edge_type_map, excluded


def x__build_ontology__mutmut_27(
    cfg: dict,
) -> tuple[
    dict[str, type[BaseModel]] | None,
    dict[str, type[BaseModel]] | None,
    dict[tuple[str, str], list[str]] | None,
    list[str] | None,
]:
    """Build ontology from config. Returns (entity_types, edge_types, edge_type_map, excluded)."""
    raw = cfg.get("ontology")
    if not raw:
        return None, None, None, None

    entity_defs = raw.get("entities") or {}
    edge_defs = raw.get("edges") or {}
    edge_map_raw = raw.get("edgeMap") or {}
    excluded_raw = raw.get("excludedEntityTypes")

    entity_types = None
    edge_types = _build_type_defs(edge_defs) if edge_defs else None

    edge_type_map: dict[tuple[str, str], list[str]] | None = None
    if edge_map_raw:
        edge_type_map = {}
        for key, values in edge_map_raw.items():
            parts = key.split(",")
            edge_type_map[(parts[0], parts[1])] = values

    excluded = list(excluded_raw) if excluded_raw else None

    if not entity_types and not edge_types and not edge_type_map and not excluded:
        return None, None, None, None

    return entity_types, edge_types, edge_type_map, excluded


def x__build_ontology__mutmut_28(
    cfg: dict,
) -> tuple[
    dict[str, type[BaseModel]] | None,
    dict[str, type[BaseModel]] | None,
    dict[tuple[str, str], list[str]] | None,
    list[str] | None,
]:
    """Build ontology from config. Returns (entity_types, edge_types, edge_type_map, excluded)."""
    raw = cfg.get("ontology")
    if not raw:
        return None, None, None, None

    entity_defs = raw.get("entities") or {}
    edge_defs = raw.get("edges") or {}
    edge_map_raw = raw.get("edgeMap") or {}
    excluded_raw = raw.get("excludedEntityTypes")

    entity_types = _build_type_defs(None) if entity_defs else None
    edge_types = _build_type_defs(edge_defs) if edge_defs else None

    edge_type_map: dict[tuple[str, str], list[str]] | None = None
    if edge_map_raw:
        edge_type_map = {}
        for key, values in edge_map_raw.items():
            parts = key.split(",")
            edge_type_map[(parts[0], parts[1])] = values

    excluded = list(excluded_raw) if excluded_raw else None

    if not entity_types and not edge_types and not edge_type_map and not excluded:
        return None, None, None, None

    return entity_types, edge_types, edge_type_map, excluded


def x__build_ontology__mutmut_29(
    cfg: dict,
) -> tuple[
    dict[str, type[BaseModel]] | None,
    dict[str, type[BaseModel]] | None,
    dict[tuple[str, str], list[str]] | None,
    list[str] | None,
]:
    """Build ontology from config. Returns (entity_types, edge_types, edge_type_map, excluded)."""
    raw = cfg.get("ontology")
    if not raw:
        return None, None, None, None

    entity_defs = raw.get("entities") or {}
    edge_defs = raw.get("edges") or {}
    edge_map_raw = raw.get("edgeMap") or {}
    excluded_raw = raw.get("excludedEntityTypes")

    entity_types = _build_type_defs(entity_defs) if entity_defs else None
    edge_types = None

    edge_type_map: dict[tuple[str, str], list[str]] | None = None
    if edge_map_raw:
        edge_type_map = {}
        for key, values in edge_map_raw.items():
            parts = key.split(",")
            edge_type_map[(parts[0], parts[1])] = values

    excluded = list(excluded_raw) if excluded_raw else None

    if not entity_types and not edge_types and not edge_type_map and not excluded:
        return None, None, None, None

    return entity_types, edge_types, edge_type_map, excluded


def x__build_ontology__mutmut_30(
    cfg: dict,
) -> tuple[
    dict[str, type[BaseModel]] | None,
    dict[str, type[BaseModel]] | None,
    dict[tuple[str, str], list[str]] | None,
    list[str] | None,
]:
    """Build ontology from config. Returns (entity_types, edge_types, edge_type_map, excluded)."""
    raw = cfg.get("ontology")
    if not raw:
        return None, None, None, None

    entity_defs = raw.get("entities") or {}
    edge_defs = raw.get("edges") or {}
    edge_map_raw = raw.get("edgeMap") or {}
    excluded_raw = raw.get("excludedEntityTypes")

    entity_types = _build_type_defs(entity_defs) if entity_defs else None
    edge_types = _build_type_defs(None) if edge_defs else None

    edge_type_map: dict[tuple[str, str], list[str]] | None = None
    if edge_map_raw:
        edge_type_map = {}
        for key, values in edge_map_raw.items():
            parts = key.split(",")
            edge_type_map[(parts[0], parts[1])] = values

    excluded = list(excluded_raw) if excluded_raw else None

    if not entity_types and not edge_types and not edge_type_map and not excluded:
        return None, None, None, None

    return entity_types, edge_types, edge_type_map, excluded


def x__build_ontology__mutmut_31(
    cfg: dict,
) -> tuple[
    dict[str, type[BaseModel]] | None,
    dict[str, type[BaseModel]] | None,
    dict[tuple[str, str], list[str]] | None,
    list[str] | None,
]:
    """Build ontology from config. Returns (entity_types, edge_types, edge_type_map, excluded)."""
    raw = cfg.get("ontology")
    if not raw:
        return None, None, None, None

    entity_defs = raw.get("entities") or {}
    edge_defs = raw.get("edges") or {}
    edge_map_raw = raw.get("edgeMap") or {}
    excluded_raw = raw.get("excludedEntityTypes")

    entity_types = _build_type_defs(entity_defs) if entity_defs else None
    edge_types = _build_type_defs(edge_defs) if edge_defs else None

    edge_type_map: dict[tuple[str, str], list[str]] | None = ""
    if edge_map_raw:
        edge_type_map = {}
        for key, values in edge_map_raw.items():
            parts = key.split(",")
            edge_type_map[(parts[0], parts[1])] = values

    excluded = list(excluded_raw) if excluded_raw else None

    if not entity_types and not edge_types and not edge_type_map and not excluded:
        return None, None, None, None

    return entity_types, edge_types, edge_type_map, excluded


def x__build_ontology__mutmut_32(
    cfg: dict,
) -> tuple[
    dict[str, type[BaseModel]] | None,
    dict[str, type[BaseModel]] | None,
    dict[tuple[str, str], list[str]] | None,
    list[str] | None,
]:
    """Build ontology from config. Returns (entity_types, edge_types, edge_type_map, excluded)."""
    raw = cfg.get("ontology")
    if not raw:
        return None, None, None, None

    entity_defs = raw.get("entities") or {}
    edge_defs = raw.get("edges") or {}
    edge_map_raw = raw.get("edgeMap") or {}
    excluded_raw = raw.get("excludedEntityTypes")

    entity_types = _build_type_defs(entity_defs) if entity_defs else None
    edge_types = _build_type_defs(edge_defs) if edge_defs else None

    edge_type_map: dict[tuple[str, str], list[str]] | None = None
    if edge_map_raw:
        edge_type_map = None
        for key, values in edge_map_raw.items():
            parts = key.split(",")
            edge_type_map[(parts[0], parts[1])] = values

    excluded = list(excluded_raw) if excluded_raw else None

    if not entity_types and not edge_types and not edge_type_map and not excluded:
        return None, None, None, None

    return entity_types, edge_types, edge_type_map, excluded


def x__build_ontology__mutmut_33(
    cfg: dict,
) -> tuple[
    dict[str, type[BaseModel]] | None,
    dict[str, type[BaseModel]] | None,
    dict[tuple[str, str], list[str]] | None,
    list[str] | None,
]:
    """Build ontology from config. Returns (entity_types, edge_types, edge_type_map, excluded)."""
    raw = cfg.get("ontology")
    if not raw:
        return None, None, None, None

    entity_defs = raw.get("entities") or {}
    edge_defs = raw.get("edges") or {}
    edge_map_raw = raw.get("edgeMap") or {}
    excluded_raw = raw.get("excludedEntityTypes")

    entity_types = _build_type_defs(entity_defs) if entity_defs else None
    edge_types = _build_type_defs(edge_defs) if edge_defs else None

    edge_type_map: dict[tuple[str, str], list[str]] | None = None
    if edge_map_raw:
        edge_type_map = {}
        for key, values in edge_map_raw.items():
            parts = None
            edge_type_map[(parts[0], parts[1])] = values

    excluded = list(excluded_raw) if excluded_raw else None

    if not entity_types and not edge_types and not edge_type_map and not excluded:
        return None, None, None, None

    return entity_types, edge_types, edge_type_map, excluded


def x__build_ontology__mutmut_34(
    cfg: dict,
) -> tuple[
    dict[str, type[BaseModel]] | None,
    dict[str, type[BaseModel]] | None,
    dict[tuple[str, str], list[str]] | None,
    list[str] | None,
]:
    """Build ontology from config. Returns (entity_types, edge_types, edge_type_map, excluded)."""
    raw = cfg.get("ontology")
    if not raw:
        return None, None, None, None

    entity_defs = raw.get("entities") or {}
    edge_defs = raw.get("edges") or {}
    edge_map_raw = raw.get("edgeMap") or {}
    excluded_raw = raw.get("excludedEntityTypes")

    entity_types = _build_type_defs(entity_defs) if entity_defs else None
    edge_types = _build_type_defs(edge_defs) if edge_defs else None

    edge_type_map: dict[tuple[str, str], list[str]] | None = None
    if edge_map_raw:
        edge_type_map = {}
        for key, values in edge_map_raw.items():
            parts = key.split(None)
            edge_type_map[(parts[0], parts[1])] = values

    excluded = list(excluded_raw) if excluded_raw else None

    if not entity_types and not edge_types and not edge_type_map and not excluded:
        return None, None, None, None

    return entity_types, edge_types, edge_type_map, excluded


def x__build_ontology__mutmut_35(
    cfg: dict,
) -> tuple[
    dict[str, type[BaseModel]] | None,
    dict[str, type[BaseModel]] | None,
    dict[tuple[str, str], list[str]] | None,
    list[str] | None,
]:
    """Build ontology from config. Returns (entity_types, edge_types, edge_type_map, excluded)."""
    raw = cfg.get("ontology")
    if not raw:
        return None, None, None, None

    entity_defs = raw.get("entities") or {}
    edge_defs = raw.get("edges") or {}
    edge_map_raw = raw.get("edgeMap") or {}
    excluded_raw = raw.get("excludedEntityTypes")

    entity_types = _build_type_defs(entity_defs) if entity_defs else None
    edge_types = _build_type_defs(edge_defs) if edge_defs else None

    edge_type_map: dict[tuple[str, str], list[str]] | None = None
    if edge_map_raw:
        edge_type_map = {}
        for key, values in edge_map_raw.items():
            parts = key.split("XX,XX")
            edge_type_map[(parts[0], parts[1])] = values

    excluded = list(excluded_raw) if excluded_raw else None

    if not entity_types and not edge_types and not edge_type_map and not excluded:
        return None, None, None, None

    return entity_types, edge_types, edge_type_map, excluded


def x__build_ontology__mutmut_36(
    cfg: dict,
) -> tuple[
    dict[str, type[BaseModel]] | None,
    dict[str, type[BaseModel]] | None,
    dict[tuple[str, str], list[str]] | None,
    list[str] | None,
]:
    """Build ontology from config. Returns (entity_types, edge_types, edge_type_map, excluded)."""
    raw = cfg.get("ontology")
    if not raw:
        return None, None, None, None

    entity_defs = raw.get("entities") or {}
    edge_defs = raw.get("edges") or {}
    edge_map_raw = raw.get("edgeMap") or {}
    excluded_raw = raw.get("excludedEntityTypes")

    entity_types = _build_type_defs(entity_defs) if entity_defs else None
    edge_types = _build_type_defs(edge_defs) if edge_defs else None

    edge_type_map: dict[tuple[str, str], list[str]] | None = None
    if edge_map_raw:
        edge_type_map = {}
        for key, values in edge_map_raw.items():
            parts = key.split(",")
            edge_type_map[(parts[0], parts[1])] = None

    excluded = list(excluded_raw) if excluded_raw else None

    if not entity_types and not edge_types and not edge_type_map and not excluded:
        return None, None, None, None

    return entity_types, edge_types, edge_type_map, excluded


def x__build_ontology__mutmut_37(
    cfg: dict,
) -> tuple[
    dict[str, type[BaseModel]] | None,
    dict[str, type[BaseModel]] | None,
    dict[tuple[str, str], list[str]] | None,
    list[str] | None,
]:
    """Build ontology from config. Returns (entity_types, edge_types, edge_type_map, excluded)."""
    raw = cfg.get("ontology")
    if not raw:
        return None, None, None, None

    entity_defs = raw.get("entities") or {}
    edge_defs = raw.get("edges") or {}
    edge_map_raw = raw.get("edgeMap") or {}
    excluded_raw = raw.get("excludedEntityTypes")

    entity_types = _build_type_defs(entity_defs) if entity_defs else None
    edge_types = _build_type_defs(edge_defs) if edge_defs else None

    edge_type_map: dict[tuple[str, str], list[str]] | None = None
    if edge_map_raw:
        edge_type_map = {}
        for key, values in edge_map_raw.items():
            parts = key.split(",")
            edge_type_map[(parts[1], parts[1])] = values

    excluded = list(excluded_raw) if excluded_raw else None

    if not entity_types and not edge_types and not edge_type_map and not excluded:
        return None, None, None, None

    return entity_types, edge_types, edge_type_map, excluded


def x__build_ontology__mutmut_38(
    cfg: dict,
) -> tuple[
    dict[str, type[BaseModel]] | None,
    dict[str, type[BaseModel]] | None,
    dict[tuple[str, str], list[str]] | None,
    list[str] | None,
]:
    """Build ontology from config. Returns (entity_types, edge_types, edge_type_map, excluded)."""
    raw = cfg.get("ontology")
    if not raw:
        return None, None, None, None

    entity_defs = raw.get("entities") or {}
    edge_defs = raw.get("edges") or {}
    edge_map_raw = raw.get("edgeMap") or {}
    excluded_raw = raw.get("excludedEntityTypes")

    entity_types = _build_type_defs(entity_defs) if entity_defs else None
    edge_types = _build_type_defs(edge_defs) if edge_defs else None

    edge_type_map: dict[tuple[str, str], list[str]] | None = None
    if edge_map_raw:
        edge_type_map = {}
        for key, values in edge_map_raw.items():
            parts = key.split(",")
            edge_type_map[(parts[0], parts[2])] = values

    excluded = list(excluded_raw) if excluded_raw else None

    if not entity_types and not edge_types and not edge_type_map and not excluded:
        return None, None, None, None

    return entity_types, edge_types, edge_type_map, excluded


def x__build_ontology__mutmut_39(
    cfg: dict,
) -> tuple[
    dict[str, type[BaseModel]] | None,
    dict[str, type[BaseModel]] | None,
    dict[tuple[str, str], list[str]] | None,
    list[str] | None,
]:
    """Build ontology from config. Returns (entity_types, edge_types, edge_type_map, excluded)."""
    raw = cfg.get("ontology")
    if not raw:
        return None, None, None, None

    entity_defs = raw.get("entities") or {}
    edge_defs = raw.get("edges") or {}
    edge_map_raw = raw.get("edgeMap") or {}
    excluded_raw = raw.get("excludedEntityTypes")

    entity_types = _build_type_defs(entity_defs) if entity_defs else None
    edge_types = _build_type_defs(edge_defs) if edge_defs else None

    edge_type_map: dict[tuple[str, str], list[str]] | None = None
    if edge_map_raw:
        edge_type_map = {}
        for key, values in edge_map_raw.items():
            parts = key.split(",")
            edge_type_map[(parts[0], parts[1])] = values

    excluded = None

    if not entity_types and not edge_types and not edge_type_map and not excluded:
        return None, None, None, None

    return entity_types, edge_types, edge_type_map, excluded


def x__build_ontology__mutmut_40(
    cfg: dict,
) -> tuple[
    dict[str, type[BaseModel]] | None,
    dict[str, type[BaseModel]] | None,
    dict[tuple[str, str], list[str]] | None,
    list[str] | None,
]:
    """Build ontology from config. Returns (entity_types, edge_types, edge_type_map, excluded)."""
    raw = cfg.get("ontology")
    if not raw:
        return None, None, None, None

    entity_defs = raw.get("entities") or {}
    edge_defs = raw.get("edges") or {}
    edge_map_raw = raw.get("edgeMap") or {}
    excluded_raw = raw.get("excludedEntityTypes")

    entity_types = _build_type_defs(entity_defs) if entity_defs else None
    edge_types = _build_type_defs(edge_defs) if edge_defs else None

    edge_type_map: dict[tuple[str, str], list[str]] | None = None
    if edge_map_raw:
        edge_type_map = {}
        for key, values in edge_map_raw.items():
            parts = key.split(",")
            edge_type_map[(parts[0], parts[1])] = values

    excluded = list(None) if excluded_raw else None

    if not entity_types and not edge_types and not edge_type_map and not excluded:
        return None, None, None, None

    return entity_types, edge_types, edge_type_map, excluded


def x__build_ontology__mutmut_41(
    cfg: dict,
) -> tuple[
    dict[str, type[BaseModel]] | None,
    dict[str, type[BaseModel]] | None,
    dict[tuple[str, str], list[str]] | None,
    list[str] | None,
]:
    """Build ontology from config. Returns (entity_types, edge_types, edge_type_map, excluded)."""
    raw = cfg.get("ontology")
    if not raw:
        return None, None, None, None

    entity_defs = raw.get("entities") or {}
    edge_defs = raw.get("edges") or {}
    edge_map_raw = raw.get("edgeMap") or {}
    excluded_raw = raw.get("excludedEntityTypes")

    entity_types = _build_type_defs(entity_defs) if entity_defs else None
    edge_types = _build_type_defs(edge_defs) if edge_defs else None

    edge_type_map: dict[tuple[str, str], list[str]] | None = None
    if edge_map_raw:
        edge_type_map = {}
        for key, values in edge_map_raw.items():
            parts = key.split(",")
            edge_type_map[(parts[0], parts[1])] = values

    excluded = list(excluded_raw) if excluded_raw else None

    if not entity_types and not edge_types and not edge_type_map or not excluded:
        return None, None, None, None

    return entity_types, edge_types, edge_type_map, excluded


def x__build_ontology__mutmut_42(
    cfg: dict,
) -> tuple[
    dict[str, type[BaseModel]] | None,
    dict[str, type[BaseModel]] | None,
    dict[tuple[str, str], list[str]] | None,
    list[str] | None,
]:
    """Build ontology from config. Returns (entity_types, edge_types, edge_type_map, excluded)."""
    raw = cfg.get("ontology")
    if not raw:
        return None, None, None, None

    entity_defs = raw.get("entities") or {}
    edge_defs = raw.get("edges") or {}
    edge_map_raw = raw.get("edgeMap") or {}
    excluded_raw = raw.get("excludedEntityTypes")

    entity_types = _build_type_defs(entity_defs) if entity_defs else None
    edge_types = _build_type_defs(edge_defs) if edge_defs else None

    edge_type_map: dict[tuple[str, str], list[str]] | None = None
    if edge_map_raw:
        edge_type_map = {}
        for key, values in edge_map_raw.items():
            parts = key.split(",")
            edge_type_map[(parts[0], parts[1])] = values

    excluded = list(excluded_raw) if excluded_raw else None

    if not entity_types and not edge_types or not edge_type_map and not excluded:
        return None, None, None, None

    return entity_types, edge_types, edge_type_map, excluded


def x__build_ontology__mutmut_43(
    cfg: dict,
) -> tuple[
    dict[str, type[BaseModel]] | None,
    dict[str, type[BaseModel]] | None,
    dict[tuple[str, str], list[str]] | None,
    list[str] | None,
]:
    """Build ontology from config. Returns (entity_types, edge_types, edge_type_map, excluded)."""
    raw = cfg.get("ontology")
    if not raw:
        return None, None, None, None

    entity_defs = raw.get("entities") or {}
    edge_defs = raw.get("edges") or {}
    edge_map_raw = raw.get("edgeMap") or {}
    excluded_raw = raw.get("excludedEntityTypes")

    entity_types = _build_type_defs(entity_defs) if entity_defs else None
    edge_types = _build_type_defs(edge_defs) if edge_defs else None

    edge_type_map: dict[tuple[str, str], list[str]] | None = None
    if edge_map_raw:
        edge_type_map = {}
        for key, values in edge_map_raw.items():
            parts = key.split(",")
            edge_type_map[(parts[0], parts[1])] = values

    excluded = list(excluded_raw) if excluded_raw else None

    if not entity_types or not edge_types and not edge_type_map and not excluded:
        return None, None, None, None

    return entity_types, edge_types, edge_type_map, excluded


def x__build_ontology__mutmut_44(
    cfg: dict,
) -> tuple[
    dict[str, type[BaseModel]] | None,
    dict[str, type[BaseModel]] | None,
    dict[tuple[str, str], list[str]] | None,
    list[str] | None,
]:
    """Build ontology from config. Returns (entity_types, edge_types, edge_type_map, excluded)."""
    raw = cfg.get("ontology")
    if not raw:
        return None, None, None, None

    entity_defs = raw.get("entities") or {}
    edge_defs = raw.get("edges") or {}
    edge_map_raw = raw.get("edgeMap") or {}
    excluded_raw = raw.get("excludedEntityTypes")

    entity_types = _build_type_defs(entity_defs) if entity_defs else None
    edge_types = _build_type_defs(edge_defs) if edge_defs else None

    edge_type_map: dict[tuple[str, str], list[str]] | None = None
    if edge_map_raw:
        edge_type_map = {}
        for key, values in edge_map_raw.items():
            parts = key.split(",")
            edge_type_map[(parts[0], parts[1])] = values

    excluded = list(excluded_raw) if excluded_raw else None

    if entity_types and not edge_types and not edge_type_map and not excluded:
        return None, None, None, None

    return entity_types, edge_types, edge_type_map, excluded


def x__build_ontology__mutmut_45(
    cfg: dict,
) -> tuple[
    dict[str, type[BaseModel]] | None,
    dict[str, type[BaseModel]] | None,
    dict[tuple[str, str], list[str]] | None,
    list[str] | None,
]:
    """Build ontology from config. Returns (entity_types, edge_types, edge_type_map, excluded)."""
    raw = cfg.get("ontology")
    if not raw:
        return None, None, None, None

    entity_defs = raw.get("entities") or {}
    edge_defs = raw.get("edges") or {}
    edge_map_raw = raw.get("edgeMap") or {}
    excluded_raw = raw.get("excludedEntityTypes")

    entity_types = _build_type_defs(entity_defs) if entity_defs else None
    edge_types = _build_type_defs(edge_defs) if edge_defs else None

    edge_type_map: dict[tuple[str, str], list[str]] | None = None
    if edge_map_raw:
        edge_type_map = {}
        for key, values in edge_map_raw.items():
            parts = key.split(",")
            edge_type_map[(parts[0], parts[1])] = values

    excluded = list(excluded_raw) if excluded_raw else None

    if not entity_types and edge_types and not edge_type_map and not excluded:
        return None, None, None, None

    return entity_types, edge_types, edge_type_map, excluded


def x__build_ontology__mutmut_46(
    cfg: dict,
) -> tuple[
    dict[str, type[BaseModel]] | None,
    dict[str, type[BaseModel]] | None,
    dict[tuple[str, str], list[str]] | None,
    list[str] | None,
]:
    """Build ontology from config. Returns (entity_types, edge_types, edge_type_map, excluded)."""
    raw = cfg.get("ontology")
    if not raw:
        return None, None, None, None

    entity_defs = raw.get("entities") or {}
    edge_defs = raw.get("edges") or {}
    edge_map_raw = raw.get("edgeMap") or {}
    excluded_raw = raw.get("excludedEntityTypes")

    entity_types = _build_type_defs(entity_defs) if entity_defs else None
    edge_types = _build_type_defs(edge_defs) if edge_defs else None

    edge_type_map: dict[tuple[str, str], list[str]] | None = None
    if edge_map_raw:
        edge_type_map = {}
        for key, values in edge_map_raw.items():
            parts = key.split(",")
            edge_type_map[(parts[0], parts[1])] = values

    excluded = list(excluded_raw) if excluded_raw else None

    if not entity_types and not edge_types and edge_type_map and not excluded:
        return None, None, None, None

    return entity_types, edge_types, edge_type_map, excluded


def x__build_ontology__mutmut_47(
    cfg: dict,
) -> tuple[
    dict[str, type[BaseModel]] | None,
    dict[str, type[BaseModel]] | None,
    dict[tuple[str, str], list[str]] | None,
    list[str] | None,
]:
    """Build ontology from config. Returns (entity_types, edge_types, edge_type_map, excluded)."""
    raw = cfg.get("ontology")
    if not raw:
        return None, None, None, None

    entity_defs = raw.get("entities") or {}
    edge_defs = raw.get("edges") or {}
    edge_map_raw = raw.get("edgeMap") or {}
    excluded_raw = raw.get("excludedEntityTypes")

    entity_types = _build_type_defs(entity_defs) if entity_defs else None
    edge_types = _build_type_defs(edge_defs) if edge_defs else None

    edge_type_map: dict[tuple[str, str], list[str]] | None = None
    if edge_map_raw:
        edge_type_map = {}
        for key, values in edge_map_raw.items():
            parts = key.split(",")
            edge_type_map[(parts[0], parts[1])] = values

    excluded = list(excluded_raw) if excluded_raw else None

    if not entity_types and not edge_types and not edge_type_map and excluded:
        return None, None, None, None

    return entity_types, edge_types, edge_type_map, excluded

x__build_ontology__mutmut_mutants : ClassVar[MutantDict] = { # type: ignore
'x__build_ontology__mutmut_1': x__build_ontology__mutmut_1, 
    'x__build_ontology__mutmut_2': x__build_ontology__mutmut_2, 
    'x__build_ontology__mutmut_3': x__build_ontology__mutmut_3, 
    'x__build_ontology__mutmut_4': x__build_ontology__mutmut_4, 
    'x__build_ontology__mutmut_5': x__build_ontology__mutmut_5, 
    'x__build_ontology__mutmut_6': x__build_ontology__mutmut_6, 
    'x__build_ontology__mutmut_7': x__build_ontology__mutmut_7, 
    'x__build_ontology__mutmut_8': x__build_ontology__mutmut_8, 
    'x__build_ontology__mutmut_9': x__build_ontology__mutmut_9, 
    'x__build_ontology__mutmut_10': x__build_ontology__mutmut_10, 
    'x__build_ontology__mutmut_11': x__build_ontology__mutmut_11, 
    'x__build_ontology__mutmut_12': x__build_ontology__mutmut_12, 
    'x__build_ontology__mutmut_13': x__build_ontology__mutmut_13, 
    'x__build_ontology__mutmut_14': x__build_ontology__mutmut_14, 
    'x__build_ontology__mutmut_15': x__build_ontology__mutmut_15, 
    'x__build_ontology__mutmut_16': x__build_ontology__mutmut_16, 
    'x__build_ontology__mutmut_17': x__build_ontology__mutmut_17, 
    'x__build_ontology__mutmut_18': x__build_ontology__mutmut_18, 
    'x__build_ontology__mutmut_19': x__build_ontology__mutmut_19, 
    'x__build_ontology__mutmut_20': x__build_ontology__mutmut_20, 
    'x__build_ontology__mutmut_21': x__build_ontology__mutmut_21, 
    'x__build_ontology__mutmut_22': x__build_ontology__mutmut_22, 
    'x__build_ontology__mutmut_23': x__build_ontology__mutmut_23, 
    'x__build_ontology__mutmut_24': x__build_ontology__mutmut_24, 
    'x__build_ontology__mutmut_25': x__build_ontology__mutmut_25, 
    'x__build_ontology__mutmut_26': x__build_ontology__mutmut_26, 
    'x__build_ontology__mutmut_27': x__build_ontology__mutmut_27, 
    'x__build_ontology__mutmut_28': x__build_ontology__mutmut_28, 
    'x__build_ontology__mutmut_29': x__build_ontology__mutmut_29, 
    'x__build_ontology__mutmut_30': x__build_ontology__mutmut_30, 
    'x__build_ontology__mutmut_31': x__build_ontology__mutmut_31, 
    'x__build_ontology__mutmut_32': x__build_ontology__mutmut_32, 
    'x__build_ontology__mutmut_33': x__build_ontology__mutmut_33, 
    'x__build_ontology__mutmut_34': x__build_ontology__mutmut_34, 
    'x__build_ontology__mutmut_35': x__build_ontology__mutmut_35, 
    'x__build_ontology__mutmut_36': x__build_ontology__mutmut_36, 
    'x__build_ontology__mutmut_37': x__build_ontology__mutmut_37, 
    'x__build_ontology__mutmut_38': x__build_ontology__mutmut_38, 
    'x__build_ontology__mutmut_39': x__build_ontology__mutmut_39, 
    'x__build_ontology__mutmut_40': x__build_ontology__mutmut_40, 
    'x__build_ontology__mutmut_41': x__build_ontology__mutmut_41, 
    'x__build_ontology__mutmut_42': x__build_ontology__mutmut_42, 
    'x__build_ontology__mutmut_43': x__build_ontology__mutmut_43, 
    'x__build_ontology__mutmut_44': x__build_ontology__mutmut_44, 
    'x__build_ontology__mutmut_45': x__build_ontology__mutmut_45, 
    'x__build_ontology__mutmut_46': x__build_ontology__mutmut_46, 
    'x__build_ontology__mutmut_47': x__build_ontology__mutmut_47
}
x__build_ontology__mutmut_orig.__name__ = 'x__build_ontology'


def _log_falkordblite_diagnostics(error: Exception) -> None:
    """Log diagnostic info when FalkorDBLite fails to start."""
    import platform
    import subprocess

    print(f"[gralkor] FalkorDBLite startup failed: {error}", flush=True)
    print(f"[gralkor] Platform: {platform.platform()}, arch: {platform.machine()}", flush=True)
    try:
        from redislite import __redis_executable__, __falkordb_module__

        for label, path in [("redis-server", __redis_executable__), ("FalkorDB module", __falkordb_module__)]:
            if not path:
                print(f"[gralkor] {label}: not found", flush=True)
                continue
            print(f"[gralkor] {label}: {path}", flush=True)
            for cmd in [[path, "--version"] if "redis" in label else [], ["file", path], ["ldd", path]]:
                if not cmd:
                    continue
                try:
                    r = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
                    out = r.stdout.strip() or r.stderr.strip()
                    if out:
                        for line in out.split("\n"):
                            print(f"[gralkor]   {line}", flush=True)
                except FileNotFoundError:
                    pass
                except Exception:
                    pass
    except Exception as diag_err:
        print(f"[gralkor] Diagnostic collection failed: {diag_err}", flush=True)


# ── Graphiti singleton ────────────────────────────────────────

graphiti: Graphiti | None = None
ontology_entity_types: dict[str, type[BaseModel]] | None = None
ontology_edge_types: dict[str, type[BaseModel]] | None = None
ontology_edge_type_map: dict[tuple[str, str], list[str]] | None = None
ontology_excluded: list[str] | None = None


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global graphiti, ontology_entity_types, ontology_edge_types, ontology_edge_type_map, ontology_excluded
    cfg = _load_config()

    falkordb_uri = os.getenv("FALKORDB_URI")

    if falkordb_uri:
        # Legacy Docker mode: external FalkorDB via TCP
        stripped = falkordb_uri.split("://", 1)[-1]
        if ":" in stripped:
            host, port_str = stripped.rsplit(":", 1)
            port = int(port_str)
        else:
            host, port = stripped, 6379
        driver = FalkorDriver(host=host, port=port)
    else:
        # Default: embedded FalkorDBLite (no Docker needed)
        logging.getLogger("redislite").setLevel(logging.DEBUG)

        from redislite.async_falkordb_client import AsyncFalkorDB

        data_dir = os.getenv("FALKORDB_DATA_DIR", "./data/falkordb")
        os.makedirs(data_dir, exist_ok=True)
        db_path = os.path.join(data_dir, "gralkor.db")
        try:
            db = AsyncFalkorDB(db_path)
        except Exception as e:
            _log_falkordblite_diagnostics(e)
            raise
        driver = FalkorDriver(falkor_db=db)

    graphiti = Graphiti(
        graph_driver=driver,
        llm_client=_build_llm_client(cfg),
        embedder=_build_embedder(cfg),
    )
    # Only build indices on first boot; skip if they already exist.
    existing = await graphiti.driver.execute_query("CALL db.indexes()")
    if existing and existing[0]:
        print(f"[gralkor] indices already exist ({len(existing[0])} found), skipping build", flush=True)
    else:
        print("[gralkor] building indices and constraints...", flush=True)
        t0_idx = time.monotonic()
        await graphiti.build_indices_and_constraints()
        idx_ms = (time.monotonic() - t0_idx) * 1000
        print(f"[gralkor] indices ready — {idx_ms:.0f}ms", flush=True)

    # Configure logging level: DEBUG in test mode for full data visibility
    log_level = logging.DEBUG if cfg.get("test") else logging.INFO
    logger.setLevel(log_level)
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(message)s"))
        logger.addHandler(handler)

    ontology_entity_types, ontology_edge_types, ontology_edge_type_map, ontology_excluded = _build_ontology(cfg)
    if ontology_entity_types or ontology_edge_types:
        entity_names = list(ontology_entity_types or {})
        edge_names = list(ontology_edge_types or {})
        print(f"[gralkor] ontology: entities={entity_names} edges={edge_names}", flush=True)

    yield
    await graphiti.close()


app = FastAPI(title="Gralkor Graphiti Server", lifespan=lifespan)


# ── Rate-limit passthrough ───────────────────────────────────


def _find_rate_limit_error(exc: Exception) -> Exception | None:
    args = [exc]# type: ignore
    kwargs = {}# type: ignore
    return _mutmut_trampoline(x__find_rate_limit_error__mutmut_orig, x__find_rate_limit_error__mutmut_mutants, args, kwargs, None)


# ── Rate-limit passthrough ───────────────────────────────────


def x__find_rate_limit_error__mutmut_orig(exc: Exception) -> Exception | None:
    """Walk exception chain to find an upstream rate-limit error."""
    current: Exception | None = exc
    seen: set[int] = set()
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        # Match openai.RateLimitError, anthropic.RateLimitError, etc.
        if type(current).__name__ == "RateLimitError" or (
            hasattr(current, "status_code") and getattr(current, "status_code", None) == 429
        ):
            return current
        current = current.__cause__ or current.__context__
    return None


# ── Rate-limit passthrough ───────────────────────────────────


def x__find_rate_limit_error__mutmut_1(exc: Exception) -> Exception | None:
    """Walk exception chain to find an upstream rate-limit error."""
    current: Exception | None = None
    seen: set[int] = set()
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        # Match openai.RateLimitError, anthropic.RateLimitError, etc.
        if type(current).__name__ == "RateLimitError" or (
            hasattr(current, "status_code") and getattr(current, "status_code", None) == 429
        ):
            return current
        current = current.__cause__ or current.__context__
    return None


# ── Rate-limit passthrough ───────────────────────────────────


def x__find_rate_limit_error__mutmut_2(exc: Exception) -> Exception | None:
    """Walk exception chain to find an upstream rate-limit error."""
    current: Exception | None = exc
    seen: set[int] = None
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        # Match openai.RateLimitError, anthropic.RateLimitError, etc.
        if type(current).__name__ == "RateLimitError" or (
            hasattr(current, "status_code") and getattr(current, "status_code", None) == 429
        ):
            return current
        current = current.__cause__ or current.__context__
    return None


# ── Rate-limit passthrough ───────────────────────────────────


def x__find_rate_limit_error__mutmut_3(exc: Exception) -> Exception | None:
    """Walk exception chain to find an upstream rate-limit error."""
    current: Exception | None = exc
    seen: set[int] = set()
    while current is not None or id(current) not in seen:
        seen.add(id(current))
        # Match openai.RateLimitError, anthropic.RateLimitError, etc.
        if type(current).__name__ == "RateLimitError" or (
            hasattr(current, "status_code") and getattr(current, "status_code", None) == 429
        ):
            return current
        current = current.__cause__ or current.__context__
    return None


# ── Rate-limit passthrough ───────────────────────────────────


def x__find_rate_limit_error__mutmut_4(exc: Exception) -> Exception | None:
    """Walk exception chain to find an upstream rate-limit error."""
    current: Exception | None = exc
    seen: set[int] = set()
    while current is None and id(current) not in seen:
        seen.add(id(current))
        # Match openai.RateLimitError, anthropic.RateLimitError, etc.
        if type(current).__name__ == "RateLimitError" or (
            hasattr(current, "status_code") and getattr(current, "status_code", None) == 429
        ):
            return current
        current = current.__cause__ or current.__context__
    return None


# ── Rate-limit passthrough ───────────────────────────────────


def x__find_rate_limit_error__mutmut_5(exc: Exception) -> Exception | None:
    """Walk exception chain to find an upstream rate-limit error."""
    current: Exception | None = exc
    seen: set[int] = set()
    while current is not None and id(None) not in seen:
        seen.add(id(current))
        # Match openai.RateLimitError, anthropic.RateLimitError, etc.
        if type(current).__name__ == "RateLimitError" or (
            hasattr(current, "status_code") and getattr(current, "status_code", None) == 429
        ):
            return current
        current = current.__cause__ or current.__context__
    return None


# ── Rate-limit passthrough ───────────────────────────────────


def x__find_rate_limit_error__mutmut_6(exc: Exception) -> Exception | None:
    """Walk exception chain to find an upstream rate-limit error."""
    current: Exception | None = exc
    seen: set[int] = set()
    while current is not None and id(current) in seen:
        seen.add(id(current))
        # Match openai.RateLimitError, anthropic.RateLimitError, etc.
        if type(current).__name__ == "RateLimitError" or (
            hasattr(current, "status_code") and getattr(current, "status_code", None) == 429
        ):
            return current
        current = current.__cause__ or current.__context__
    return None


# ── Rate-limit passthrough ───────────────────────────────────


def x__find_rate_limit_error__mutmut_7(exc: Exception) -> Exception | None:
    """Walk exception chain to find an upstream rate-limit error."""
    current: Exception | None = exc
    seen: set[int] = set()
    while current is not None and id(current) not in seen:
        seen.add(None)
        # Match openai.RateLimitError, anthropic.RateLimitError, etc.
        if type(current).__name__ == "RateLimitError" or (
            hasattr(current, "status_code") and getattr(current, "status_code", None) == 429
        ):
            return current
        current = current.__cause__ or current.__context__
    return None


# ── Rate-limit passthrough ───────────────────────────────────


def x__find_rate_limit_error__mutmut_8(exc: Exception) -> Exception | None:
    """Walk exception chain to find an upstream rate-limit error."""
    current: Exception | None = exc
    seen: set[int] = set()
    while current is not None and id(current) not in seen:
        seen.add(id(None))
        # Match openai.RateLimitError, anthropic.RateLimitError, etc.
        if type(current).__name__ == "RateLimitError" or (
            hasattr(current, "status_code") and getattr(current, "status_code", None) == 429
        ):
            return current
        current = current.__cause__ or current.__context__
    return None


# ── Rate-limit passthrough ───────────────────────────────────


def x__find_rate_limit_error__mutmut_9(exc: Exception) -> Exception | None:
    """Walk exception chain to find an upstream rate-limit error."""
    current: Exception | None = exc
    seen: set[int] = set()
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        # Match openai.RateLimitError, anthropic.RateLimitError, etc.
        if type(current).__name__ == "RateLimitError" and (
            hasattr(current, "status_code") and getattr(current, "status_code", None) == 429
        ):
            return current
        current = current.__cause__ or current.__context__
    return None


# ── Rate-limit passthrough ───────────────────────────────────


def x__find_rate_limit_error__mutmut_10(exc: Exception) -> Exception | None:
    """Walk exception chain to find an upstream rate-limit error."""
    current: Exception | None = exc
    seen: set[int] = set()
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        # Match openai.RateLimitError, anthropic.RateLimitError, etc.
        if type(None).__name__ == "RateLimitError" or (
            hasattr(current, "status_code") and getattr(current, "status_code", None) == 429
        ):
            return current
        current = current.__cause__ or current.__context__
    return None


# ── Rate-limit passthrough ───────────────────────────────────


def x__find_rate_limit_error__mutmut_11(exc: Exception) -> Exception | None:
    """Walk exception chain to find an upstream rate-limit error."""
    current: Exception | None = exc
    seen: set[int] = set()
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        # Match openai.RateLimitError, anthropic.RateLimitError, etc.
        if type(current).__name__ != "RateLimitError" or (
            hasattr(current, "status_code") and getattr(current, "status_code", None) == 429
        ):
            return current
        current = current.__cause__ or current.__context__
    return None


# ── Rate-limit passthrough ───────────────────────────────────


def x__find_rate_limit_error__mutmut_12(exc: Exception) -> Exception | None:
    """Walk exception chain to find an upstream rate-limit error."""
    current: Exception | None = exc
    seen: set[int] = set()
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        # Match openai.RateLimitError, anthropic.RateLimitError, etc.
        if type(current).__name__ == "XXRateLimitErrorXX" or (
            hasattr(current, "status_code") and getattr(current, "status_code", None) == 429
        ):
            return current
        current = current.__cause__ or current.__context__
    return None


# ── Rate-limit passthrough ───────────────────────────────────


def x__find_rate_limit_error__mutmut_13(exc: Exception) -> Exception | None:
    """Walk exception chain to find an upstream rate-limit error."""
    current: Exception | None = exc
    seen: set[int] = set()
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        # Match openai.RateLimitError, anthropic.RateLimitError, etc.
        if type(current).__name__ == "ratelimiterror" or (
            hasattr(current, "status_code") and getattr(current, "status_code", None) == 429
        ):
            return current
        current = current.__cause__ or current.__context__
    return None


# ── Rate-limit passthrough ───────────────────────────────────


def x__find_rate_limit_error__mutmut_14(exc: Exception) -> Exception | None:
    """Walk exception chain to find an upstream rate-limit error."""
    current: Exception | None = exc
    seen: set[int] = set()
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        # Match openai.RateLimitError, anthropic.RateLimitError, etc.
        if type(current).__name__ == "RATELIMITERROR" or (
            hasattr(current, "status_code") and getattr(current, "status_code", None) == 429
        ):
            return current
        current = current.__cause__ or current.__context__
    return None


# ── Rate-limit passthrough ───────────────────────────────────


def x__find_rate_limit_error__mutmut_15(exc: Exception) -> Exception | None:
    """Walk exception chain to find an upstream rate-limit error."""
    current: Exception | None = exc
    seen: set[int] = set()
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        # Match openai.RateLimitError, anthropic.RateLimitError, etc.
        if type(current).__name__ == "RateLimitError" or (
            hasattr(current, "status_code") or getattr(current, "status_code", None) == 429
        ):
            return current
        current = current.__cause__ or current.__context__
    return None


# ── Rate-limit passthrough ───────────────────────────────────


def x__find_rate_limit_error__mutmut_16(exc: Exception) -> Exception | None:
    """Walk exception chain to find an upstream rate-limit error."""
    current: Exception | None = exc
    seen: set[int] = set()
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        # Match openai.RateLimitError, anthropic.RateLimitError, etc.
        if type(current).__name__ == "RateLimitError" or (
            hasattr(None, "status_code") and getattr(current, "status_code", None) == 429
        ):
            return current
        current = current.__cause__ or current.__context__
    return None


# ── Rate-limit passthrough ───────────────────────────────────


def x__find_rate_limit_error__mutmut_17(exc: Exception) -> Exception | None:
    """Walk exception chain to find an upstream rate-limit error."""
    current: Exception | None = exc
    seen: set[int] = set()
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        # Match openai.RateLimitError, anthropic.RateLimitError, etc.
        if type(current).__name__ == "RateLimitError" or (
            hasattr(current, None) and getattr(current, "status_code", None) == 429
        ):
            return current
        current = current.__cause__ or current.__context__
    return None


# ── Rate-limit passthrough ───────────────────────────────────


def x__find_rate_limit_error__mutmut_18(exc: Exception) -> Exception | None:
    """Walk exception chain to find an upstream rate-limit error."""
    current: Exception | None = exc
    seen: set[int] = set()
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        # Match openai.RateLimitError, anthropic.RateLimitError, etc.
        if type(current).__name__ == "RateLimitError" or (
            hasattr("status_code") and getattr(current, "status_code", None) == 429
        ):
            return current
        current = current.__cause__ or current.__context__
    return None


# ── Rate-limit passthrough ───────────────────────────────────


def x__find_rate_limit_error__mutmut_19(exc: Exception) -> Exception | None:
    """Walk exception chain to find an upstream rate-limit error."""
    current: Exception | None = exc
    seen: set[int] = set()
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        # Match openai.RateLimitError, anthropic.RateLimitError, etc.
        if type(current).__name__ == "RateLimitError" or (
            hasattr(current, ) and getattr(current, "status_code", None) == 429
        ):
            return current
        current = current.__cause__ or current.__context__
    return None


# ── Rate-limit passthrough ───────────────────────────────────


def x__find_rate_limit_error__mutmut_20(exc: Exception) -> Exception | None:
    """Walk exception chain to find an upstream rate-limit error."""
    current: Exception | None = exc
    seen: set[int] = set()
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        # Match openai.RateLimitError, anthropic.RateLimitError, etc.
        if type(current).__name__ == "RateLimitError" or (
            hasattr(current, "XXstatus_codeXX") and getattr(current, "status_code", None) == 429
        ):
            return current
        current = current.__cause__ or current.__context__
    return None


# ── Rate-limit passthrough ───────────────────────────────────


def x__find_rate_limit_error__mutmut_21(exc: Exception) -> Exception | None:
    """Walk exception chain to find an upstream rate-limit error."""
    current: Exception | None = exc
    seen: set[int] = set()
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        # Match openai.RateLimitError, anthropic.RateLimitError, etc.
        if type(current).__name__ == "RateLimitError" or (
            hasattr(current, "STATUS_CODE") and getattr(current, "status_code", None) == 429
        ):
            return current
        current = current.__cause__ or current.__context__
    return None


# ── Rate-limit passthrough ───────────────────────────────────


def x__find_rate_limit_error__mutmut_22(exc: Exception) -> Exception | None:
    """Walk exception chain to find an upstream rate-limit error."""
    current: Exception | None = exc
    seen: set[int] = set()
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        # Match openai.RateLimitError, anthropic.RateLimitError, etc.
        if type(current).__name__ == "RateLimitError" or (
            hasattr(current, "status_code") and getattr(None, "status_code", None) == 429
        ):
            return current
        current = current.__cause__ or current.__context__
    return None


# ── Rate-limit passthrough ───────────────────────────────────


def x__find_rate_limit_error__mutmut_23(exc: Exception) -> Exception | None:
    """Walk exception chain to find an upstream rate-limit error."""
    current: Exception | None = exc
    seen: set[int] = set()
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        # Match openai.RateLimitError, anthropic.RateLimitError, etc.
        if type(current).__name__ == "RateLimitError" or (
            hasattr(current, "status_code") and getattr(current, None, None) == 429
        ):
            return current
        current = current.__cause__ or current.__context__
    return None


# ── Rate-limit passthrough ───────────────────────────────────


def x__find_rate_limit_error__mutmut_24(exc: Exception) -> Exception | None:
    """Walk exception chain to find an upstream rate-limit error."""
    current: Exception | None = exc
    seen: set[int] = set()
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        # Match openai.RateLimitError, anthropic.RateLimitError, etc.
        if type(current).__name__ == "RateLimitError" or (
            hasattr(current, "status_code") and getattr("status_code", None) == 429
        ):
            return current
        current = current.__cause__ or current.__context__
    return None


# ── Rate-limit passthrough ───────────────────────────────────


def x__find_rate_limit_error__mutmut_25(exc: Exception) -> Exception | None:
    """Walk exception chain to find an upstream rate-limit error."""
    current: Exception | None = exc
    seen: set[int] = set()
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        # Match openai.RateLimitError, anthropic.RateLimitError, etc.
        if type(current).__name__ == "RateLimitError" or (
            hasattr(current, "status_code") and getattr(current, None) == 429
        ):
            return current
        current = current.__cause__ or current.__context__
    return None


# ── Rate-limit passthrough ───────────────────────────────────


def x__find_rate_limit_error__mutmut_26(exc: Exception) -> Exception | None:
    """Walk exception chain to find an upstream rate-limit error."""
    current: Exception | None = exc
    seen: set[int] = set()
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        # Match openai.RateLimitError, anthropic.RateLimitError, etc.
        if type(current).__name__ == "RateLimitError" or (
            hasattr(current, "status_code") and getattr(current, "status_code", ) == 429
        ):
            return current
        current = current.__cause__ or current.__context__
    return None


# ── Rate-limit passthrough ───────────────────────────────────


def x__find_rate_limit_error__mutmut_27(exc: Exception) -> Exception | None:
    """Walk exception chain to find an upstream rate-limit error."""
    current: Exception | None = exc
    seen: set[int] = set()
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        # Match openai.RateLimitError, anthropic.RateLimitError, etc.
        if type(current).__name__ == "RateLimitError" or (
            hasattr(current, "status_code") and getattr(current, "XXstatus_codeXX", None) == 429
        ):
            return current
        current = current.__cause__ or current.__context__
    return None


# ── Rate-limit passthrough ───────────────────────────────────


def x__find_rate_limit_error__mutmut_28(exc: Exception) -> Exception | None:
    """Walk exception chain to find an upstream rate-limit error."""
    current: Exception | None = exc
    seen: set[int] = set()
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        # Match openai.RateLimitError, anthropic.RateLimitError, etc.
        if type(current).__name__ == "RateLimitError" or (
            hasattr(current, "status_code") and getattr(current, "STATUS_CODE", None) == 429
        ):
            return current
        current = current.__cause__ or current.__context__
    return None


# ── Rate-limit passthrough ───────────────────────────────────


def x__find_rate_limit_error__mutmut_29(exc: Exception) -> Exception | None:
    """Walk exception chain to find an upstream rate-limit error."""
    current: Exception | None = exc
    seen: set[int] = set()
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        # Match openai.RateLimitError, anthropic.RateLimitError, etc.
        if type(current).__name__ == "RateLimitError" or (
            hasattr(current, "status_code") and getattr(current, "status_code", None) != 429
        ):
            return current
        current = current.__cause__ or current.__context__
    return None


# ── Rate-limit passthrough ───────────────────────────────────


def x__find_rate_limit_error__mutmut_30(exc: Exception) -> Exception | None:
    """Walk exception chain to find an upstream rate-limit error."""
    current: Exception | None = exc
    seen: set[int] = set()
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        # Match openai.RateLimitError, anthropic.RateLimitError, etc.
        if type(current).__name__ == "RateLimitError" or (
            hasattr(current, "status_code") and getattr(current, "status_code", None) == 430
        ):
            return current
        current = current.__cause__ or current.__context__
    return None


# ── Rate-limit passthrough ───────────────────────────────────


def x__find_rate_limit_error__mutmut_31(exc: Exception) -> Exception | None:
    """Walk exception chain to find an upstream rate-limit error."""
    current: Exception | None = exc
    seen: set[int] = set()
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        # Match openai.RateLimitError, anthropic.RateLimitError, etc.
        if type(current).__name__ == "RateLimitError" or (
            hasattr(current, "status_code") and getattr(current, "status_code", None) == 429
        ):
            return current
        current = None
    return None


# ── Rate-limit passthrough ───────────────────────────────────


def x__find_rate_limit_error__mutmut_32(exc: Exception) -> Exception | None:
    """Walk exception chain to find an upstream rate-limit error."""
    current: Exception | None = exc
    seen: set[int] = set()
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        # Match openai.RateLimitError, anthropic.RateLimitError, etc.
        if type(current).__name__ == "RateLimitError" or (
            hasattr(current, "status_code") and getattr(current, "status_code", None) == 429
        ):
            return current
        current = current.__cause__ and current.__context__
    return None

x__find_rate_limit_error__mutmut_mutants : ClassVar[MutantDict] = { # type: ignore
'x__find_rate_limit_error__mutmut_1': x__find_rate_limit_error__mutmut_1, 
    'x__find_rate_limit_error__mutmut_2': x__find_rate_limit_error__mutmut_2, 
    'x__find_rate_limit_error__mutmut_3': x__find_rate_limit_error__mutmut_3, 
    'x__find_rate_limit_error__mutmut_4': x__find_rate_limit_error__mutmut_4, 
    'x__find_rate_limit_error__mutmut_5': x__find_rate_limit_error__mutmut_5, 
    'x__find_rate_limit_error__mutmut_6': x__find_rate_limit_error__mutmut_6, 
    'x__find_rate_limit_error__mutmut_7': x__find_rate_limit_error__mutmut_7, 
    'x__find_rate_limit_error__mutmut_8': x__find_rate_limit_error__mutmut_8, 
    'x__find_rate_limit_error__mutmut_9': x__find_rate_limit_error__mutmut_9, 
    'x__find_rate_limit_error__mutmut_10': x__find_rate_limit_error__mutmut_10, 
    'x__find_rate_limit_error__mutmut_11': x__find_rate_limit_error__mutmut_11, 
    'x__find_rate_limit_error__mutmut_12': x__find_rate_limit_error__mutmut_12, 
    'x__find_rate_limit_error__mutmut_13': x__find_rate_limit_error__mutmut_13, 
    'x__find_rate_limit_error__mutmut_14': x__find_rate_limit_error__mutmut_14, 
    'x__find_rate_limit_error__mutmut_15': x__find_rate_limit_error__mutmut_15, 
    'x__find_rate_limit_error__mutmut_16': x__find_rate_limit_error__mutmut_16, 
    'x__find_rate_limit_error__mutmut_17': x__find_rate_limit_error__mutmut_17, 
    'x__find_rate_limit_error__mutmut_18': x__find_rate_limit_error__mutmut_18, 
    'x__find_rate_limit_error__mutmut_19': x__find_rate_limit_error__mutmut_19, 
    'x__find_rate_limit_error__mutmut_20': x__find_rate_limit_error__mutmut_20, 
    'x__find_rate_limit_error__mutmut_21': x__find_rate_limit_error__mutmut_21, 
    'x__find_rate_limit_error__mutmut_22': x__find_rate_limit_error__mutmut_22, 
    'x__find_rate_limit_error__mutmut_23': x__find_rate_limit_error__mutmut_23, 
    'x__find_rate_limit_error__mutmut_24': x__find_rate_limit_error__mutmut_24, 
    'x__find_rate_limit_error__mutmut_25': x__find_rate_limit_error__mutmut_25, 
    'x__find_rate_limit_error__mutmut_26': x__find_rate_limit_error__mutmut_26, 
    'x__find_rate_limit_error__mutmut_27': x__find_rate_limit_error__mutmut_27, 
    'x__find_rate_limit_error__mutmut_28': x__find_rate_limit_error__mutmut_28, 
    'x__find_rate_limit_error__mutmut_29': x__find_rate_limit_error__mutmut_29, 
    'x__find_rate_limit_error__mutmut_30': x__find_rate_limit_error__mutmut_30, 
    'x__find_rate_limit_error__mutmut_31': x__find_rate_limit_error__mutmut_31, 
    'x__find_rate_limit_error__mutmut_32': x__find_rate_limit_error__mutmut_32
}
x__find_rate_limit_error__mutmut_orig.__name__ = 'x__find_rate_limit_error'


@app.middleware("http")
async def rate_limit_middleware(request, call_next):
    try:
        return await call_next(request)
    except Exception as exc:
        rl = _find_rate_limit_error(exc)
        if rl is not None:
            msg = str(rl).split("\n")[0][:200]
            return JSONResponse(status_code=429, content={"detail": msg})
        raise


# ── Idempotency store ────────────────────────────────────────

# In-memory store: idempotency_key -> (serialized_episode, monotonic_expiry)
_idempotency_store: dict[str, tuple[dict[str, Any], float]] = {}
_IDEMPOTENCY_TTL = 300  # 5 minutes


def _idempotency_check(key: str) -> dict[str, Any] | None:
    args = [key]# type: ignore
    kwargs = {}# type: ignore
    return _mutmut_trampoline(x__idempotency_check__mutmut_orig, x__idempotency_check__mutmut_mutants, args, kwargs, None)


def x__idempotency_check__mutmut_orig(key: str) -> dict[str, Any] | None:
    """Return cached episode if key exists and is not expired, else None."""
    entry = _idempotency_store.get(key)
    if entry is None:
        return None
    if entry[1] > time.monotonic():
        return entry[0]
    del _idempotency_store[key]
    return None


def x__idempotency_check__mutmut_1(key: str) -> dict[str, Any] | None:
    """Return cached episode if key exists and is not expired, else None."""
    entry = None
    if entry is None:
        return None
    if entry[1] > time.monotonic():
        return entry[0]
    del _idempotency_store[key]
    return None


def x__idempotency_check__mutmut_2(key: str) -> dict[str, Any] | None:
    """Return cached episode if key exists and is not expired, else None."""
    entry = _idempotency_store.get(None)
    if entry is None:
        return None
    if entry[1] > time.monotonic():
        return entry[0]
    del _idempotency_store[key]
    return None


def x__idempotency_check__mutmut_3(key: str) -> dict[str, Any] | None:
    """Return cached episode if key exists and is not expired, else None."""
    entry = _idempotency_store.get(key)
    if entry is not None:
        return None
    if entry[1] > time.monotonic():
        return entry[0]
    del _idempotency_store[key]
    return None


def x__idempotency_check__mutmut_4(key: str) -> dict[str, Any] | None:
    """Return cached episode if key exists and is not expired, else None."""
    entry = _idempotency_store.get(key)
    if entry is None:
        return None
    if entry[2] > time.monotonic():
        return entry[0]
    del _idempotency_store[key]
    return None


def x__idempotency_check__mutmut_5(key: str) -> dict[str, Any] | None:
    """Return cached episode if key exists and is not expired, else None."""
    entry = _idempotency_store.get(key)
    if entry is None:
        return None
    if entry[1] >= time.monotonic():
        return entry[0]
    del _idempotency_store[key]
    return None


def x__idempotency_check__mutmut_6(key: str) -> dict[str, Any] | None:
    """Return cached episode if key exists and is not expired, else None."""
    entry = _idempotency_store.get(key)
    if entry is None:
        return None
    if entry[1] > time.monotonic():
        return entry[1]
    del _idempotency_store[key]
    return None

x__idempotency_check__mutmut_mutants : ClassVar[MutantDict] = { # type: ignore
'x__idempotency_check__mutmut_1': x__idempotency_check__mutmut_1, 
    'x__idempotency_check__mutmut_2': x__idempotency_check__mutmut_2, 
    'x__idempotency_check__mutmut_3': x__idempotency_check__mutmut_3, 
    'x__idempotency_check__mutmut_4': x__idempotency_check__mutmut_4, 
    'x__idempotency_check__mutmut_5': x__idempotency_check__mutmut_5, 
    'x__idempotency_check__mutmut_6': x__idempotency_check__mutmut_6
}
x__idempotency_check__mutmut_orig.__name__ = 'x__idempotency_check'


def _idempotency_store_result(key: str, result: dict[str, Any]) -> None:
    args = [key, result]# type: ignore
    kwargs = {}# type: ignore
    return _mutmut_trampoline(x__idempotency_store_result__mutmut_orig, x__idempotency_store_result__mutmut_mutants, args, kwargs, None)


def x__idempotency_store_result__mutmut_orig(key: str, result: dict[str, Any]) -> None:
    """Cache the result under the idempotency key with TTL."""
    _idempotency_store[key] = (result, time.monotonic() + _IDEMPOTENCY_TTL)
    # Lazy cleanup when store grows large
    if len(_idempotency_store) > 100:
        now = time.monotonic()
        expired = [k for k, (_, exp) in _idempotency_store.items() if exp <= now]
        for k in expired:
            del _idempotency_store[k]


def x__idempotency_store_result__mutmut_1(key: str, result: dict[str, Any]) -> None:
    """Cache the result under the idempotency key with TTL."""
    _idempotency_store[key] = None
    # Lazy cleanup when store grows large
    if len(_idempotency_store) > 100:
        now = time.monotonic()
        expired = [k for k, (_, exp) in _idempotency_store.items() if exp <= now]
        for k in expired:
            del _idempotency_store[k]


def x__idempotency_store_result__mutmut_2(key: str, result: dict[str, Any]) -> None:
    """Cache the result under the idempotency key with TTL."""
    _idempotency_store[key] = (result, time.monotonic() - _IDEMPOTENCY_TTL)
    # Lazy cleanup when store grows large
    if len(_idempotency_store) > 100:
        now = time.monotonic()
        expired = [k for k, (_, exp) in _idempotency_store.items() if exp <= now]
        for k in expired:
            del _idempotency_store[k]


def x__idempotency_store_result__mutmut_3(key: str, result: dict[str, Any]) -> None:
    """Cache the result under the idempotency key with TTL."""
    _idempotency_store[key] = (result, time.monotonic() + _IDEMPOTENCY_TTL)
    # Lazy cleanup when store grows large
    if len(_idempotency_store) >= 100:
        now = time.monotonic()
        expired = [k for k, (_, exp) in _idempotency_store.items() if exp <= now]
        for k in expired:
            del _idempotency_store[k]


def x__idempotency_store_result__mutmut_4(key: str, result: dict[str, Any]) -> None:
    """Cache the result under the idempotency key with TTL."""
    _idempotency_store[key] = (result, time.monotonic() + _IDEMPOTENCY_TTL)
    # Lazy cleanup when store grows large
    if len(_idempotency_store) > 101:
        now = time.monotonic()
        expired = [k for k, (_, exp) in _idempotency_store.items() if exp <= now]
        for k in expired:
            del _idempotency_store[k]

x__idempotency_store_result__mutmut_mutants : ClassVar[MutantDict] = { # type: ignore
'x__idempotency_store_result__mutmut_1': x__idempotency_store_result__mutmut_1, 
    'x__idempotency_store_result__mutmut_2': x__idempotency_store_result__mutmut_2, 
    'x__idempotency_store_result__mutmut_3': x__idempotency_store_result__mutmut_3, 
    'x__idempotency_store_result__mutmut_4': x__idempotency_store_result__mutmut_4
}
x__idempotency_store_result__mutmut_orig.__name__ = 'x__idempotency_store_result'


# ── Request / response models ────────────────────────────────


class AddEpisodeRequest(BaseModel):
    name: str
    episode_body: str
    source_description: str
    group_id: str
    reference_time: str | None = None
    source: str | None = None
    idempotency_key: str


class ContentBlock(BaseModel):
    """A content block within a conversation message.

    Supported types:
    - "text": Natural language content (user input or assistant response).
    - "thinking": Internal reasoning trace from the assistant.
    - "tool_use": Serialized tool call (tool name + input).
    - "tool_result": Truncated tool output.
    The server groups thinking, tool_use, and tool_result blocks for
    behaviour distillation before ingestion.
    """
    type: str
    text: str


class ConversationMessage(BaseModel):
    """A single message in a conversation transcript.

    role: "user" for human input, "assistant" for agent output.
    content: Ordered list of content blocks. A message may contain
             multiple blocks (e.g. thinking followed by text).
    """
    role: str
    content: list[ContentBlock]


class IngestMessagesRequest(BaseModel):
    """Ingest a structured conversation for knowledge graph extraction.

    The server formats the transcript, distills thinking blocks into
    behaviour summaries, and creates an episode in the knowledge graph.
    """
    name: str
    source_description: str
    group_id: str
    messages: list[ConversationMessage]
    reference_time: str | None = None
    idempotency_key: str


class SearchRequest(BaseModel):
    query: str
    group_ids: list[str]
    num_results: int = 10


class GroupIdRequest(BaseModel):
    group_id: str


# ── Serializers ───────────────────────────────────────────────


def _ts(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def _serialize_fact(edge: EntityEdge) -> dict[str, Any]:
    args = [edge]# type: ignore
    kwargs = {}# type: ignore
    return _mutmut_trampoline(x__serialize_fact__mutmut_orig, x__serialize_fact__mutmut_mutants, args, kwargs, None)


def x__serialize_fact__mutmut_orig(edge: EntityEdge) -> dict[str, Any]:
    return {
        "uuid": edge.uuid,
        "name": edge.name,
        "fact": edge.fact,
        "group_id": edge.group_id,
        "valid_at": _ts(edge.valid_at),
        "invalid_at": _ts(edge.invalid_at),
        "expired_at": _ts(edge.expired_at),
        "created_at": _ts(edge.created_at),
    }


def x__serialize_fact__mutmut_1(edge: EntityEdge) -> dict[str, Any]:
    return {
        "XXuuidXX": edge.uuid,
        "name": edge.name,
        "fact": edge.fact,
        "group_id": edge.group_id,
        "valid_at": _ts(edge.valid_at),
        "invalid_at": _ts(edge.invalid_at),
        "expired_at": _ts(edge.expired_at),
        "created_at": _ts(edge.created_at),
    }


def x__serialize_fact__mutmut_2(edge: EntityEdge) -> dict[str, Any]:
    return {
        "UUID": edge.uuid,
        "name": edge.name,
        "fact": edge.fact,
        "group_id": edge.group_id,
        "valid_at": _ts(edge.valid_at),
        "invalid_at": _ts(edge.invalid_at),
        "expired_at": _ts(edge.expired_at),
        "created_at": _ts(edge.created_at),
    }


def x__serialize_fact__mutmut_3(edge: EntityEdge) -> dict[str, Any]:
    return {
        "uuid": edge.uuid,
        "XXnameXX": edge.name,
        "fact": edge.fact,
        "group_id": edge.group_id,
        "valid_at": _ts(edge.valid_at),
        "invalid_at": _ts(edge.invalid_at),
        "expired_at": _ts(edge.expired_at),
        "created_at": _ts(edge.created_at),
    }


def x__serialize_fact__mutmut_4(edge: EntityEdge) -> dict[str, Any]:
    return {
        "uuid": edge.uuid,
        "NAME": edge.name,
        "fact": edge.fact,
        "group_id": edge.group_id,
        "valid_at": _ts(edge.valid_at),
        "invalid_at": _ts(edge.invalid_at),
        "expired_at": _ts(edge.expired_at),
        "created_at": _ts(edge.created_at),
    }


def x__serialize_fact__mutmut_5(edge: EntityEdge) -> dict[str, Any]:
    return {
        "uuid": edge.uuid,
        "name": edge.name,
        "XXfactXX": edge.fact,
        "group_id": edge.group_id,
        "valid_at": _ts(edge.valid_at),
        "invalid_at": _ts(edge.invalid_at),
        "expired_at": _ts(edge.expired_at),
        "created_at": _ts(edge.created_at),
    }


def x__serialize_fact__mutmut_6(edge: EntityEdge) -> dict[str, Any]:
    return {
        "uuid": edge.uuid,
        "name": edge.name,
        "FACT": edge.fact,
        "group_id": edge.group_id,
        "valid_at": _ts(edge.valid_at),
        "invalid_at": _ts(edge.invalid_at),
        "expired_at": _ts(edge.expired_at),
        "created_at": _ts(edge.created_at),
    }


def x__serialize_fact__mutmut_7(edge: EntityEdge) -> dict[str, Any]:
    return {
        "uuid": edge.uuid,
        "name": edge.name,
        "fact": edge.fact,
        "XXgroup_idXX": edge.group_id,
        "valid_at": _ts(edge.valid_at),
        "invalid_at": _ts(edge.invalid_at),
        "expired_at": _ts(edge.expired_at),
        "created_at": _ts(edge.created_at),
    }


def x__serialize_fact__mutmut_8(edge: EntityEdge) -> dict[str, Any]:
    return {
        "uuid": edge.uuid,
        "name": edge.name,
        "fact": edge.fact,
        "GROUP_ID": edge.group_id,
        "valid_at": _ts(edge.valid_at),
        "invalid_at": _ts(edge.invalid_at),
        "expired_at": _ts(edge.expired_at),
        "created_at": _ts(edge.created_at),
    }


def x__serialize_fact__mutmut_9(edge: EntityEdge) -> dict[str, Any]:
    return {
        "uuid": edge.uuid,
        "name": edge.name,
        "fact": edge.fact,
        "group_id": edge.group_id,
        "XXvalid_atXX": _ts(edge.valid_at),
        "invalid_at": _ts(edge.invalid_at),
        "expired_at": _ts(edge.expired_at),
        "created_at": _ts(edge.created_at),
    }


def x__serialize_fact__mutmut_10(edge: EntityEdge) -> dict[str, Any]:
    return {
        "uuid": edge.uuid,
        "name": edge.name,
        "fact": edge.fact,
        "group_id": edge.group_id,
        "VALID_AT": _ts(edge.valid_at),
        "invalid_at": _ts(edge.invalid_at),
        "expired_at": _ts(edge.expired_at),
        "created_at": _ts(edge.created_at),
    }


def x__serialize_fact__mutmut_11(edge: EntityEdge) -> dict[str, Any]:
    return {
        "uuid": edge.uuid,
        "name": edge.name,
        "fact": edge.fact,
        "group_id": edge.group_id,
        "valid_at": _ts(None),
        "invalid_at": _ts(edge.invalid_at),
        "expired_at": _ts(edge.expired_at),
        "created_at": _ts(edge.created_at),
    }


def x__serialize_fact__mutmut_12(edge: EntityEdge) -> dict[str, Any]:
    return {
        "uuid": edge.uuid,
        "name": edge.name,
        "fact": edge.fact,
        "group_id": edge.group_id,
        "valid_at": _ts(edge.valid_at),
        "XXinvalid_atXX": _ts(edge.invalid_at),
        "expired_at": _ts(edge.expired_at),
        "created_at": _ts(edge.created_at),
    }


def x__serialize_fact__mutmut_13(edge: EntityEdge) -> dict[str, Any]:
    return {
        "uuid": edge.uuid,
        "name": edge.name,
        "fact": edge.fact,
        "group_id": edge.group_id,
        "valid_at": _ts(edge.valid_at),
        "INVALID_AT": _ts(edge.invalid_at),
        "expired_at": _ts(edge.expired_at),
        "created_at": _ts(edge.created_at),
    }


def x__serialize_fact__mutmut_14(edge: EntityEdge) -> dict[str, Any]:
    return {
        "uuid": edge.uuid,
        "name": edge.name,
        "fact": edge.fact,
        "group_id": edge.group_id,
        "valid_at": _ts(edge.valid_at),
        "invalid_at": _ts(None),
        "expired_at": _ts(edge.expired_at),
        "created_at": _ts(edge.created_at),
    }


def x__serialize_fact__mutmut_15(edge: EntityEdge) -> dict[str, Any]:
    return {
        "uuid": edge.uuid,
        "name": edge.name,
        "fact": edge.fact,
        "group_id": edge.group_id,
        "valid_at": _ts(edge.valid_at),
        "invalid_at": _ts(edge.invalid_at),
        "XXexpired_atXX": _ts(edge.expired_at),
        "created_at": _ts(edge.created_at),
    }


def x__serialize_fact__mutmut_16(edge: EntityEdge) -> dict[str, Any]:
    return {
        "uuid": edge.uuid,
        "name": edge.name,
        "fact": edge.fact,
        "group_id": edge.group_id,
        "valid_at": _ts(edge.valid_at),
        "invalid_at": _ts(edge.invalid_at),
        "EXPIRED_AT": _ts(edge.expired_at),
        "created_at": _ts(edge.created_at),
    }


def x__serialize_fact__mutmut_17(edge: EntityEdge) -> dict[str, Any]:
    return {
        "uuid": edge.uuid,
        "name": edge.name,
        "fact": edge.fact,
        "group_id": edge.group_id,
        "valid_at": _ts(edge.valid_at),
        "invalid_at": _ts(edge.invalid_at),
        "expired_at": _ts(None),
        "created_at": _ts(edge.created_at),
    }


def x__serialize_fact__mutmut_18(edge: EntityEdge) -> dict[str, Any]:
    return {
        "uuid": edge.uuid,
        "name": edge.name,
        "fact": edge.fact,
        "group_id": edge.group_id,
        "valid_at": _ts(edge.valid_at),
        "invalid_at": _ts(edge.invalid_at),
        "expired_at": _ts(edge.expired_at),
        "XXcreated_atXX": _ts(edge.created_at),
    }


def x__serialize_fact__mutmut_19(edge: EntityEdge) -> dict[str, Any]:
    return {
        "uuid": edge.uuid,
        "name": edge.name,
        "fact": edge.fact,
        "group_id": edge.group_id,
        "valid_at": _ts(edge.valid_at),
        "invalid_at": _ts(edge.invalid_at),
        "expired_at": _ts(edge.expired_at),
        "CREATED_AT": _ts(edge.created_at),
    }


def x__serialize_fact__mutmut_20(edge: EntityEdge) -> dict[str, Any]:
    return {
        "uuid": edge.uuid,
        "name": edge.name,
        "fact": edge.fact,
        "group_id": edge.group_id,
        "valid_at": _ts(edge.valid_at),
        "invalid_at": _ts(edge.invalid_at),
        "expired_at": _ts(edge.expired_at),
        "created_at": _ts(None),
    }

x__serialize_fact__mutmut_mutants : ClassVar[MutantDict] = { # type: ignore
'x__serialize_fact__mutmut_1': x__serialize_fact__mutmut_1, 
    'x__serialize_fact__mutmut_2': x__serialize_fact__mutmut_2, 
    'x__serialize_fact__mutmut_3': x__serialize_fact__mutmut_3, 
    'x__serialize_fact__mutmut_4': x__serialize_fact__mutmut_4, 
    'x__serialize_fact__mutmut_5': x__serialize_fact__mutmut_5, 
    'x__serialize_fact__mutmut_6': x__serialize_fact__mutmut_6, 
    'x__serialize_fact__mutmut_7': x__serialize_fact__mutmut_7, 
    'x__serialize_fact__mutmut_8': x__serialize_fact__mutmut_8, 
    'x__serialize_fact__mutmut_9': x__serialize_fact__mutmut_9, 
    'x__serialize_fact__mutmut_10': x__serialize_fact__mutmut_10, 
    'x__serialize_fact__mutmut_11': x__serialize_fact__mutmut_11, 
    'x__serialize_fact__mutmut_12': x__serialize_fact__mutmut_12, 
    'x__serialize_fact__mutmut_13': x__serialize_fact__mutmut_13, 
    'x__serialize_fact__mutmut_14': x__serialize_fact__mutmut_14, 
    'x__serialize_fact__mutmut_15': x__serialize_fact__mutmut_15, 
    'x__serialize_fact__mutmut_16': x__serialize_fact__mutmut_16, 
    'x__serialize_fact__mutmut_17': x__serialize_fact__mutmut_17, 
    'x__serialize_fact__mutmut_18': x__serialize_fact__mutmut_18, 
    'x__serialize_fact__mutmut_19': x__serialize_fact__mutmut_19, 
    'x__serialize_fact__mutmut_20': x__serialize_fact__mutmut_20
}
x__serialize_fact__mutmut_orig.__name__ = 'x__serialize_fact'


def _serialize_node(node: EntityNode) -> dict[str, Any]:
    return {
        "uuid": node.uuid,
        "name": node.name,
        "summary": node.summary,
        "group_id": node.group_id,
        "created_at": _ts(node.created_at),
    }


def _serialize_episode(ep: EpisodicNode) -> dict[str, Any]:
    args = [ep]# type: ignore
    kwargs = {}# type: ignore
    return _mutmut_trampoline(x__serialize_episode__mutmut_orig, x__serialize_episode__mutmut_mutants, args, kwargs, None)


def x__serialize_episode__mutmut_orig(ep: EpisodicNode) -> dict[str, Any]:
    return {
        "uuid": ep.uuid,
        "name": ep.name,
        "content": ep.content,
        "source_description": ep.source_description,
        "group_id": ep.group_id,
        "created_at": _ts(ep.created_at),
    }


def x__serialize_episode__mutmut_1(ep: EpisodicNode) -> dict[str, Any]:
    return {
        "XXuuidXX": ep.uuid,
        "name": ep.name,
        "content": ep.content,
        "source_description": ep.source_description,
        "group_id": ep.group_id,
        "created_at": _ts(ep.created_at),
    }


def x__serialize_episode__mutmut_2(ep: EpisodicNode) -> dict[str, Any]:
    return {
        "UUID": ep.uuid,
        "name": ep.name,
        "content": ep.content,
        "source_description": ep.source_description,
        "group_id": ep.group_id,
        "created_at": _ts(ep.created_at),
    }


def x__serialize_episode__mutmut_3(ep: EpisodicNode) -> dict[str, Any]:
    return {
        "uuid": ep.uuid,
        "XXnameXX": ep.name,
        "content": ep.content,
        "source_description": ep.source_description,
        "group_id": ep.group_id,
        "created_at": _ts(ep.created_at),
    }


def x__serialize_episode__mutmut_4(ep: EpisodicNode) -> dict[str, Any]:
    return {
        "uuid": ep.uuid,
        "NAME": ep.name,
        "content": ep.content,
        "source_description": ep.source_description,
        "group_id": ep.group_id,
        "created_at": _ts(ep.created_at),
    }


def x__serialize_episode__mutmut_5(ep: EpisodicNode) -> dict[str, Any]:
    return {
        "uuid": ep.uuid,
        "name": ep.name,
        "XXcontentXX": ep.content,
        "source_description": ep.source_description,
        "group_id": ep.group_id,
        "created_at": _ts(ep.created_at),
    }


def x__serialize_episode__mutmut_6(ep: EpisodicNode) -> dict[str, Any]:
    return {
        "uuid": ep.uuid,
        "name": ep.name,
        "CONTENT": ep.content,
        "source_description": ep.source_description,
        "group_id": ep.group_id,
        "created_at": _ts(ep.created_at),
    }


def x__serialize_episode__mutmut_7(ep: EpisodicNode) -> dict[str, Any]:
    return {
        "uuid": ep.uuid,
        "name": ep.name,
        "content": ep.content,
        "XXsource_descriptionXX": ep.source_description,
        "group_id": ep.group_id,
        "created_at": _ts(ep.created_at),
    }


def x__serialize_episode__mutmut_8(ep: EpisodicNode) -> dict[str, Any]:
    return {
        "uuid": ep.uuid,
        "name": ep.name,
        "content": ep.content,
        "SOURCE_DESCRIPTION": ep.source_description,
        "group_id": ep.group_id,
        "created_at": _ts(ep.created_at),
    }


def x__serialize_episode__mutmut_9(ep: EpisodicNode) -> dict[str, Any]:
    return {
        "uuid": ep.uuid,
        "name": ep.name,
        "content": ep.content,
        "source_description": ep.source_description,
        "XXgroup_idXX": ep.group_id,
        "created_at": _ts(ep.created_at),
    }


def x__serialize_episode__mutmut_10(ep: EpisodicNode) -> dict[str, Any]:
    return {
        "uuid": ep.uuid,
        "name": ep.name,
        "content": ep.content,
        "source_description": ep.source_description,
        "GROUP_ID": ep.group_id,
        "created_at": _ts(ep.created_at),
    }


def x__serialize_episode__mutmut_11(ep: EpisodicNode) -> dict[str, Any]:
    return {
        "uuid": ep.uuid,
        "name": ep.name,
        "content": ep.content,
        "source_description": ep.source_description,
        "group_id": ep.group_id,
        "XXcreated_atXX": _ts(ep.created_at),
    }


def x__serialize_episode__mutmut_12(ep: EpisodicNode) -> dict[str, Any]:
    return {
        "uuid": ep.uuid,
        "name": ep.name,
        "content": ep.content,
        "source_description": ep.source_description,
        "group_id": ep.group_id,
        "CREATED_AT": _ts(ep.created_at),
    }


def x__serialize_episode__mutmut_13(ep: EpisodicNode) -> dict[str, Any]:
    return {
        "uuid": ep.uuid,
        "name": ep.name,
        "content": ep.content,
        "source_description": ep.source_description,
        "group_id": ep.group_id,
        "created_at": _ts(None),
    }

x__serialize_episode__mutmut_mutants : ClassVar[MutantDict] = { # type: ignore
'x__serialize_episode__mutmut_1': x__serialize_episode__mutmut_1, 
    'x__serialize_episode__mutmut_2': x__serialize_episode__mutmut_2, 
    'x__serialize_episode__mutmut_3': x__serialize_episode__mutmut_3, 
    'x__serialize_episode__mutmut_4': x__serialize_episode__mutmut_4, 
    'x__serialize_episode__mutmut_5': x__serialize_episode__mutmut_5, 
    'x__serialize_episode__mutmut_6': x__serialize_episode__mutmut_6, 
    'x__serialize_episode__mutmut_7': x__serialize_episode__mutmut_7, 
    'x__serialize_episode__mutmut_8': x__serialize_episode__mutmut_8, 
    'x__serialize_episode__mutmut_9': x__serialize_episode__mutmut_9, 
    'x__serialize_episode__mutmut_10': x__serialize_episode__mutmut_10, 
    'x__serialize_episode__mutmut_11': x__serialize_episode__mutmut_11, 
    'x__serialize_episode__mutmut_12': x__serialize_episode__mutmut_12, 
    'x__serialize_episode__mutmut_13': x__serialize_episode__mutmut_13
}
x__serialize_episode__mutmut_orig.__name__ = 'x__serialize_episode'


def _serialize_community(c: CommunityNode) -> dict[str, Any]:
    return {
        "uuid": c.uuid,
        "name": c.name,
        "summary": c.summary,
        "group_id": c.group_id,
        "created_at": _ts(c.created_at),
    }


# ── Transcript formatting & thinking distillation ─────────────

logger = logging.getLogger(__name__)

_DISTILL_SYSTEM_PROMPT = (
    "You are a distillery for agentic thought and action. Given an AI agent's internal "
    "thinking and tool usage from a conversation turn, capture the reasoning and actions "
    "the agent took and contextualise them within the dialog. Write one to three sentences "
    "— no filler, maximum distillation. Focus on reasoning, decisions, actions taken "
    "(including which tools were used and why), and outcomes. "
    "Write in first person, past tense. Output only the distilled text, nothing else."
)


async def _distill_one(llm_client: Any, thinking: str) -> str:
    args = [llm_client, thinking]# type: ignore
    kwargs = {}# type: ignore
    return await _mutmut_trampoline(x__distill_one__mutmut_orig, x__distill_one__mutmut_mutants, args, kwargs, None)


async def x__distill_one__mutmut_orig(llm_client: Any, thinking: str) -> str:
    """Distill a single turn's behaviour (thinking + tool use) into a summary."""
    from graphiti_core.prompts.models import Message

    messages = [
        Message(role="system", content=_DISTILL_SYSTEM_PROMPT),
        Message(role="user", content=thinking),
    ]
    result = await llm_client.generate_response(messages, max_tokens=300)
    return result.get("content", "").strip()


async def x__distill_one__mutmut_1(llm_client: Any, thinking: str) -> str:
    """Distill a single turn's behaviour (thinking + tool use) into a summary."""
    from graphiti_core.prompts.models import Message

    messages = None
    result = await llm_client.generate_response(messages, max_tokens=300)
    return result.get("content", "").strip()


async def x__distill_one__mutmut_2(llm_client: Any, thinking: str) -> str:
    """Distill a single turn's behaviour (thinking + tool use) into a summary."""
    from graphiti_core.prompts.models import Message

    messages = [
        Message(role=None, content=_DISTILL_SYSTEM_PROMPT),
        Message(role="user", content=thinking),
    ]
    result = await llm_client.generate_response(messages, max_tokens=300)
    return result.get("content", "").strip()


async def x__distill_one__mutmut_3(llm_client: Any, thinking: str) -> str:
    """Distill a single turn's behaviour (thinking + tool use) into a summary."""
    from graphiti_core.prompts.models import Message

    messages = [
        Message(role="system", content=None),
        Message(role="user", content=thinking),
    ]
    result = await llm_client.generate_response(messages, max_tokens=300)
    return result.get("content", "").strip()


async def x__distill_one__mutmut_4(llm_client: Any, thinking: str) -> str:
    """Distill a single turn's behaviour (thinking + tool use) into a summary."""
    from graphiti_core.prompts.models import Message

    messages = [
        Message(content=_DISTILL_SYSTEM_PROMPT),
        Message(role="user", content=thinking),
    ]
    result = await llm_client.generate_response(messages, max_tokens=300)
    return result.get("content", "").strip()


async def x__distill_one__mutmut_5(llm_client: Any, thinking: str) -> str:
    """Distill a single turn's behaviour (thinking + tool use) into a summary."""
    from graphiti_core.prompts.models import Message

    messages = [
        Message(role="system", ),
        Message(role="user", content=thinking),
    ]
    result = await llm_client.generate_response(messages, max_tokens=300)
    return result.get("content", "").strip()


async def x__distill_one__mutmut_6(llm_client: Any, thinking: str) -> str:
    """Distill a single turn's behaviour (thinking + tool use) into a summary."""
    from graphiti_core.prompts.models import Message

    messages = [
        Message(role="XXsystemXX", content=_DISTILL_SYSTEM_PROMPT),
        Message(role="user", content=thinking),
    ]
    result = await llm_client.generate_response(messages, max_tokens=300)
    return result.get("content", "").strip()


async def x__distill_one__mutmut_7(llm_client: Any, thinking: str) -> str:
    """Distill a single turn's behaviour (thinking + tool use) into a summary."""
    from graphiti_core.prompts.models import Message

    messages = [
        Message(role="SYSTEM", content=_DISTILL_SYSTEM_PROMPT),
        Message(role="user", content=thinking),
    ]
    result = await llm_client.generate_response(messages, max_tokens=300)
    return result.get("content", "").strip()


async def x__distill_one__mutmut_8(llm_client: Any, thinking: str) -> str:
    """Distill a single turn's behaviour (thinking + tool use) into a summary."""
    from graphiti_core.prompts.models import Message

    messages = [
        Message(role="system", content=_DISTILL_SYSTEM_PROMPT),
        Message(role=None, content=thinking),
    ]
    result = await llm_client.generate_response(messages, max_tokens=300)
    return result.get("content", "").strip()


async def x__distill_one__mutmut_9(llm_client: Any, thinking: str) -> str:
    """Distill a single turn's behaviour (thinking + tool use) into a summary."""
    from graphiti_core.prompts.models import Message

    messages = [
        Message(role="system", content=_DISTILL_SYSTEM_PROMPT),
        Message(role="user", content=None),
    ]
    result = await llm_client.generate_response(messages, max_tokens=300)
    return result.get("content", "").strip()


async def x__distill_one__mutmut_10(llm_client: Any, thinking: str) -> str:
    """Distill a single turn's behaviour (thinking + tool use) into a summary."""
    from graphiti_core.prompts.models import Message

    messages = [
        Message(role="system", content=_DISTILL_SYSTEM_PROMPT),
        Message(content=thinking),
    ]
    result = await llm_client.generate_response(messages, max_tokens=300)
    return result.get("content", "").strip()


async def x__distill_one__mutmut_11(llm_client: Any, thinking: str) -> str:
    """Distill a single turn's behaviour (thinking + tool use) into a summary."""
    from graphiti_core.prompts.models import Message

    messages = [
        Message(role="system", content=_DISTILL_SYSTEM_PROMPT),
        Message(role="user", ),
    ]
    result = await llm_client.generate_response(messages, max_tokens=300)
    return result.get("content", "").strip()


async def x__distill_one__mutmut_12(llm_client: Any, thinking: str) -> str:
    """Distill a single turn's behaviour (thinking + tool use) into a summary."""
    from graphiti_core.prompts.models import Message

    messages = [
        Message(role="system", content=_DISTILL_SYSTEM_PROMPT),
        Message(role="XXuserXX", content=thinking),
    ]
    result = await llm_client.generate_response(messages, max_tokens=300)
    return result.get("content", "").strip()


async def x__distill_one__mutmut_13(llm_client: Any, thinking: str) -> str:
    """Distill a single turn's behaviour (thinking + tool use) into a summary."""
    from graphiti_core.prompts.models import Message

    messages = [
        Message(role="system", content=_DISTILL_SYSTEM_PROMPT),
        Message(role="USER", content=thinking),
    ]
    result = await llm_client.generate_response(messages, max_tokens=300)
    return result.get("content", "").strip()


async def x__distill_one__mutmut_14(llm_client: Any, thinking: str) -> str:
    """Distill a single turn's behaviour (thinking + tool use) into a summary."""
    from graphiti_core.prompts.models import Message

    messages = [
        Message(role="system", content=_DISTILL_SYSTEM_PROMPT),
        Message(role="user", content=thinking),
    ]
    result = None
    return result.get("content", "").strip()


async def x__distill_one__mutmut_15(llm_client: Any, thinking: str) -> str:
    """Distill a single turn's behaviour (thinking + tool use) into a summary."""
    from graphiti_core.prompts.models import Message

    messages = [
        Message(role="system", content=_DISTILL_SYSTEM_PROMPT),
        Message(role="user", content=thinking),
    ]
    result = await llm_client.generate_response(None, max_tokens=300)
    return result.get("content", "").strip()


async def x__distill_one__mutmut_16(llm_client: Any, thinking: str) -> str:
    """Distill a single turn's behaviour (thinking + tool use) into a summary."""
    from graphiti_core.prompts.models import Message

    messages = [
        Message(role="system", content=_DISTILL_SYSTEM_PROMPT),
        Message(role="user", content=thinking),
    ]
    result = await llm_client.generate_response(messages, max_tokens=None)
    return result.get("content", "").strip()


async def x__distill_one__mutmut_17(llm_client: Any, thinking: str) -> str:
    """Distill a single turn's behaviour (thinking + tool use) into a summary."""
    from graphiti_core.prompts.models import Message

    messages = [
        Message(role="system", content=_DISTILL_SYSTEM_PROMPT),
        Message(role="user", content=thinking),
    ]
    result = await llm_client.generate_response(max_tokens=300)
    return result.get("content", "").strip()


async def x__distill_one__mutmut_18(llm_client: Any, thinking: str) -> str:
    """Distill a single turn's behaviour (thinking + tool use) into a summary."""
    from graphiti_core.prompts.models import Message

    messages = [
        Message(role="system", content=_DISTILL_SYSTEM_PROMPT),
        Message(role="user", content=thinking),
    ]
    result = await llm_client.generate_response(messages, )
    return result.get("content", "").strip()


async def x__distill_one__mutmut_19(llm_client: Any, thinking: str) -> str:
    """Distill a single turn's behaviour (thinking + tool use) into a summary."""
    from graphiti_core.prompts.models import Message

    messages = [
        Message(role="system", content=_DISTILL_SYSTEM_PROMPT),
        Message(role="user", content=thinking),
    ]
    result = await llm_client.generate_response(messages, max_tokens=301)
    return result.get("content", "").strip()


async def x__distill_one__mutmut_20(llm_client: Any, thinking: str) -> str:
    """Distill a single turn's behaviour (thinking + tool use) into a summary."""
    from graphiti_core.prompts.models import Message

    messages = [
        Message(role="system", content=_DISTILL_SYSTEM_PROMPT),
        Message(role="user", content=thinking),
    ]
    result = await llm_client.generate_response(messages, max_tokens=300)
    return result.get(None, "").strip()


async def x__distill_one__mutmut_21(llm_client: Any, thinking: str) -> str:
    """Distill a single turn's behaviour (thinking + tool use) into a summary."""
    from graphiti_core.prompts.models import Message

    messages = [
        Message(role="system", content=_DISTILL_SYSTEM_PROMPT),
        Message(role="user", content=thinking),
    ]
    result = await llm_client.generate_response(messages, max_tokens=300)
    return result.get("content", None).strip()


async def x__distill_one__mutmut_22(llm_client: Any, thinking: str) -> str:
    """Distill a single turn's behaviour (thinking + tool use) into a summary."""
    from graphiti_core.prompts.models import Message

    messages = [
        Message(role="system", content=_DISTILL_SYSTEM_PROMPT),
        Message(role="user", content=thinking),
    ]
    result = await llm_client.generate_response(messages, max_tokens=300)
    return result.get("").strip()


async def x__distill_one__mutmut_23(llm_client: Any, thinking: str) -> str:
    """Distill a single turn's behaviour (thinking + tool use) into a summary."""
    from graphiti_core.prompts.models import Message

    messages = [
        Message(role="system", content=_DISTILL_SYSTEM_PROMPT),
        Message(role="user", content=thinking),
    ]
    result = await llm_client.generate_response(messages, max_tokens=300)
    return result.get("content", ).strip()


async def x__distill_one__mutmut_24(llm_client: Any, thinking: str) -> str:
    """Distill a single turn's behaviour (thinking + tool use) into a summary."""
    from graphiti_core.prompts.models import Message

    messages = [
        Message(role="system", content=_DISTILL_SYSTEM_PROMPT),
        Message(role="user", content=thinking),
    ]
    result = await llm_client.generate_response(messages, max_tokens=300)
    return result.get("XXcontentXX", "").strip()


async def x__distill_one__mutmut_25(llm_client: Any, thinking: str) -> str:
    """Distill a single turn's behaviour (thinking + tool use) into a summary."""
    from graphiti_core.prompts.models import Message

    messages = [
        Message(role="system", content=_DISTILL_SYSTEM_PROMPT),
        Message(role="user", content=thinking),
    ]
    result = await llm_client.generate_response(messages, max_tokens=300)
    return result.get("CONTENT", "").strip()


async def x__distill_one__mutmut_26(llm_client: Any, thinking: str) -> str:
    """Distill a single turn's behaviour (thinking + tool use) into a summary."""
    from graphiti_core.prompts.models import Message

    messages = [
        Message(role="system", content=_DISTILL_SYSTEM_PROMPT),
        Message(role="user", content=thinking),
    ]
    result = await llm_client.generate_response(messages, max_tokens=300)
    return result.get("content", "XXXX").strip()

x__distill_one__mutmut_mutants : ClassVar[MutantDict] = { # type: ignore
'x__distill_one__mutmut_1': x__distill_one__mutmut_1, 
    'x__distill_one__mutmut_2': x__distill_one__mutmut_2, 
    'x__distill_one__mutmut_3': x__distill_one__mutmut_3, 
    'x__distill_one__mutmut_4': x__distill_one__mutmut_4, 
    'x__distill_one__mutmut_5': x__distill_one__mutmut_5, 
    'x__distill_one__mutmut_6': x__distill_one__mutmut_6, 
    'x__distill_one__mutmut_7': x__distill_one__mutmut_7, 
    'x__distill_one__mutmut_8': x__distill_one__mutmut_8, 
    'x__distill_one__mutmut_9': x__distill_one__mutmut_9, 
    'x__distill_one__mutmut_10': x__distill_one__mutmut_10, 
    'x__distill_one__mutmut_11': x__distill_one__mutmut_11, 
    'x__distill_one__mutmut_12': x__distill_one__mutmut_12, 
    'x__distill_one__mutmut_13': x__distill_one__mutmut_13, 
    'x__distill_one__mutmut_14': x__distill_one__mutmut_14, 
    'x__distill_one__mutmut_15': x__distill_one__mutmut_15, 
    'x__distill_one__mutmut_16': x__distill_one__mutmut_16, 
    'x__distill_one__mutmut_17': x__distill_one__mutmut_17, 
    'x__distill_one__mutmut_18': x__distill_one__mutmut_18, 
    'x__distill_one__mutmut_19': x__distill_one__mutmut_19, 
    'x__distill_one__mutmut_20': x__distill_one__mutmut_20, 
    'x__distill_one__mutmut_21': x__distill_one__mutmut_21, 
    'x__distill_one__mutmut_22': x__distill_one__mutmut_22, 
    'x__distill_one__mutmut_23': x__distill_one__mutmut_23, 
    'x__distill_one__mutmut_24': x__distill_one__mutmut_24, 
    'x__distill_one__mutmut_25': x__distill_one__mutmut_25, 
    'x__distill_one__mutmut_26': x__distill_one__mutmut_26
}
x__distill_one__mutmut_orig.__name__ = 'x__distill_one'


async def _distill_thinking(llm_client: Any, thinking_blocks: list[str]) -> list[str]:
    args = [llm_client, thinking_blocks]# type: ignore
    kwargs = {}# type: ignore
    return await _mutmut_trampoline(x__distill_thinking__mutmut_orig, x__distill_thinking__mutmut_mutants, args, kwargs, None)


async def x__distill_thinking__mutmut_orig(llm_client: Any, thinking_blocks: list[str]) -> list[str]:
    """Distill behaviour blocks (thinking + tool use) into summaries, one per turn.

    Returns a list parallel to thinking_blocks. Failed entries are empty strings.
    """

    async def _safe_distill(thinking: str) -> str:
        if not thinking.strip():
            return ""
        try:
            return await _distill_one(llm_client, thinking)
        except Exception as e:
            logger.warning("Behaviour distillation failed: %s", e)
            return ""

    return list(await asyncio.gather(*[_safe_distill(t) for t in thinking_blocks]))


async def x__distill_thinking__mutmut_1(llm_client: Any, thinking_blocks: list[str]) -> list[str]:
    """Distill behaviour blocks (thinking + tool use) into summaries, one per turn.

    Returns a list parallel to thinking_blocks. Failed entries are empty strings.
    """

    async def _safe_distill(thinking: str) -> str:
        if thinking.strip():
            return ""
        try:
            return await _distill_one(llm_client, thinking)
        except Exception as e:
            logger.warning("Behaviour distillation failed: %s", e)
            return ""

    return list(await asyncio.gather(*[_safe_distill(t) for t in thinking_blocks]))


async def x__distill_thinking__mutmut_2(llm_client: Any, thinking_blocks: list[str]) -> list[str]:
    """Distill behaviour blocks (thinking + tool use) into summaries, one per turn.

    Returns a list parallel to thinking_blocks. Failed entries are empty strings.
    """

    async def _safe_distill(thinking: str) -> str:
        if not thinking.strip():
            return "XXXX"
        try:
            return await _distill_one(llm_client, thinking)
        except Exception as e:
            logger.warning("Behaviour distillation failed: %s", e)
            return ""

    return list(await asyncio.gather(*[_safe_distill(t) for t in thinking_blocks]))


async def x__distill_thinking__mutmut_3(llm_client: Any, thinking_blocks: list[str]) -> list[str]:
    """Distill behaviour blocks (thinking + tool use) into summaries, one per turn.

    Returns a list parallel to thinking_blocks. Failed entries are empty strings.
    """

    async def _safe_distill(thinking: str) -> str:
        if not thinking.strip():
            return ""
        try:
            return await _distill_one(None, thinking)
        except Exception as e:
            logger.warning("Behaviour distillation failed: %s", e)
            return ""

    return list(await asyncio.gather(*[_safe_distill(t) for t in thinking_blocks]))


async def x__distill_thinking__mutmut_4(llm_client: Any, thinking_blocks: list[str]) -> list[str]:
    """Distill behaviour blocks (thinking + tool use) into summaries, one per turn.

    Returns a list parallel to thinking_blocks. Failed entries are empty strings.
    """

    async def _safe_distill(thinking: str) -> str:
        if not thinking.strip():
            return ""
        try:
            return await _distill_one(llm_client, None)
        except Exception as e:
            logger.warning("Behaviour distillation failed: %s", e)
            return ""

    return list(await asyncio.gather(*[_safe_distill(t) for t in thinking_blocks]))


async def x__distill_thinking__mutmut_5(llm_client: Any, thinking_blocks: list[str]) -> list[str]:
    """Distill behaviour blocks (thinking + tool use) into summaries, one per turn.

    Returns a list parallel to thinking_blocks. Failed entries are empty strings.
    """

    async def _safe_distill(thinking: str) -> str:
        if not thinking.strip():
            return ""
        try:
            return await _distill_one(thinking)
        except Exception as e:
            logger.warning("Behaviour distillation failed: %s", e)
            return ""

    return list(await asyncio.gather(*[_safe_distill(t) for t in thinking_blocks]))


async def x__distill_thinking__mutmut_6(llm_client: Any, thinking_blocks: list[str]) -> list[str]:
    """Distill behaviour blocks (thinking + tool use) into summaries, one per turn.

    Returns a list parallel to thinking_blocks. Failed entries are empty strings.
    """

    async def _safe_distill(thinking: str) -> str:
        if not thinking.strip():
            return ""
        try:
            return await _distill_one(llm_client, )
        except Exception as e:
            logger.warning("Behaviour distillation failed: %s", e)
            return ""

    return list(await asyncio.gather(*[_safe_distill(t) for t in thinking_blocks]))


async def x__distill_thinking__mutmut_7(llm_client: Any, thinking_blocks: list[str]) -> list[str]:
    """Distill behaviour blocks (thinking + tool use) into summaries, one per turn.

    Returns a list parallel to thinking_blocks. Failed entries are empty strings.
    """

    async def _safe_distill(thinking: str) -> str:
        if not thinking.strip():
            return ""
        try:
            return await _distill_one(llm_client, thinking)
        except Exception as e:
            logger.warning(None, e)
            return ""

    return list(await asyncio.gather(*[_safe_distill(t) for t in thinking_blocks]))


async def x__distill_thinking__mutmut_8(llm_client: Any, thinking_blocks: list[str]) -> list[str]:
    """Distill behaviour blocks (thinking + tool use) into summaries, one per turn.

    Returns a list parallel to thinking_blocks. Failed entries are empty strings.
    """

    async def _safe_distill(thinking: str) -> str:
        if not thinking.strip():
            return ""
        try:
            return await _distill_one(llm_client, thinking)
        except Exception as e:
            logger.warning("Behaviour distillation failed: %s", None)
            return ""

    return list(await asyncio.gather(*[_safe_distill(t) for t in thinking_blocks]))


async def x__distill_thinking__mutmut_9(llm_client: Any, thinking_blocks: list[str]) -> list[str]:
    """Distill behaviour blocks (thinking + tool use) into summaries, one per turn.

    Returns a list parallel to thinking_blocks. Failed entries are empty strings.
    """

    async def _safe_distill(thinking: str) -> str:
        if not thinking.strip():
            return ""
        try:
            return await _distill_one(llm_client, thinking)
        except Exception as e:
            logger.warning(e)
            return ""

    return list(await asyncio.gather(*[_safe_distill(t) for t in thinking_blocks]))


async def x__distill_thinking__mutmut_10(llm_client: Any, thinking_blocks: list[str]) -> list[str]:
    """Distill behaviour blocks (thinking + tool use) into summaries, one per turn.

    Returns a list parallel to thinking_blocks. Failed entries are empty strings.
    """

    async def _safe_distill(thinking: str) -> str:
        if not thinking.strip():
            return ""
        try:
            return await _distill_one(llm_client, thinking)
        except Exception as e:
            logger.warning("Behaviour distillation failed: %s", )
            return ""

    return list(await asyncio.gather(*[_safe_distill(t) for t in thinking_blocks]))


async def x__distill_thinking__mutmut_11(llm_client: Any, thinking_blocks: list[str]) -> list[str]:
    """Distill behaviour blocks (thinking + tool use) into summaries, one per turn.

    Returns a list parallel to thinking_blocks. Failed entries are empty strings.
    """

    async def _safe_distill(thinking: str) -> str:
        if not thinking.strip():
            return ""
        try:
            return await _distill_one(llm_client, thinking)
        except Exception as e:
            logger.warning("XXBehaviour distillation failed: %sXX", e)
            return ""

    return list(await asyncio.gather(*[_safe_distill(t) for t in thinking_blocks]))


async def x__distill_thinking__mutmut_12(llm_client: Any, thinking_blocks: list[str]) -> list[str]:
    """Distill behaviour blocks (thinking + tool use) into summaries, one per turn.

    Returns a list parallel to thinking_blocks. Failed entries are empty strings.
    """

    async def _safe_distill(thinking: str) -> str:
        if not thinking.strip():
            return ""
        try:
            return await _distill_one(llm_client, thinking)
        except Exception as e:
            logger.warning("behaviour distillation failed: %s", e)
            return ""

    return list(await asyncio.gather(*[_safe_distill(t) for t in thinking_blocks]))


async def x__distill_thinking__mutmut_13(llm_client: Any, thinking_blocks: list[str]) -> list[str]:
    """Distill behaviour blocks (thinking + tool use) into summaries, one per turn.

    Returns a list parallel to thinking_blocks. Failed entries are empty strings.
    """

    async def _safe_distill(thinking: str) -> str:
        if not thinking.strip():
            return ""
        try:
            return await _distill_one(llm_client, thinking)
        except Exception as e:
            logger.warning("BEHAVIOUR DISTILLATION FAILED: %S", e)
            return ""

    return list(await asyncio.gather(*[_safe_distill(t) for t in thinking_blocks]))


async def x__distill_thinking__mutmut_14(llm_client: Any, thinking_blocks: list[str]) -> list[str]:
    """Distill behaviour blocks (thinking + tool use) into summaries, one per turn.

    Returns a list parallel to thinking_blocks. Failed entries are empty strings.
    """

    async def _safe_distill(thinking: str) -> str:
        if not thinking.strip():
            return ""
        try:
            return await _distill_one(llm_client, thinking)
        except Exception as e:
            logger.warning("Behaviour distillation failed: %s", e)
            return "XXXX"

    return list(await asyncio.gather(*[_safe_distill(t) for t in thinking_blocks]))


async def x__distill_thinking__mutmut_15(llm_client: Any, thinking_blocks: list[str]) -> list[str]:
    """Distill behaviour blocks (thinking + tool use) into summaries, one per turn.

    Returns a list parallel to thinking_blocks. Failed entries are empty strings.
    """

    async def _safe_distill(thinking: str) -> str:
        if not thinking.strip():
            return ""
        try:
            return await _distill_one(llm_client, thinking)
        except Exception as e:
            logger.warning("Behaviour distillation failed: %s", e)
            return ""

    return list(None)


async def x__distill_thinking__mutmut_16(llm_client: Any, thinking_blocks: list[str]) -> list[str]:
    """Distill behaviour blocks (thinking + tool use) into summaries, one per turn.

    Returns a list parallel to thinking_blocks. Failed entries are empty strings.
    """

    async def _safe_distill(thinking: str) -> str:
        if not thinking.strip():
            return ""
        try:
            return await _distill_one(llm_client, thinking)
        except Exception as e:
            logger.warning("Behaviour distillation failed: %s", e)
            return ""

    return list(await asyncio.gather(*[_safe_distill(None) for t in thinking_blocks]))

x__distill_thinking__mutmut_mutants : ClassVar[MutantDict] = { # type: ignore
'x__distill_thinking__mutmut_1': x__distill_thinking__mutmut_1, 
    'x__distill_thinking__mutmut_2': x__distill_thinking__mutmut_2, 
    'x__distill_thinking__mutmut_3': x__distill_thinking__mutmut_3, 
    'x__distill_thinking__mutmut_4': x__distill_thinking__mutmut_4, 
    'x__distill_thinking__mutmut_5': x__distill_thinking__mutmut_5, 
    'x__distill_thinking__mutmut_6': x__distill_thinking__mutmut_6, 
    'x__distill_thinking__mutmut_7': x__distill_thinking__mutmut_7, 
    'x__distill_thinking__mutmut_8': x__distill_thinking__mutmut_8, 
    'x__distill_thinking__mutmut_9': x__distill_thinking__mutmut_9, 
    'x__distill_thinking__mutmut_10': x__distill_thinking__mutmut_10, 
    'x__distill_thinking__mutmut_11': x__distill_thinking__mutmut_11, 
    'x__distill_thinking__mutmut_12': x__distill_thinking__mutmut_12, 
    'x__distill_thinking__mutmut_13': x__distill_thinking__mutmut_13, 
    'x__distill_thinking__mutmut_14': x__distill_thinking__mutmut_14, 
    'x__distill_thinking__mutmut_15': x__distill_thinking__mutmut_15, 
    'x__distill_thinking__mutmut_16': x__distill_thinking__mutmut_16
}
x__distill_thinking__mutmut_orig.__name__ = 'x__distill_thinking'


async def _format_transcript(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    args = [msgs, llm_client]# type: ignore
    kwargs = {}# type: ignore
    return await _mutmut_trampoline(x__format_transcript__mutmut_orig, x__format_transcript__mutmut_mutants, args, kwargs, None)


async def x__format_transcript__mutmut_orig(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_1(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = None
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_2(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role != "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_3(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "XXuserXX":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_4(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "USER":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_5(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(None)
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_6(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type != "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_7(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "XXtextXX":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_8(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "TEXT":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_9(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(None)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_10(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[+1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_11(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-2].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_12(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role != "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_13(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "XXassistantXX":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_14(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "ASSISTANT":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_15(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type not in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_16(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("XXthinkingXX", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_17(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("THINKING", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_18(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "XXtool_useXX", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_19(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "TOOL_USE", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_20(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "XXtool_resultXX"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_21(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "TOOL_RESULT"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_22(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(None)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_23(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[+1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_24(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-2].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_25(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type != "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_26(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "XXtextXX":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_27(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "TEXT":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_28(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(None)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_29(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[+1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_30(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-2].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_31(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = None
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_32(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(None)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_33(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "XX\n---\nXX".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_34(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(None) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_35(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = None
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_36(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill or llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_37(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = None
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_38(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = None
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_39(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info(None, len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_40(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", None, sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_41(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), None, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_42(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, None)
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_43(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info(len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_44(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_45(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_46(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, )
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_47(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("XX[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%dXX", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_48(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalchars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_49(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[GRALKOR] BEHAVIOUR DISTILLATION — GROUPS:%D SIZES:%S TOTALCHARS:%D", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_50(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(None))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_51(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug(None, "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_52(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", None)
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_53(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_54(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", )
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_55(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("XX[gralkor] behaviour pre-distill:\n%sXX", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_56(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[GRALKOR] BEHAVIOUR PRE-DISTILL:\n%S", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_57(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(None))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_58(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "XX\n===\nXX".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_59(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = None
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_60(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(None, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_61(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, None)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_62(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_63(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, )
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_64(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(None, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_65(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, None):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_66(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_67(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, ):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_68(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = None
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_69(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info(None, len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_70(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", None, len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_71(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), None)
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_72(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info(len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_73(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_74(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), )
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_75(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("XX[gralkor] behaviour distilled — %d/%d succeededXX", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_76(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[GRALKOR] BEHAVIOUR DISTILLED — %D/%D SUCCEEDED", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_77(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug(None, summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_78(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", None)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_79(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug(summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_80(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", )

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_81(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("XX[gralkor] behaviour post-distill: %sXX", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_82(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[GRALKOR] BEHAVIOUR POST-DISTILL: %S", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_83(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = None
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_84(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(None):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_85(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(None)
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_86(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i not in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_87(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(None)
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


async def x__format_transcript__mutmut_88(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(None)

    return "\n".join(lines)


async def x__format_transcript__mutmut_89(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(None)


async def x__format_transcript__mutmut_90(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "XX\nXX".join(lines)

x__format_transcript__mutmut_mutants : ClassVar[MutantDict] = { # type: ignore
'x__format_transcript__mutmut_1': x__format_transcript__mutmut_1, 
    'x__format_transcript__mutmut_2': x__format_transcript__mutmut_2, 
    'x__format_transcript__mutmut_3': x__format_transcript__mutmut_3, 
    'x__format_transcript__mutmut_4': x__format_transcript__mutmut_4, 
    'x__format_transcript__mutmut_5': x__format_transcript__mutmut_5, 
    'x__format_transcript__mutmut_6': x__format_transcript__mutmut_6, 
    'x__format_transcript__mutmut_7': x__format_transcript__mutmut_7, 
    'x__format_transcript__mutmut_8': x__format_transcript__mutmut_8, 
    'x__format_transcript__mutmut_9': x__format_transcript__mutmut_9, 
    'x__format_transcript__mutmut_10': x__format_transcript__mutmut_10, 
    'x__format_transcript__mutmut_11': x__format_transcript__mutmut_11, 
    'x__format_transcript__mutmut_12': x__format_transcript__mutmut_12, 
    'x__format_transcript__mutmut_13': x__format_transcript__mutmut_13, 
    'x__format_transcript__mutmut_14': x__format_transcript__mutmut_14, 
    'x__format_transcript__mutmut_15': x__format_transcript__mutmut_15, 
    'x__format_transcript__mutmut_16': x__format_transcript__mutmut_16, 
    'x__format_transcript__mutmut_17': x__format_transcript__mutmut_17, 
    'x__format_transcript__mutmut_18': x__format_transcript__mutmut_18, 
    'x__format_transcript__mutmut_19': x__format_transcript__mutmut_19, 
    'x__format_transcript__mutmut_20': x__format_transcript__mutmut_20, 
    'x__format_transcript__mutmut_21': x__format_transcript__mutmut_21, 
    'x__format_transcript__mutmut_22': x__format_transcript__mutmut_22, 
    'x__format_transcript__mutmut_23': x__format_transcript__mutmut_23, 
    'x__format_transcript__mutmut_24': x__format_transcript__mutmut_24, 
    'x__format_transcript__mutmut_25': x__format_transcript__mutmut_25, 
    'x__format_transcript__mutmut_26': x__format_transcript__mutmut_26, 
    'x__format_transcript__mutmut_27': x__format_transcript__mutmut_27, 
    'x__format_transcript__mutmut_28': x__format_transcript__mutmut_28, 
    'x__format_transcript__mutmut_29': x__format_transcript__mutmut_29, 
    'x__format_transcript__mutmut_30': x__format_transcript__mutmut_30, 
    'x__format_transcript__mutmut_31': x__format_transcript__mutmut_31, 
    'x__format_transcript__mutmut_32': x__format_transcript__mutmut_32, 
    'x__format_transcript__mutmut_33': x__format_transcript__mutmut_33, 
    'x__format_transcript__mutmut_34': x__format_transcript__mutmut_34, 
    'x__format_transcript__mutmut_35': x__format_transcript__mutmut_35, 
    'x__format_transcript__mutmut_36': x__format_transcript__mutmut_36, 
    'x__format_transcript__mutmut_37': x__format_transcript__mutmut_37, 
    'x__format_transcript__mutmut_38': x__format_transcript__mutmut_38, 
    'x__format_transcript__mutmut_39': x__format_transcript__mutmut_39, 
    'x__format_transcript__mutmut_40': x__format_transcript__mutmut_40, 
    'x__format_transcript__mutmut_41': x__format_transcript__mutmut_41, 
    'x__format_transcript__mutmut_42': x__format_transcript__mutmut_42, 
    'x__format_transcript__mutmut_43': x__format_transcript__mutmut_43, 
    'x__format_transcript__mutmut_44': x__format_transcript__mutmut_44, 
    'x__format_transcript__mutmut_45': x__format_transcript__mutmut_45, 
    'x__format_transcript__mutmut_46': x__format_transcript__mutmut_46, 
    'x__format_transcript__mutmut_47': x__format_transcript__mutmut_47, 
    'x__format_transcript__mutmut_48': x__format_transcript__mutmut_48, 
    'x__format_transcript__mutmut_49': x__format_transcript__mutmut_49, 
    'x__format_transcript__mutmut_50': x__format_transcript__mutmut_50, 
    'x__format_transcript__mutmut_51': x__format_transcript__mutmut_51, 
    'x__format_transcript__mutmut_52': x__format_transcript__mutmut_52, 
    'x__format_transcript__mutmut_53': x__format_transcript__mutmut_53, 
    'x__format_transcript__mutmut_54': x__format_transcript__mutmut_54, 
    'x__format_transcript__mutmut_55': x__format_transcript__mutmut_55, 
    'x__format_transcript__mutmut_56': x__format_transcript__mutmut_56, 
    'x__format_transcript__mutmut_57': x__format_transcript__mutmut_57, 
    'x__format_transcript__mutmut_58': x__format_transcript__mutmut_58, 
    'x__format_transcript__mutmut_59': x__format_transcript__mutmut_59, 
    'x__format_transcript__mutmut_60': x__format_transcript__mutmut_60, 
    'x__format_transcript__mutmut_61': x__format_transcript__mutmut_61, 
    'x__format_transcript__mutmut_62': x__format_transcript__mutmut_62, 
    'x__format_transcript__mutmut_63': x__format_transcript__mutmut_63, 
    'x__format_transcript__mutmut_64': x__format_transcript__mutmut_64, 
    'x__format_transcript__mutmut_65': x__format_transcript__mutmut_65, 
    'x__format_transcript__mutmut_66': x__format_transcript__mutmut_66, 
    'x__format_transcript__mutmut_67': x__format_transcript__mutmut_67, 
    'x__format_transcript__mutmut_68': x__format_transcript__mutmut_68, 
    'x__format_transcript__mutmut_69': x__format_transcript__mutmut_69, 
    'x__format_transcript__mutmut_70': x__format_transcript__mutmut_70, 
    'x__format_transcript__mutmut_71': x__format_transcript__mutmut_71, 
    'x__format_transcript__mutmut_72': x__format_transcript__mutmut_72, 
    'x__format_transcript__mutmut_73': x__format_transcript__mutmut_73, 
    'x__format_transcript__mutmut_74': x__format_transcript__mutmut_74, 
    'x__format_transcript__mutmut_75': x__format_transcript__mutmut_75, 
    'x__format_transcript__mutmut_76': x__format_transcript__mutmut_76, 
    'x__format_transcript__mutmut_77': x__format_transcript__mutmut_77, 
    'x__format_transcript__mutmut_78': x__format_transcript__mutmut_78, 
    'x__format_transcript__mutmut_79': x__format_transcript__mutmut_79, 
    'x__format_transcript__mutmut_80': x__format_transcript__mutmut_80, 
    'x__format_transcript__mutmut_81': x__format_transcript__mutmut_81, 
    'x__format_transcript__mutmut_82': x__format_transcript__mutmut_82, 
    'x__format_transcript__mutmut_83': x__format_transcript__mutmut_83, 
    'x__format_transcript__mutmut_84': x__format_transcript__mutmut_84, 
    'x__format_transcript__mutmut_85': x__format_transcript__mutmut_85, 
    'x__format_transcript__mutmut_86': x__format_transcript__mutmut_86, 
    'x__format_transcript__mutmut_87': x__format_transcript__mutmut_87, 
    'x__format_transcript__mutmut_88': x__format_transcript__mutmut_88, 
    'x__format_transcript__mutmut_89': x__format_transcript__mutmut_89, 
    'x__format_transcript__mutmut_90': x__format_transcript__mutmut_90
}
x__format_transcript__mutmut_orig.__name__ = 'x__format_transcript'


# ── Endpoints ─────────────────────────────────────────────────


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/episodes")
async def add_episode(req: AddEpisodeRequest):
    cached = _idempotency_check(req.idempotency_key)
    if cached is not None:
        logger.info("[gralkor] add-episode idempotent hit — key:%s uuid:%s",
                    req.idempotency_key, cached.get("uuid"))
        return cached

    logger.info("[gralkor] add-episode — group:%s name:%s bodyChars:%d source:%s",
                req.group_id, req.name, len(req.episode_body), req.source or "message")
    logger.debug("[gralkor] add-episode body:\n%s", req.episode_body)
    ref_time = (
        datetime.fromisoformat(req.reference_time)
        if req.reference_time
        else datetime.now(timezone.utc)
    )
    episode_type = EpisodeType(req.source) if req.source else EpisodeType.message
    t0 = time.monotonic()
    result = await graphiti.add_episode(
        name=req.name,
        episode_body=req.episode_body,
        source_description=req.source_description,
        group_id=req.group_id,
        reference_time=ref_time,
        source=episode_type,
        entity_types=ontology_entity_types,
        edge_types=ontology_edge_types,
        edge_type_map=ontology_edge_type_map,
        excluded_entity_types=ontology_excluded,
    )
    duration_ms = (time.monotonic() - t0) * 1000
    episode = result.episode
    logger.info("[gralkor] episode added — uuid:%s duration:%.0fms", episode.uuid, duration_ms)
    logger.debug("[gralkor] episode result: %s", _serialize_episode(episode))
    serialized = _serialize_episode(episode)
    _idempotency_store_result(req.idempotency_key, serialized)
    return serialized


@app.post("/ingest-messages")
async def ingest_messages(req: IngestMessagesRequest):
    cached = _idempotency_check(req.idempotency_key)
    if cached is not None:
        logger.info("[gralkor] ingest-messages idempotent hit — key:%s uuid:%s",
                    req.idempotency_key, cached.get("uuid"))
        return cached

    logger.info("[gralkor] ingest-messages — group:%s messages:%d", req.group_id, len(req.messages))
    ref_time = (
        datetime.fromisoformat(req.reference_time)
        if req.reference_time
        else datetime.now(timezone.utc)
    )
    llm = graphiti.llm_client if graphiti else None
    episode_body = await _format_transcript(req.messages, llm)

    logger.info("[gralkor] episode body — chars:%d lines:%d", len(episode_body), episode_body.count('\n') + 1)
    logger.debug("[gralkor] episode body:\n%s", episode_body)

    t0 = time.monotonic()
    result = await graphiti.add_episode(
        name=req.name,
        episode_body=episode_body,
        source_description=req.source_description,
        group_id=req.group_id,
        reference_time=ref_time,
        source=EpisodeType.message,
        entity_types=ontology_entity_types,
        edge_types=ontology_edge_types,
        edge_type_map=ontology_edge_type_map,
        excluded_entity_types=ontology_excluded,
    )
    duration_ms = (time.monotonic() - t0) * 1000
    episode = result.episode
    logger.info("[gralkor] episode added — uuid:%s duration:%.0fms", episode.uuid, duration_ms)
    logger.debug("[gralkor] episode result: %s", _serialize_episode(episode))
    serialized = _serialize_episode(episode)
    _idempotency_store_result(req.idempotency_key, serialized)
    return serialized


@app.get("/episodes")
async def get_episodes(group_id: str, limit: int = 10):
    _ensure_driver_graph([group_id])
    episodes = await graphiti.retrieve_episodes(
        reference_time=datetime.now(timezone.utc),
        last_n=limit,
        group_ids=[group_id],
    )
    return [_serialize_episode(ep) for ep in episodes]


@app.delete("/episodes/{uuid}")
async def delete_episode(uuid: str):
    await graphiti.remove_episode(uuid)
    return Response(status_code=204)


def _sanitize_query(query: str) -> str:
    args = [query]# type: ignore
    kwargs = {}# type: ignore
    return _mutmut_trampoline(x__sanitize_query__mutmut_orig, x__sanitize_query__mutmut_mutants, args, kwargs, None)


def x__sanitize_query__mutmut_orig(query: str) -> str:
    """Strip backticks that cause RediSearch syntax errors.

    graphiti-core's _SEPARATOR_MAP handles most special characters
    but misses backticks. We strip them at the API boundary.
    """
    return query.replace("`", " ")


def x__sanitize_query__mutmut_1(query: str) -> str:
    """Strip backticks that cause RediSearch syntax errors.

    graphiti-core's _SEPARATOR_MAP handles most special characters
    but misses backticks. We strip them at the API boundary.
    """
    return query.replace(None, " ")


def x__sanitize_query__mutmut_2(query: str) -> str:
    """Strip backticks that cause RediSearch syntax errors.

    graphiti-core's _SEPARATOR_MAP handles most special characters
    but misses backticks. We strip them at the API boundary.
    """
    return query.replace("`", None)


def x__sanitize_query__mutmut_3(query: str) -> str:
    """Strip backticks that cause RediSearch syntax errors.

    graphiti-core's _SEPARATOR_MAP handles most special characters
    but misses backticks. We strip them at the API boundary.
    """
    return query.replace(" ")


def x__sanitize_query__mutmut_4(query: str) -> str:
    """Strip backticks that cause RediSearch syntax errors.

    graphiti-core's _SEPARATOR_MAP handles most special characters
    but misses backticks. We strip them at the API boundary.
    """
    return query.replace("`", )


def x__sanitize_query__mutmut_5(query: str) -> str:
    """Strip backticks that cause RediSearch syntax errors.

    graphiti-core's _SEPARATOR_MAP handles most special characters
    but misses backticks. We strip them at the API boundary.
    """
    return query.replace("XX`XX", " ")


def x__sanitize_query__mutmut_6(query: str) -> str:
    """Strip backticks that cause RediSearch syntax errors.

    graphiti-core's _SEPARATOR_MAP handles most special characters
    but misses backticks. We strip them at the API boundary.
    """
    return query.replace("`", "XX XX")

x__sanitize_query__mutmut_mutants : ClassVar[MutantDict] = { # type: ignore
'x__sanitize_query__mutmut_1': x__sanitize_query__mutmut_1, 
    'x__sanitize_query__mutmut_2': x__sanitize_query__mutmut_2, 
    'x__sanitize_query__mutmut_3': x__sanitize_query__mutmut_3, 
    'x__sanitize_query__mutmut_4': x__sanitize_query__mutmut_4, 
    'x__sanitize_query__mutmut_5': x__sanitize_query__mutmut_5, 
    'x__sanitize_query__mutmut_6': x__sanitize_query__mutmut_6
}
x__sanitize_query__mutmut_orig.__name__ = 'x__sanitize_query'


def _ensure_driver_graph(group_ids: list[str] | None) -> None:
    args = [group_ids]# type: ignore
    kwargs = {}# type: ignore
    return _mutmut_trampoline(x__ensure_driver_graph__mutmut_orig, x__ensure_driver_graph__mutmut_mutants, args, kwargs, None)


def x__ensure_driver_graph__mutmut_orig(group_ids: list[str] | None) -> None:
    """Route graphiti's driver to the correct FalkorDB named graph.

    graphiti-core's add_episode() clones the driver when group_id differs from
    the current database (graphiti.py:887-889), but search() does not.  On fresh
    boot the driver targets 'default_db' — an empty graph — so searches return
    nothing until the first add_episode switches it.  This helper applies the
    same routing for read paths.
    """
    if not group_ids:
        return
    target = group_ids[0]
    if target != graphiti.driver._database:
        graphiti.driver = graphiti.driver.clone(database=target)
        graphiti.clients.driver = graphiti.driver
        print(f"[gralkor] driver graph routed: {target}", flush=True)


def x__ensure_driver_graph__mutmut_1(group_ids: list[str] | None) -> None:
    """Route graphiti's driver to the correct FalkorDB named graph.

    graphiti-core's add_episode() clones the driver when group_id differs from
    the current database (graphiti.py:887-889), but search() does not.  On fresh
    boot the driver targets 'default_db' — an empty graph — so searches return
    nothing until the first add_episode switches it.  This helper applies the
    same routing for read paths.
    """
    if group_ids:
        return
    target = group_ids[0]
    if target != graphiti.driver._database:
        graphiti.driver = graphiti.driver.clone(database=target)
        graphiti.clients.driver = graphiti.driver
        print(f"[gralkor] driver graph routed: {target}", flush=True)


def x__ensure_driver_graph__mutmut_2(group_ids: list[str] | None) -> None:
    """Route graphiti's driver to the correct FalkorDB named graph.

    graphiti-core's add_episode() clones the driver when group_id differs from
    the current database (graphiti.py:887-889), but search() does not.  On fresh
    boot the driver targets 'default_db' — an empty graph — so searches return
    nothing until the first add_episode switches it.  This helper applies the
    same routing for read paths.
    """
    if not group_ids:
        return
    target = None
    if target != graphiti.driver._database:
        graphiti.driver = graphiti.driver.clone(database=target)
        graphiti.clients.driver = graphiti.driver
        print(f"[gralkor] driver graph routed: {target}", flush=True)


def x__ensure_driver_graph__mutmut_3(group_ids: list[str] | None) -> None:
    """Route graphiti's driver to the correct FalkorDB named graph.

    graphiti-core's add_episode() clones the driver when group_id differs from
    the current database (graphiti.py:887-889), but search() does not.  On fresh
    boot the driver targets 'default_db' — an empty graph — so searches return
    nothing until the first add_episode switches it.  This helper applies the
    same routing for read paths.
    """
    if not group_ids:
        return
    target = group_ids[1]
    if target != graphiti.driver._database:
        graphiti.driver = graphiti.driver.clone(database=target)
        graphiti.clients.driver = graphiti.driver
        print(f"[gralkor] driver graph routed: {target}", flush=True)


def x__ensure_driver_graph__mutmut_4(group_ids: list[str] | None) -> None:
    """Route graphiti's driver to the correct FalkorDB named graph.

    graphiti-core's add_episode() clones the driver when group_id differs from
    the current database (graphiti.py:887-889), but search() does not.  On fresh
    boot the driver targets 'default_db' — an empty graph — so searches return
    nothing until the first add_episode switches it.  This helper applies the
    same routing for read paths.
    """
    if not group_ids:
        return
    target = group_ids[0]
    if target == graphiti.driver._database:
        graphiti.driver = graphiti.driver.clone(database=target)
        graphiti.clients.driver = graphiti.driver
        print(f"[gralkor] driver graph routed: {target}", flush=True)


def x__ensure_driver_graph__mutmut_5(group_ids: list[str] | None) -> None:
    """Route graphiti's driver to the correct FalkorDB named graph.

    graphiti-core's add_episode() clones the driver when group_id differs from
    the current database (graphiti.py:887-889), but search() does not.  On fresh
    boot the driver targets 'default_db' — an empty graph — so searches return
    nothing until the first add_episode switches it.  This helper applies the
    same routing for read paths.
    """
    if not group_ids:
        return
    target = group_ids[0]
    if target != graphiti.driver._database:
        graphiti.driver = None
        graphiti.clients.driver = graphiti.driver
        print(f"[gralkor] driver graph routed: {target}", flush=True)


def x__ensure_driver_graph__mutmut_6(group_ids: list[str] | None) -> None:
    """Route graphiti's driver to the correct FalkorDB named graph.

    graphiti-core's add_episode() clones the driver when group_id differs from
    the current database (graphiti.py:887-889), but search() does not.  On fresh
    boot the driver targets 'default_db' — an empty graph — so searches return
    nothing until the first add_episode switches it.  This helper applies the
    same routing for read paths.
    """
    if not group_ids:
        return
    target = group_ids[0]
    if target != graphiti.driver._database:
        graphiti.driver = graphiti.driver.clone(database=None)
        graphiti.clients.driver = graphiti.driver
        print(f"[gralkor] driver graph routed: {target}", flush=True)


def x__ensure_driver_graph__mutmut_7(group_ids: list[str] | None) -> None:
    """Route graphiti's driver to the correct FalkorDB named graph.

    graphiti-core's add_episode() clones the driver when group_id differs from
    the current database (graphiti.py:887-889), but search() does not.  On fresh
    boot the driver targets 'default_db' — an empty graph — so searches return
    nothing until the first add_episode switches it.  This helper applies the
    same routing for read paths.
    """
    if not group_ids:
        return
    target = group_ids[0]
    if target != graphiti.driver._database:
        graphiti.driver = graphiti.driver.clone(database=target)
        graphiti.clients.driver = None
        print(f"[gralkor] driver graph routed: {target}", flush=True)


def x__ensure_driver_graph__mutmut_8(group_ids: list[str] | None) -> None:
    """Route graphiti's driver to the correct FalkorDB named graph.

    graphiti-core's add_episode() clones the driver when group_id differs from
    the current database (graphiti.py:887-889), but search() does not.  On fresh
    boot the driver targets 'default_db' — an empty graph — so searches return
    nothing until the first add_episode switches it.  This helper applies the
    same routing for read paths.
    """
    if not group_ids:
        return
    target = group_ids[0]
    if target != graphiti.driver._database:
        graphiti.driver = graphiti.driver.clone(database=target)
        graphiti.clients.driver = graphiti.driver
        print(None, flush=True)


def x__ensure_driver_graph__mutmut_9(group_ids: list[str] | None) -> None:
    """Route graphiti's driver to the correct FalkorDB named graph.

    graphiti-core's add_episode() clones the driver when group_id differs from
    the current database (graphiti.py:887-889), but search() does not.  On fresh
    boot the driver targets 'default_db' — an empty graph — so searches return
    nothing until the first add_episode switches it.  This helper applies the
    same routing for read paths.
    """
    if not group_ids:
        return
    target = group_ids[0]
    if target != graphiti.driver._database:
        graphiti.driver = graphiti.driver.clone(database=target)
        graphiti.clients.driver = graphiti.driver
        print(f"[gralkor] driver graph routed: {target}", flush=None)


def x__ensure_driver_graph__mutmut_10(group_ids: list[str] | None) -> None:
    """Route graphiti's driver to the correct FalkorDB named graph.

    graphiti-core's add_episode() clones the driver when group_id differs from
    the current database (graphiti.py:887-889), but search() does not.  On fresh
    boot the driver targets 'default_db' — an empty graph — so searches return
    nothing until the first add_episode switches it.  This helper applies the
    same routing for read paths.
    """
    if not group_ids:
        return
    target = group_ids[0]
    if target != graphiti.driver._database:
        graphiti.driver = graphiti.driver.clone(database=target)
        graphiti.clients.driver = graphiti.driver
        print(flush=True)


def x__ensure_driver_graph__mutmut_11(group_ids: list[str] | None) -> None:
    """Route graphiti's driver to the correct FalkorDB named graph.

    graphiti-core's add_episode() clones the driver when group_id differs from
    the current database (graphiti.py:887-889), but search() does not.  On fresh
    boot the driver targets 'default_db' — an empty graph — so searches return
    nothing until the first add_episode switches it.  This helper applies the
    same routing for read paths.
    """
    if not group_ids:
        return
    target = group_ids[0]
    if target != graphiti.driver._database:
        graphiti.driver = graphiti.driver.clone(database=target)
        graphiti.clients.driver = graphiti.driver
        print(f"[gralkor] driver graph routed: {target}", )


def x__ensure_driver_graph__mutmut_12(group_ids: list[str] | None) -> None:
    """Route graphiti's driver to the correct FalkorDB named graph.

    graphiti-core's add_episode() clones the driver when group_id differs from
    the current database (graphiti.py:887-889), but search() does not.  On fresh
    boot the driver targets 'default_db' — an empty graph — so searches return
    nothing until the first add_episode switches it.  This helper applies the
    same routing for read paths.
    """
    if not group_ids:
        return
    target = group_ids[0]
    if target != graphiti.driver._database:
        graphiti.driver = graphiti.driver.clone(database=target)
        graphiti.clients.driver = graphiti.driver
        print(f"[gralkor] driver graph routed: {target}", flush=False)

x__ensure_driver_graph__mutmut_mutants : ClassVar[MutantDict] = { # type: ignore
'x__ensure_driver_graph__mutmut_1': x__ensure_driver_graph__mutmut_1, 
    'x__ensure_driver_graph__mutmut_2': x__ensure_driver_graph__mutmut_2, 
    'x__ensure_driver_graph__mutmut_3': x__ensure_driver_graph__mutmut_3, 
    'x__ensure_driver_graph__mutmut_4': x__ensure_driver_graph__mutmut_4, 
    'x__ensure_driver_graph__mutmut_5': x__ensure_driver_graph__mutmut_5, 
    'x__ensure_driver_graph__mutmut_6': x__ensure_driver_graph__mutmut_6, 
    'x__ensure_driver_graph__mutmut_7': x__ensure_driver_graph__mutmut_7, 
    'x__ensure_driver_graph__mutmut_8': x__ensure_driver_graph__mutmut_8, 
    'x__ensure_driver_graph__mutmut_9': x__ensure_driver_graph__mutmut_9, 
    'x__ensure_driver_graph__mutmut_10': x__ensure_driver_graph__mutmut_10, 
    'x__ensure_driver_graph__mutmut_11': x__ensure_driver_graph__mutmut_11, 
    'x__ensure_driver_graph__mutmut_12': x__ensure_driver_graph__mutmut_12
}
x__ensure_driver_graph__mutmut_orig.__name__ = 'x__ensure_driver_graph'


def _prioritize_facts(
    edges: list[EntityEdge], limit: int, reserved_ratio: float = 0.7,
) -> list[EntityEdge]:
    args = [edges, limit, reserved_ratio]# type: ignore
    kwargs = {}# type: ignore
    return _mutmut_trampoline(x__prioritize_facts__mutmut_orig, x__prioritize_facts__mutmut_mutants, args, kwargs, None)


def x__prioritize_facts__mutmut_orig(
    edges: list[EntityEdge], limit: int, reserved_ratio: float = 0.7,
) -> list[EntityEdge]:
    """Reserve slots for valid facts, fill the rest by relevance.

    First ~70% of slots are reserved for valid facts (no invalid_at).
    Remaining slots are filled from whatever Graphiti ranked highest
    among the leftovers — valid or not — preserving relevance scoring.
    """
    reserved_count = max(1, round(limit * reserved_ratio))

    reserved: list[EntityEdge] = []
    rest: list[EntityEdge] = []
    for e in edges:
        if len(reserved) < reserved_count and e.invalid_at is None:
            reserved.append(e)
        else:
            rest.append(e)

    remainder_count = limit - len(reserved)
    return reserved + rest[:remainder_count]


def x__prioritize_facts__mutmut_1(
    edges: list[EntityEdge], limit: int, reserved_ratio: float = 1.7,
) -> list[EntityEdge]:
    """Reserve slots for valid facts, fill the rest by relevance.

    First ~70% of slots are reserved for valid facts (no invalid_at).
    Remaining slots are filled from whatever Graphiti ranked highest
    among the leftovers — valid or not — preserving relevance scoring.
    """
    reserved_count = max(1, round(limit * reserved_ratio))

    reserved: list[EntityEdge] = []
    rest: list[EntityEdge] = []
    for e in edges:
        if len(reserved) < reserved_count and e.invalid_at is None:
            reserved.append(e)
        else:
            rest.append(e)

    remainder_count = limit - len(reserved)
    return reserved + rest[:remainder_count]


def x__prioritize_facts__mutmut_2(
    edges: list[EntityEdge], limit: int, reserved_ratio: float = 0.7,
) -> list[EntityEdge]:
    """Reserve slots for valid facts, fill the rest by relevance.

    First ~70% of slots are reserved for valid facts (no invalid_at).
    Remaining slots are filled from whatever Graphiti ranked highest
    among the leftovers — valid or not — preserving relevance scoring.
    """
    reserved_count = None

    reserved: list[EntityEdge] = []
    rest: list[EntityEdge] = []
    for e in edges:
        if len(reserved) < reserved_count and e.invalid_at is None:
            reserved.append(e)
        else:
            rest.append(e)

    remainder_count = limit - len(reserved)
    return reserved + rest[:remainder_count]


def x__prioritize_facts__mutmut_3(
    edges: list[EntityEdge], limit: int, reserved_ratio: float = 0.7,
) -> list[EntityEdge]:
    """Reserve slots for valid facts, fill the rest by relevance.

    First ~70% of slots are reserved for valid facts (no invalid_at).
    Remaining slots are filled from whatever Graphiti ranked highest
    among the leftovers — valid or not — preserving relevance scoring.
    """
    reserved_count = max(None, round(limit * reserved_ratio))

    reserved: list[EntityEdge] = []
    rest: list[EntityEdge] = []
    for e in edges:
        if len(reserved) < reserved_count and e.invalid_at is None:
            reserved.append(e)
        else:
            rest.append(e)

    remainder_count = limit - len(reserved)
    return reserved + rest[:remainder_count]


def x__prioritize_facts__mutmut_4(
    edges: list[EntityEdge], limit: int, reserved_ratio: float = 0.7,
) -> list[EntityEdge]:
    """Reserve slots for valid facts, fill the rest by relevance.

    First ~70% of slots are reserved for valid facts (no invalid_at).
    Remaining slots are filled from whatever Graphiti ranked highest
    among the leftovers — valid or not — preserving relevance scoring.
    """
    reserved_count = max(1, None)

    reserved: list[EntityEdge] = []
    rest: list[EntityEdge] = []
    for e in edges:
        if len(reserved) < reserved_count and e.invalid_at is None:
            reserved.append(e)
        else:
            rest.append(e)

    remainder_count = limit - len(reserved)
    return reserved + rest[:remainder_count]


def x__prioritize_facts__mutmut_5(
    edges: list[EntityEdge], limit: int, reserved_ratio: float = 0.7,
) -> list[EntityEdge]:
    """Reserve slots for valid facts, fill the rest by relevance.

    First ~70% of slots are reserved for valid facts (no invalid_at).
    Remaining slots are filled from whatever Graphiti ranked highest
    among the leftovers — valid or not — preserving relevance scoring.
    """
    reserved_count = max(round(limit * reserved_ratio))

    reserved: list[EntityEdge] = []
    rest: list[EntityEdge] = []
    for e in edges:
        if len(reserved) < reserved_count and e.invalid_at is None:
            reserved.append(e)
        else:
            rest.append(e)

    remainder_count = limit - len(reserved)
    return reserved + rest[:remainder_count]


def x__prioritize_facts__mutmut_6(
    edges: list[EntityEdge], limit: int, reserved_ratio: float = 0.7,
) -> list[EntityEdge]:
    """Reserve slots for valid facts, fill the rest by relevance.

    First ~70% of slots are reserved for valid facts (no invalid_at).
    Remaining slots are filled from whatever Graphiti ranked highest
    among the leftovers — valid or not — preserving relevance scoring.
    """
    reserved_count = max(1, )

    reserved: list[EntityEdge] = []
    rest: list[EntityEdge] = []
    for e in edges:
        if len(reserved) < reserved_count and e.invalid_at is None:
            reserved.append(e)
        else:
            rest.append(e)

    remainder_count = limit - len(reserved)
    return reserved + rest[:remainder_count]


def x__prioritize_facts__mutmut_7(
    edges: list[EntityEdge], limit: int, reserved_ratio: float = 0.7,
) -> list[EntityEdge]:
    """Reserve slots for valid facts, fill the rest by relevance.

    First ~70% of slots are reserved for valid facts (no invalid_at).
    Remaining slots are filled from whatever Graphiti ranked highest
    among the leftovers — valid or not — preserving relevance scoring.
    """
    reserved_count = max(2, round(limit * reserved_ratio))

    reserved: list[EntityEdge] = []
    rest: list[EntityEdge] = []
    for e in edges:
        if len(reserved) < reserved_count and e.invalid_at is None:
            reserved.append(e)
        else:
            rest.append(e)

    remainder_count = limit - len(reserved)
    return reserved + rest[:remainder_count]


def x__prioritize_facts__mutmut_8(
    edges: list[EntityEdge], limit: int, reserved_ratio: float = 0.7,
) -> list[EntityEdge]:
    """Reserve slots for valid facts, fill the rest by relevance.

    First ~70% of slots are reserved for valid facts (no invalid_at).
    Remaining slots are filled from whatever Graphiti ranked highest
    among the leftovers — valid or not — preserving relevance scoring.
    """
    reserved_count = max(1, round(None))

    reserved: list[EntityEdge] = []
    rest: list[EntityEdge] = []
    for e in edges:
        if len(reserved) < reserved_count and e.invalid_at is None:
            reserved.append(e)
        else:
            rest.append(e)

    remainder_count = limit - len(reserved)
    return reserved + rest[:remainder_count]


def x__prioritize_facts__mutmut_9(
    edges: list[EntityEdge], limit: int, reserved_ratio: float = 0.7,
) -> list[EntityEdge]:
    """Reserve slots for valid facts, fill the rest by relevance.

    First ~70% of slots are reserved for valid facts (no invalid_at).
    Remaining slots are filled from whatever Graphiti ranked highest
    among the leftovers — valid or not — preserving relevance scoring.
    """
    reserved_count = max(1, round(limit / reserved_ratio))

    reserved: list[EntityEdge] = []
    rest: list[EntityEdge] = []
    for e in edges:
        if len(reserved) < reserved_count and e.invalid_at is None:
            reserved.append(e)
        else:
            rest.append(e)

    remainder_count = limit - len(reserved)
    return reserved + rest[:remainder_count]


def x__prioritize_facts__mutmut_10(
    edges: list[EntityEdge], limit: int, reserved_ratio: float = 0.7,
) -> list[EntityEdge]:
    """Reserve slots for valid facts, fill the rest by relevance.

    First ~70% of slots are reserved for valid facts (no invalid_at).
    Remaining slots are filled from whatever Graphiti ranked highest
    among the leftovers — valid or not — preserving relevance scoring.
    """
    reserved_count = max(1, round(limit * reserved_ratio))

    reserved: list[EntityEdge] = None
    rest: list[EntityEdge] = []
    for e in edges:
        if len(reserved) < reserved_count and e.invalid_at is None:
            reserved.append(e)
        else:
            rest.append(e)

    remainder_count = limit - len(reserved)
    return reserved + rest[:remainder_count]


def x__prioritize_facts__mutmut_11(
    edges: list[EntityEdge], limit: int, reserved_ratio: float = 0.7,
) -> list[EntityEdge]:
    """Reserve slots for valid facts, fill the rest by relevance.

    First ~70% of slots are reserved for valid facts (no invalid_at).
    Remaining slots are filled from whatever Graphiti ranked highest
    among the leftovers — valid or not — preserving relevance scoring.
    """
    reserved_count = max(1, round(limit * reserved_ratio))

    reserved: list[EntityEdge] = []
    rest: list[EntityEdge] = None
    for e in edges:
        if len(reserved) < reserved_count and e.invalid_at is None:
            reserved.append(e)
        else:
            rest.append(e)

    remainder_count = limit - len(reserved)
    return reserved + rest[:remainder_count]


def x__prioritize_facts__mutmut_12(
    edges: list[EntityEdge], limit: int, reserved_ratio: float = 0.7,
) -> list[EntityEdge]:
    """Reserve slots for valid facts, fill the rest by relevance.

    First ~70% of slots are reserved for valid facts (no invalid_at).
    Remaining slots are filled from whatever Graphiti ranked highest
    among the leftovers — valid or not — preserving relevance scoring.
    """
    reserved_count = max(1, round(limit * reserved_ratio))

    reserved: list[EntityEdge] = []
    rest: list[EntityEdge] = []
    for e in edges:
        if len(reserved) < reserved_count or e.invalid_at is None:
            reserved.append(e)
        else:
            rest.append(e)

    remainder_count = limit - len(reserved)
    return reserved + rest[:remainder_count]


def x__prioritize_facts__mutmut_13(
    edges: list[EntityEdge], limit: int, reserved_ratio: float = 0.7,
) -> list[EntityEdge]:
    """Reserve slots for valid facts, fill the rest by relevance.

    First ~70% of slots are reserved for valid facts (no invalid_at).
    Remaining slots are filled from whatever Graphiti ranked highest
    among the leftovers — valid or not — preserving relevance scoring.
    """
    reserved_count = max(1, round(limit * reserved_ratio))

    reserved: list[EntityEdge] = []
    rest: list[EntityEdge] = []
    for e in edges:
        if len(reserved) <= reserved_count and e.invalid_at is None:
            reserved.append(e)
        else:
            rest.append(e)

    remainder_count = limit - len(reserved)
    return reserved + rest[:remainder_count]


def x__prioritize_facts__mutmut_14(
    edges: list[EntityEdge], limit: int, reserved_ratio: float = 0.7,
) -> list[EntityEdge]:
    """Reserve slots for valid facts, fill the rest by relevance.

    First ~70% of slots are reserved for valid facts (no invalid_at).
    Remaining slots are filled from whatever Graphiti ranked highest
    among the leftovers — valid or not — preserving relevance scoring.
    """
    reserved_count = max(1, round(limit * reserved_ratio))

    reserved: list[EntityEdge] = []
    rest: list[EntityEdge] = []
    for e in edges:
        if len(reserved) < reserved_count and e.invalid_at is not None:
            reserved.append(e)
        else:
            rest.append(e)

    remainder_count = limit - len(reserved)
    return reserved + rest[:remainder_count]


def x__prioritize_facts__mutmut_15(
    edges: list[EntityEdge], limit: int, reserved_ratio: float = 0.7,
) -> list[EntityEdge]:
    """Reserve slots for valid facts, fill the rest by relevance.

    First ~70% of slots are reserved for valid facts (no invalid_at).
    Remaining slots are filled from whatever Graphiti ranked highest
    among the leftovers — valid or not — preserving relevance scoring.
    """
    reserved_count = max(1, round(limit * reserved_ratio))

    reserved: list[EntityEdge] = []
    rest: list[EntityEdge] = []
    for e in edges:
        if len(reserved) < reserved_count and e.invalid_at is None:
            reserved.append(None)
        else:
            rest.append(e)

    remainder_count = limit - len(reserved)
    return reserved + rest[:remainder_count]


def x__prioritize_facts__mutmut_16(
    edges: list[EntityEdge], limit: int, reserved_ratio: float = 0.7,
) -> list[EntityEdge]:
    """Reserve slots for valid facts, fill the rest by relevance.

    First ~70% of slots are reserved for valid facts (no invalid_at).
    Remaining slots are filled from whatever Graphiti ranked highest
    among the leftovers — valid or not — preserving relevance scoring.
    """
    reserved_count = max(1, round(limit * reserved_ratio))

    reserved: list[EntityEdge] = []
    rest: list[EntityEdge] = []
    for e in edges:
        if len(reserved) < reserved_count and e.invalid_at is None:
            reserved.append(e)
        else:
            rest.append(None)

    remainder_count = limit - len(reserved)
    return reserved + rest[:remainder_count]


def x__prioritize_facts__mutmut_17(
    edges: list[EntityEdge], limit: int, reserved_ratio: float = 0.7,
) -> list[EntityEdge]:
    """Reserve slots for valid facts, fill the rest by relevance.

    First ~70% of slots are reserved for valid facts (no invalid_at).
    Remaining slots are filled from whatever Graphiti ranked highest
    among the leftovers — valid or not — preserving relevance scoring.
    """
    reserved_count = max(1, round(limit * reserved_ratio))

    reserved: list[EntityEdge] = []
    rest: list[EntityEdge] = []
    for e in edges:
        if len(reserved) < reserved_count and e.invalid_at is None:
            reserved.append(e)
        else:
            rest.append(e)

    remainder_count = None
    return reserved + rest[:remainder_count]


def x__prioritize_facts__mutmut_18(
    edges: list[EntityEdge], limit: int, reserved_ratio: float = 0.7,
) -> list[EntityEdge]:
    """Reserve slots for valid facts, fill the rest by relevance.

    First ~70% of slots are reserved for valid facts (no invalid_at).
    Remaining slots are filled from whatever Graphiti ranked highest
    among the leftovers — valid or not — preserving relevance scoring.
    """
    reserved_count = max(1, round(limit * reserved_ratio))

    reserved: list[EntityEdge] = []
    rest: list[EntityEdge] = []
    for e in edges:
        if len(reserved) < reserved_count and e.invalid_at is None:
            reserved.append(e)
        else:
            rest.append(e)

    remainder_count = limit + len(reserved)
    return reserved + rest[:remainder_count]


def x__prioritize_facts__mutmut_19(
    edges: list[EntityEdge], limit: int, reserved_ratio: float = 0.7,
) -> list[EntityEdge]:
    """Reserve slots for valid facts, fill the rest by relevance.

    First ~70% of slots are reserved for valid facts (no invalid_at).
    Remaining slots are filled from whatever Graphiti ranked highest
    among the leftovers — valid or not — preserving relevance scoring.
    """
    reserved_count = max(1, round(limit * reserved_ratio))

    reserved: list[EntityEdge] = []
    rest: list[EntityEdge] = []
    for e in edges:
        if len(reserved) < reserved_count and e.invalid_at is None:
            reserved.append(e)
        else:
            rest.append(e)

    remainder_count = limit - len(reserved)
    return reserved - rest[:remainder_count]

x__prioritize_facts__mutmut_mutants : ClassVar[MutantDict] = { # type: ignore
'x__prioritize_facts__mutmut_1': x__prioritize_facts__mutmut_1, 
    'x__prioritize_facts__mutmut_2': x__prioritize_facts__mutmut_2, 
    'x__prioritize_facts__mutmut_3': x__prioritize_facts__mutmut_3, 
    'x__prioritize_facts__mutmut_4': x__prioritize_facts__mutmut_4, 
    'x__prioritize_facts__mutmut_5': x__prioritize_facts__mutmut_5, 
    'x__prioritize_facts__mutmut_6': x__prioritize_facts__mutmut_6, 
    'x__prioritize_facts__mutmut_7': x__prioritize_facts__mutmut_7, 
    'x__prioritize_facts__mutmut_8': x__prioritize_facts__mutmut_8, 
    'x__prioritize_facts__mutmut_9': x__prioritize_facts__mutmut_9, 
    'x__prioritize_facts__mutmut_10': x__prioritize_facts__mutmut_10, 
    'x__prioritize_facts__mutmut_11': x__prioritize_facts__mutmut_11, 
    'x__prioritize_facts__mutmut_12': x__prioritize_facts__mutmut_12, 
    'x__prioritize_facts__mutmut_13': x__prioritize_facts__mutmut_13, 
    'x__prioritize_facts__mutmut_14': x__prioritize_facts__mutmut_14, 
    'x__prioritize_facts__mutmut_15': x__prioritize_facts__mutmut_15, 
    'x__prioritize_facts__mutmut_16': x__prioritize_facts__mutmut_16, 
    'x__prioritize_facts__mutmut_17': x__prioritize_facts__mutmut_17, 
    'x__prioritize_facts__mutmut_18': x__prioritize_facts__mutmut_18, 
    'x__prioritize_facts__mutmut_19': x__prioritize_facts__mutmut_19
}
x__prioritize_facts__mutmut_orig.__name__ = 'x__prioritize_facts'


@app.post("/search")
async def search(req: SearchRequest):
    logger.info("[gralkor] search — query:%d chars group_ids:%s num_results:%d",
                len(req.query), req.group_ids, req.num_results)
    # graphiti.add_episode() clones the driver to target the correct FalkorDB
    # named graph (database=group_id), but graphiti.search() does not — it just
    # uses whatever graph the driver currently points at. Before the first
    # add_episode, the driver targets 'default_db' (an empty graph), so all
    # searches return 0 results. Fix: route to the correct graph here.
    _ensure_driver_graph(req.group_ids)
    t0 = time.monotonic()
    # Over-fetch to compensate for expired facts that will be deprioritized.
    fetch_limit = req.num_results * 2
    try:
        edges = await graphiti.search(
            query=_sanitize_query(req.query),
            group_ids=req.group_ids,
            num_results=fetch_limit,
        )
    except Exception as e:
        duration_ms = (time.monotonic() - t0) * 1000
        logger.error("[gralkor] search failed — %.0fms: %s", duration_ms, e)
        raise
    duration_ms = (time.monotonic() - t0) * 1000
    prioritized = _prioritize_facts(edges, req.num_results)
    valid_count = sum(1 for e in prioritized if e.invalid_at is None)
    result = [_serialize_fact(e) for e in prioritized]
    logger.info("[gralkor] search result — %d facts (%d valid, %d non-valid) from %d fetched %.0fms",
                len(prioritized), valid_count, len(prioritized) - valid_count, len(edges), duration_ms)
    logger.debug("[gralkor] search facts: %s", result)
    return {"facts": result}


@app.delete("/edges/{uuid}")
async def delete_edge(uuid: str):
    driver = graphiti.driver
    edge = await EntityEdge.get_by_uuid(driver, uuid)
    await edge.delete(driver)
    return Response(status_code=204)


@app.post("/clear")
async def clear_graph(req: GroupIdRequest):
    _ensure_driver_graph([req.group_id])
    driver = graphiti.driver
    await Node.delete_by_group_id(driver, req.group_id)
    return {"deleted": True}


@app.post("/build-indices")
async def build_indices():
    await graphiti.build_indices_and_constraints()
    return {"status": "ok"}


@app.post("/build-communities")
async def build_communities(req: GroupIdRequest):
    _ensure_driver_graph([req.group_id])
    communities, edges = await graphiti.build_communities(
        group_ids=[req.group_id],
    )
    return {"communities": len(communities), "edges": len(edges)}
