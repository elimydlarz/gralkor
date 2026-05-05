"""Tests for _build_ontology() dynamic Pydantic model building."""

from datetime import datetime
from typing import get_type_hints, Literal, get_args, get_origin

import pytest
import yaml
from pydantic import BaseModel

from main import _build_ontology


class TestBuildOntology:
    """_build_ontology()"""

    class TestWhenNoOntologyInConfig:
        """when no ontology in config"""

        def test_returns_all_none(self):
            """then returns all None"""
            result = _build_ontology({})
            assert result == (None, None, None)

        def test_returns_all_none_for_empty_ontology(self):
            """then returns all None for empty ontology dict"""
            result = _build_ontology({"ontology": {}})
            assert result == (None, None, None)

    class TestWhenEntitiesHaveStringAttributes:
        """when entities have string attributes"""

        def test_builds_model_with_required_str_fields(self):
            """then builds model with required str fields"""
            cfg = {
                "ontology": {
                    "entities": {
                        "Project": {
                            "description": "A software project.",
                            "attributes": {
                                "language": "Primary programming language",
                            },
                        }
                    }
                }
            }
            entities, _, _ = _build_ontology(cfg)
            assert "Project" in entities
            model = entities["Project"]
            assert issubclass(model, BaseModel)
            hints = get_type_hints(model)
            assert hints["language"] is str

        def test_sets_docstring_from_description(self):
            """then sets __doc__ from description"""
            cfg = {
                "ontology": {
                    "entities": {
                        "Project": {
                            "description": "A software project.",
                            "attributes": {"language": "Primary programming language"},
                        }
                    }
                }
            }
            entities, _, _ = _build_ontology(cfg)
            assert entities["Project"].__doc__ == "A software project."

    class TestWhenEntitiesHaveEnumAttributes:
        """when entities have enum (array) attributes"""

        def test_builds_model_with_literal_field(self):
            """then builds model with Literal enum field"""
            cfg = {
                "ontology": {
                    "entities": {
                        "Project": {
                            "description": "A project.",
                            "attributes": {
                                "status": ["active", "completed", "paused"],
                            },
                        }
                    }
                }
            }
            entities, _, _ = _build_ontology(cfg)
            hints = get_type_hints(entities["Project"])
            assert get_origin(hints["status"]) is Literal
            assert set(get_args(hints["status"])) == {"active", "completed", "paused"}

    class TestWhenEntitiesHaveTypedObjectAttributes:
        """when entities have typed object attributes"""

        @pytest.mark.parametrize(
            "type_str,expected_type",
            [
                ("string", str),
                ("int", int),
                ("float", float),
                ("bool", bool),
                ("datetime", datetime),
            ],
        )
        def test_builds_model_with_correct_type(self, type_str, expected_type):
            """then builds model with correct Python type"""
            cfg = {
                "ontology": {
                    "entities": {
                        "Thing": {
                            "description": "A thing.",
                            "attributes": {
                                "field": {"type": type_str, "description": "A field"},
                            },
                        }
                    }
                }
            }
            entities, _, _ = _build_ontology(cfg)
            hints = get_type_hints(entities["Thing"])
            assert hints["field"] is expected_type

    class TestWhenEntitiesHaveEnumObjectAttributes:
        """when entities have enum object attributes"""

        def test_builds_model_with_literal_and_description(self):
            """then builds model with Literal field"""
            cfg = {
                "ontology": {
                    "entities": {
                        "Task": {
                            "description": "A task.",
                            "attributes": {
                                "priority": {
                                    "enum": ["low", "medium", "high"],
                                    "description": "Priority level",
                                },
                            },
                        }
                    }
                }
            }
            entities, _, _ = _build_ontology(cfg)
            hints = get_type_hints(entities["Task"])
            assert get_origin(hints["priority"]) is Literal
            assert set(get_args(hints["priority"])) == {"low", "medium", "high"}

    class TestWhenEdgesAreDefined:
        """when edges are defined"""

        def test_builds_edge_models(self):
            """then builds edge models with attributes"""
            cfg = {
                "ontology": {
                    "edges": {
                        "WorksOn": {
                            "description": "Person works on project.",
                            "attributes": {"role": "Their role"},
                        }
                    }
                }
            }
            _, edges, _ = _build_ontology(cfg)
            assert "WorksOn" in edges
            assert issubclass(edges["WorksOn"], BaseModel)
            hints = get_type_hints(edges["WorksOn"])
            assert hints["role"] is str

    class TestWhenEdgeMapIsDefined:
        """when edgeMap is defined"""

        def test_converts_string_keys_to_tuples(self):
            """then converts comma-separated keys to tuple pairs"""
            cfg = {
                "ontology": {
                    "entities": {
                        "Person": {"description": "A person."},
                        "Project": {"description": "A project."},
                    },
                    "edges": {
                        "WorksOn": {"description": "Works on."},
                    },
                    "edgeMap": {
                        "Person,Project": ["WorksOn"],
                    },
                }
            }
            _, _, edge_type_map = _build_ontology(cfg)
            assert ("Person", "Project") in edge_type_map
            assert edge_type_map[("Person", "Project")] == ["WorksOn"]

    class TestWhenEntitiesHaveNoAttributes:
        """when entities have no attributes"""

        def test_builds_model_with_no_fields(self):
            """then builds model with no custom fields"""
            cfg = {
                "ontology": {
                    "entities": {
                        "Preference": {"description": "A user preference."},
                    }
                }
            }
            entities, _, _ = _build_ontology(cfg)
            assert "Preference" in entities
            assert entities["Preference"].__doc__ == "A user preference."

    class TestWhenEntityHasMixedAttributeTypes:
        """when entity has mixed attribute types"""

        def test_builds_model_with_all_field_types(self):
            """then builds model with all field types correctly"""
            cfg = {
                "ontology": {
                    "entities": {
                        "Project": {
                            "description": "A project.",
                            "attributes": {
                                "language": "Primary language",
                                "status": ["active", "paused"],
                                "budget": {"type": "float", "description": "Budget"},
                                "priority": {"enum": ["low", "high"], "description": "Priority"},
                            },
                        }
                    }
                }
            }
            entities, _, _ = _build_ontology(cfg)
            hints = get_type_hints(entities["Project"])
            assert hints["language"] is str
            assert get_origin(hints["status"]) is Literal
            assert hints["budget"] is float
            assert get_origin(hints["priority"]) is Literal


