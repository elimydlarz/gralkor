  OpenClaw Builtin Memory: Migration Ingestion Guide

  What you're ingesting

  OpenClaw stores agent memories as markdown files with YAML frontmatter in a workspace directory (typically ~/.openclaw/workspace/):

  MEMORY.md              ← index file (links to memory files, not content itself)
  memory/
    user_role.md         ← structured memory file
    feedback_testing.md
    project_auth.md
    2026-03-12.md        ← daily log (date-based)

  Each memory file (except MEMORY.md and daily logs) has this format:

  ---
  name: user role
  description: one-line description used for relevance matching
  type: user | feedback | project | reference
  ---

  Memory content here. For feedback/project types, structured as:
  Rule or fact.
  **Why:** motivation
  **How to apply:** when/where this applies

  Memory types

  ┌───────────┬─────────────────────────────────────────────────────────────────┐
  │   Type    │                             Purpose                             │
  ├───────────┼─────────────────────────────────────────────────────────────────┤
  │ user      │ Who the user is — role, preferences, knowledge level            │
  ├───────────┼─────────────────────────────────────────────────────────────────┤
  │ feedback  │ Corrections/guidance from the user — rules with why + how       │
  ├───────────┼─────────────────────────────────────────────────────────────────┤
  │ project   │ Ongoing work context — goals, deadlines, decisions              │
  ├───────────┼─────────────────────────────────────────────────────────────────┤
  │ reference │ Pointers to external systems — URLs, project boards, dashboards │
  └───────────┴─────────────────────────────────────────────────────────────────┘

  Pre-computed data in SQLite

  The builtin memory system indexes these files into ~/.openclaw/memory/<agentId>.sqlite. Schema (from src/memory/memory-schema.ts):

  - files — id, path, title, metadata, content hash
  - chunks — file_id, content (~400 tokens each, 80-token overlap), embedding (blob), chunk_index
  - FTS5 virtual table — keyword search over chunks

  Migration approach

  Iterate the markdown files (source of truth for structure), enrich with SQLite chunks/embeddings:

  import { parseFrontmatterBlock } from "openclaw/plugin-sdk";

  const workspace = api.getWorkspacePath();
  const memoryFiles = glob.sync("memory/*.md", { cwd: workspace });

  const db = new Database(
    path.join(homedir(), ".openclaw/memory", `${agentId}.sqlite`)
  );

  for (const file of memoryFiles) {
    if (file === "MEMORY.md") continue; // index file, skip

    const raw = fs.readFileSync(path.join(workspace, file), "utf8");
    const { frontmatter, body } = parseFrontmatterBlock(raw);

    // Pre-computed chunks + embeddings from SQLite (may not exist)
    const chunks = db.prepare(`
      SELECT c.content, c.embedding, c.chunk_index
      FROM chunks c JOIN files f ON c.file_id = f.id
      WHERE f.path = ?
      ORDER BY c.chunk_index
    `).all(file);

    // → Feed frontmatter + body + chunks into Graphiti as episodes
  }

  Key files in OpenClaw repo

  ┌─────────────────────────────────┬─────────────────────────────────────────────────────────┐
  │              File               │                      What it does                       │
  ├─────────────────────────────────┼─────────────────────────────────────────────────────────┤
  │ src/markdown/frontmatter.ts     │ YAML frontmatter parser (exported via plugin SDK)       │
  ├─────────────────────────────────┼─────────────────────────────────────────────────────────┤
  │ src/memory/memory-schema.ts     │ SQLite DDL — chunks, files, embeddings                  │
  ├─────────────────────────────────┼─────────────────────────────────────────────────────────┤
  │ src/memory/manager-sync-ops.ts  │ File watching, chunking, embedding generation           │
  ├─────────────────────────────────┼─────────────────────────────────────────────────────────┤
  │ src/memory/manager-search.ts    │ Hybrid search (BM25 + vector + MMR)                     │
  ├─────────────────────────────────┼─────────────────────────────────────────────────────────┤
  │ src/plugins/types.ts:263-306    │ OpenClawPluginApi — registerCli(), registerHook(), etc. │
  ├─────────────────────────────────┼─────────────────────────────────────────────────────────┤
  │ extensions/memory-core/index.ts │ How the builtin memory plugin registers itself          │
  └─────────────────────────────────┴─────────────────────────────────────────────────────────┘

  Notes for Graphiti ingestion

  - Let Graphiti re-chunk. SQLite chunks are optimized for embedding similarity, not entity extraction. Pass the full body or joined chunks — Graphiti's own chunking is
  better for graph construction.
  - The SQLite embeddings save re-embedding cost, but Graphiti may want its own embeddings anyway depending on your provider config.
  - feedback memories are the richest for graph edges — they're inherently relational (rule → reason → application context).
  - Daily logs (YYYY-MM-DD.md) have no frontmatter type. Treat them as episodic/temporal content if you ingest them at all.
  - MEMORY.md is just an index with links — skip it or use it only to determine which files matter.
  - Idempotency: drop a marker (file or DB flag) after migration so re-runs are safe.