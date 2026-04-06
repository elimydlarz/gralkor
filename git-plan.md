# Git History Cleanup Plan

The repo has 2,747 commits whose messages are verbatim prompts sent to Claude Code.
This plan tracks what needs fixing and how to approach it.

## Status

- [ ] Squash / rebase history into meaningful commits
- [ ] Fix specific embarrassing commit messages (noted below)

---

## Typo Fixes Needed

| Hash | Current message | Fix |
|---|---|---|
| `7396156`, `ff900aa` | `"I don't undersatnd the failing tests. Can you fix gthem?"` | `"Fix failing tests"` |
| `a8e1fcf`, `dd01d48`, `dd392b1`, `4116263`, `302f6f9` | `"apropo of nothing, review the README.md as a skeptical software engineer"` | `"Review README as skeptical engineer"` |
| `ae9e6b9` | `"multitenancy and family paritition"` | `"multitenancy and family partition"` |
| `0a7e635` | `"correct export for OpenClar"` | `"correct export for OpenClaw"` |

---

## Raw Log Output as Commit Messages

| Representative hash | Message |
|---|---|
| `cec2632` (+ 7) | `[gralkor] raw pluginConfig: {"llm":{"model":"gemini-3.1-flash-lite-previ...` |
| `a6a584` (+ 13) | `2026-04-03T20:30:34.704+00:00 [gralkor] native memory search failed: Can` |

---

## Messages Trailing Off Mid-Sentence

| Representative hash | Message |
|---|---|
| `1b147d3` | `"How do we make sure every Gralkor call gets:"` |
| `9bdfd8e` | `"What's this failure?:"` |
| `019750629` (+ 10) | `"Functional test failure:"` |
| `c24e1b2` (+ 2) | `"Timestamps are so precise and long, it's bad for tokens!:"` |
| `c0dfb79` (+ ~60) | `"Seems like new version is a disaster:"` |

---

## Other Embarrassing Messages

| Hash | Message | Issue |
|---|---|---|
| `536bbb4` | `"Eli is still here"` | No context |
| `8a301ae` | `"WIP 2 package approach"` | WIP commit |
| `51f845d` | `"another day, another surprising openclaw interface"` | Frustration |
| `ae9a2b0` | `"fixing interface AGAIN"` | Frustration |
| `217d1b4` (+ ~30) | `"Don't run any tests. Just review thoroughly."` | Raw instruction |
| `4e344d4` (+ 4) | `"How are the hooks going? We've been working on..."` | Raw question |

---

## Approach Options

1. **Interactive rebase** — Rewrite individual commits. Viable for isolated bad commits, but with 2,700+ auto() commits this is impractical commit-by-commit.
2. **Squash into logical releases** — Squash all commits between version tags into a single meaningful commit per version. Cleans the auto() noise while preserving the version history shape.
3. **Orphan branch** — Create a new branch with a clean history, keeping the old branch as an archive. Least risky (old history not destroyed).

**Recommendation:** Squash to version boundaries (option 2). Each version tag becomes one commit summarising what changed in that release.
