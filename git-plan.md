# Git History Cleanup Plan

## Agreed Changes

| Hashes | Current message | New message |
|---|---|---|
| `7396156`, `ff900aa` | `"I don't undersatnd the failing tests. Can you fix gthem?"` | `"Explain and fix failing tests"` |
| `a8e1fcf`, `dd01d48`, `dd392b1`, `4116263`, `302f6f9` | `"apropo of nothing, review the README.md as a skeptical software engineer"` | `"Review README critically"` |
| `ae9e6b9` | `"multitenancy and family paritition"` | `"multitenancy and family partition"` |
| `0a7e635` | `"correct export for OpenClar"` | `"correct export for OpenClaw"` |
| `cec2632` (+ 7) | `[gralkor] raw pluginConfig: {"llm":{"model":"gemini-3.1-flash-lite-previ...` | `"Investigate plugin config handling"` |
| `a6a584` (+ 13) | `2026-04-03T20:30:34.704+00:00 [gralkor] native memory search failed: Can` | `"Fix native memory search failure"` |
| `1b147d3` | `"How do we make sure every Gralkor call gets:"` | `"Ensure consistent group ID per call"` |
| `9bdfd8e` | `"What's this failure?:"` | `"Investigate and fix test failure"` |
| `019750629` (+ 10) | `"Functional test failure:"` | `"Fix functional test failures"` |
| `c24e1b2` (+ 2) | `"Timestamps are so precise and long, it's bad for tokens!:"` | `"Shorten timestamp format to reduce token usage"` |
| `c0dfb79` (+ ~60) | `"Seems like new version is a disaster:"` | `"Debug and fix regressions in new version"` |
| `536bbb4` | `"Eli is still here"` | `"Sanity check"` |
| `8a301ae` | `"WIP 2 package approach"` | `"split into two packages"` |
| `51f845d` | `"another day, another surprising openclaw interface"` | `"Adapt to OpenClaw interface changes"` |
| `ae9a2b0` | `"fixing interface AGAIN"` | `"Fix plugin interface"` |
| `217d1b4` (+ ~30) | `"Don't run any tests. Just review thoroughly."` | `"Review and refactor"` |
| `4e344d4` (+ 4) | `"How are the hooks going? We've been working on..."` | `"Implement inject and capture hooks"` |
| `3812e5e` | `"laggard"` | `"Fix slow session flush"` |
| `386aec20` | `"1 I'm sure there was a readme, I don't know what happened to it..."` | `"Restore README"` |
| `0947229` | `"Confirmed."` | `"Confirm approach"` |
| `9636ace` | `"Sure, that'll work."` | `"Approve approach"` |
| `368b25e` | `"Bug report. In these logs, I believe (you should check) we are saving -"` | `"Investigate capture bug"` |
| `5c21c6d` | `"Consumer had a lot of trouble with config. I think your readme is wrong?"` | `"Fix README config docs"` |
| `5f442c8` | `"A bit confused about this agent log output:"` | `"Investigate agent log output"` |
| `ca5620b` | `"Do you think this analysis of our bug is correct?:"` | `"Analyse and fix bug"` |
| `60f2b23` | `"I'm quite worried about excessively long distillations of thinking messa..."` | `"Truncate distillation output"` |
| `b8c38e0` | `"I am concerned that invalid facts are crowding out valid facts. Look at..."` | `"Fix invalid facts crowding out valid ones"` |
| `0fa81d8` | `"I'm concerned about what we're saving, see in agent logs:"` | `"Investigate capture content"` |
| `df01528` | `"I think we published 27.1.0 but the tag is missing - what happened?"` | `"Fix missing release tag"` |
| `47971981` | `"Errors on the agent, seems like recall isn't working? Last login: Sat Ma..."` — macOS terminal banner pasted verbatim | `"Fix recall errors"` |
| `f05f204` | `"Graphti supports declaring custom entity..."` — "Graphti" typo | `"Graphiti supports declaring custom entity types"` |
| `363d35f` | `"The memory add tool as gone missing"` — "as" should be "has" | `"Fix missing memory_add tool"` |
| `7d73e2d` | `"The results returned to the OpenClaw agent aren't dated! Oh no, what a d..."` | `"Add timestamps to recalled facts"` |
| `01b3936` | `"We need a publish script - like @../eli2-projects/do-together/package.js..."` — leaks private project path | `"Add publish script"` |
| `71069f8` | `"Publish \`@susu-eng/gralkor\` to npm"` — exposes old npm org name | `"Publish to npm"` |
| ~505 commits | Commit bodies contain `Transcript: /Users/elimydlarz/...` — local username in public history | Addressed by full history squash |

---

## File Issues (Not Commit Messages)

| Priority | File | Status | Issue |
|---|---|---|---|
| High | `.trunk-sync/` | **TODO** | Committed directory containing full name, session UUIDs, PIDs, verbatim prompt text. Remove from history and add to `.gitignore`. See steps below. |
| N/A | `.stryker-incremental.json` | Not tracked — already in `.gitignore`. No action needed. |
| Done | `README.md:24` | ~~double "into"~~ | Fixed |
| Done | `README.md:32` | ~~"bu there's"~~ | Fixed |
