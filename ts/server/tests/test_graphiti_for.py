"""Tests for the `_graphiti_for(group_id)` factory in `server/main.py`."""

from __future__ import annotations

from unittest.mock import Mock

import pytest

import main as main_mod
from graphiti_core import Graphiti
from graphiti_core.cross_encoder.client import CrossEncoderClient
from graphiti_core.embedder.client import EmbedderClient
from graphiti_core.llm_client.client import LLMClient


@pytest.fixture
def stubbed_module_state():
    """Replace module-level resources with non-None stubs so the factory's
    Graphiti + FalkorDriver constructors don't attempt real connections.

    Resets the per-group instance store so each test starts clean.
    """
    original = (
        main_mod._falkor_db,
        main_mod._llm_client,
        main_mod._embedder,
        main_mod._cross_encoder,
    )
    main_mod._falkor_db = Mock()
    main_mod._llm_client = Mock(spec=LLMClient)
    main_mod._embedder = Mock(spec=EmbedderClient)
    main_mod._cross_encoder = Mock(spec=CrossEncoderClient)
    main_mod._graphiti_instances.clear()
    yield
    main_mod._graphiti_instances.clear()
    (
        main_mod._falkor_db,
        main_mod._llm_client,
        main_mod._embedder,
        main_mod._cross_encoder,
    ) = original


class TestGraphitiFor:
    class TestWhenCalledWithAGroupId:
        def test_then_returns_a_graphiti_scoped_to_that_group_id(self, stubbed_module_state):
            g = main_mod._graphiti_for("alice")
            assert isinstance(g, Graphiti)
            assert g.driver._database == "alice"

    class TestWhenCalledTwiceWithTheSameGroupId:
        def test_then_returns_the_same_instance_both_times(self, stubbed_module_state):
            first = main_mod._graphiti_for("alice")
            second = main_mod._graphiti_for("alice")
            assert first is second

    class TestWhenCalledWithDifferentGroupIds:
        def test_then_returns_different_instances(self, stubbed_module_state):
            alice = main_mod._graphiti_for("alice")
            bob = main_mod._graphiti_for("bob")
            assert alice is not bob
