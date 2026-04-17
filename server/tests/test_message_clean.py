"""Tree: message-clean (Python).

Shared utilities used server-side by /recall, /tools/memory_search, and the capture
pipeline. Ports src/hooks.ts helpers: strip_gralkor_memory_xml,
SYSTEM_MESSAGE_PATTERNS, SYSTEM_MESSAGE_MULTILINE_PATTERNS, is_system_line,
clean_user_message_text, build_interpretation_context.
"""

from __future__ import annotations

from pipelines.message_clean import (
    ConversationMessage,
    SYSTEM_MESSAGE_MULTILINE_PATTERNS,
    SYSTEM_MESSAGE_PATTERNS,
    build_interpretation_context,
    clean_user_message_text,
    is_system_line,
    strip_gralkor_memory_xml,
)


class TestStripGralkorMemoryXml:
    def test_removes_block(self):
        text = "before <gralkor-memory>facts</gralkor-memory>\nafter"
        assert strip_gralkor_memory_xml(text) == "before after"

    def test_removes_block_with_attributes(self):
        text = 'pre <gralkor-memory trust="untrusted">x</gralkor-memory> post'
        assert strip_gralkor_memory_xml(text) == "pre  post"

    def test_leaves_text_without_block_unchanged(self):
        assert strip_gralkor_memory_xml("hello world") == "hello world"

    def test_removes_multiple_blocks(self):
        text = "<gralkor-memory>a</gralkor-memory>\n<gralkor-memory>b</gralkor-memory>\nend"
        assert strip_gralkor_memory_xml(text) == "end"


class TestSystemMessagePatterns:
    def test_matches_new_session_started(self):
        assert is_system_line("A new session was started with the agent")

    def test_matches_current_time_case_insensitive(self):
        assert is_system_line("Current time: 2026-04-17T12:00:00Z")
        assert is_system_line("current time: 2026-04-17")

    def test_matches_emoji_new_session(self):
        assert is_system_line("✅ New session started at noon")
        assert is_system_line("New session started at noon")

    def test_matches_system_event_line(self):
        assert is_system_line("System: [2026-04-17] event")

    def test_matches_media_without_caption(self):
        assert is_system_line("[User sent media without caption]")

    def test_leaves_non_system_lines_alone(self):
        assert not is_system_line("Hello, how are you?")

    def test_empty_line_is_not_system(self):
        assert not is_system_line("")
        assert not is_system_line("   ")


class TestSystemMessageMultilinePatterns:
    def test_matches_file_naming_slug_prompt(self):
        prompt = (
            "Based on this conversation, generate a short 2-4 word filename slug.\n"
            "Lots of context here.\n"
            "Reply with ONLY the slug"
        )
        assert SYSTEM_MESSAGE_MULTILINE_PATTERNS[0].search(prompt) is not None


class TestCleanUserMessageText:
    def test_returns_empty_for_whitespace(self):
        assert clean_user_message_text("  \n  ") == ""

    def test_drops_multiline_system_template(self):
        prompt = (
            "Based on this conversation, generate a short 2-4 word filename slug.\n"
            "Reply with ONLY the slug"
        )
        assert clean_user_message_text(prompt) == ""

    def test_strips_untrusted_metadata_wrapper(self):
        text = (
            "user text before\n"
            "Sender (untrusted metadata):\n"
            "```json\n"
            '{"id": 1}\n'
            "```\n"
            "user text after"
        )
        cleaned = clean_user_message_text(text)
        assert "user text before" in cleaned
        assert "user text after" in cleaned
        assert "json" not in cleaned
        assert "untrusted metadata" not in cleaned

    def test_strips_reply_context_wrapper(self):
        text = (
            "Replied message (untrusted, for context):\n"
            "```json\n"
            '{"replied": "to"}\n'
            "```\nwhat I want to say"
        )
        cleaned = clean_user_message_text(text)
        assert "what I want to say" in cleaned
        assert "replied" not in cleaned

    def test_strips_gralkor_memory_xml(self):
        text = "question <gralkor-memory>leaked</gralkor-memory>"
        cleaned = clean_user_message_text(text)
        assert "leaked" not in cleaned
        assert "question" in cleaned

    def test_strips_untrusted_context_footer(self):
        text = (
            "my question\n\n"
            "Untrusted context (metadata from source X):\n"
            '{"foo": "bar"}'
        )
        cleaned = clean_user_message_text(text)
        assert cleaned == "my question"

    def test_strips_system_lines_but_keeps_user_content(self):
        text = "Current time: 2026-04-17\nwhat time is it?"
        cleaned = clean_user_message_text(text)
        assert "Current time" not in cleaned
        assert "what time is it?" in cleaned

    def test_returns_empty_when_message_is_entirely_system(self):
        assert clean_user_message_text("A new session was started") == ""


class TestBuildInterpretationContext:
    def test_prefixes_roles(self):
        msgs = [
            ConversationMessage(role="user", text="hello"),
            ConversationMessage(role="assistant", text="hi there"),
        ]
        ctx = build_interpretation_context(msgs, "- fact 1")
        assert "User: hello" in ctx
        assert "Assistant: hi there" in ctx
        assert "Memory facts to interpret:\n- fact 1" in ctx

    def test_drops_messages_that_clean_to_empty(self):
        msgs = [
            ConversationMessage(role="user", text="Current time: now"),
            ConversationMessage(role="user", text="real content"),
        ]
        ctx = build_interpretation_context(msgs, "")
        assert "Current time" not in ctx
        assert "User: real content" in ctx

    def test_drops_oldest_when_over_budget(self):
        msgs = [
            ConversationMessage(role="user", text="OLD" * 50),
            ConversationMessage(role="user", text="RECENT"),
        ]
        ctx = build_interpretation_context(msgs, "", char_budget=20)
        assert "RECENT" in ctx
        assert "OLD" not in ctx

    def test_assembles_in_original_order(self):
        msgs = [
            ConversationMessage(role="user", text="first"),
            ConversationMessage(role="assistant", text="second"),
            ConversationMessage(role="user", text="third"),
        ]
        ctx = build_interpretation_context(msgs, "")
        first_pos = ctx.index("first")
        second_pos = ctx.index("second")
        third_pos = ctx.index("third")
        assert first_pos < second_pos < third_pos

    def test_cleans_user_messages_but_not_assistant(self):
        msgs = [
            ConversationMessage(role="user", text="<gralkor-memory>recall</gralkor-memory>actual q"),
            ConversationMessage(role="assistant", text="answer"),
        ]
        ctx = build_interpretation_context(msgs, "")
        assert "recall" not in ctx
        assert "actual q" in ctx
        assert "answer" in ctx


def test_system_message_patterns_are_exported():
    assert len(SYSTEM_MESSAGE_PATTERNS) == 5
    assert len(SYSTEM_MESSAGE_MULTILINE_PATTERNS) >= 1