class TestYamlRoundTrip:
    """YAML round-trip (TS serializer output → Python yaml.safe_load → _build_ontology)"""

    # This YAML matches what serializeOntologyYaml() produces for a representative
    # ontology with all attribute variants. If the TS serializer changes its output
    # format, this test must be updated to match — that's the point: it catches
    # serializer/consumer drift.
    REPRESENTATIVE_YAML = """\
ontology:
  entities:
    Project:
      description: "A software project or initiative."
      attributes:
        language: "Primary programming language"
        status:
          - "active"
          - "completed"
          - "paused"
        budget:
          type: "float"
          description: "Budget in USD"
        priority:
          enum:
            - "low"
            - "medium"
            - "high"
          description: "Priority level"
    Technology:
      description: "A technology, framework, or tool."
      attributes:
        category:
          - "language"
          - "framework"
          - "database"
  edges:
    Uses:
      description: "A project using a technology."
      attributes:
        version: "Version in use"
  edgeMap:
    "Project,Technology":
      - "Uses"
"""

    @pytest.fixture
    def parsed_config(self):
        return yaml.safe_load(self.REPRESENTATIVE_YAML)

    def test_builds_entity_models_with_correct_field_types(self, parsed_config):
        """then builds entity models with correct field types"""
        entities, _, _ = _build_ontology(parsed_config)
        assert "Project" in entities
        assert "Technology" in entities

        project_hints = get_type_hints(entities["Project"])
        assert project_hints["language"] is str
        assert get_origin(project_hints["status"]) is Literal
        assert set(get_args(project_hints["status"])) == {"active", "completed", "paused"}
        assert project_hints["budget"] is float
        assert get_origin(project_hints["priority"]) is Literal
        assert set(get_args(project_hints["priority"])) == {"low", "medium", "high"}

        tech_hints = get_type_hints(entities["Technology"])
        assert get_origin(tech_hints["category"]) is Literal

    def test_builds_edge_models_with_correct_field_types(self, parsed_config):
        """then builds edge models with correct field types"""
        _, edges, _ = _build_ontology(parsed_config)
        assert "Uses" in edges
        hints = get_type_hints(edges["Uses"])
        assert hints["version"] is str

    def test_converts_edgeMap_keys_to_tuples(self, parsed_config):
        """then converts edgeMap keys to tuples"""
        _, _, edge_type_map = _build_ontology(parsed_config)
        assert ("Project", "Technology") in edge_type_map
        assert edge_type_map[("Project", "Technology")] == ["Uses"]
