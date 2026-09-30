---
name: language-coach
description: Review language-learning history, reflect on recurring mistakes, update native and target languages, or open the Language Coach dashboard in Codex. The coaching itself is enabled automatically by plugin hooks.
---

# Language Coach

Use the bundled Language Coach MCP tools for learning-history tasks.

## Workflows

- To change languages or coaching status, call `get_language_profile`, confirm the requested change, then call `update_language_profile`.
- To reflect on progress, call `get_learning_progress` and `list_learning_notes`. Explain recurring patterns with concrete examples from the saved notes.
- To open the dashboard in Codex, call `open_learning_dashboard` when available. It returns the UI associated with the plugin; do not also open a second web dashboard. A successful tool result alone does not prove the host displayed the UI.
- If the UI tool is unavailable or the host explicitly cannot render it, call `start_learning_dashboard`. Use a Codex browser panel to open its returned URL only when the current environment provides a browser-opening tool; otherwise give the localhost link. For a temporary loading error, retry the native UI or report the error rather than silently opening a different interface.
- To open the standalone web dashboard explicitly, use `start_learning_dashboard`. Login and sync configuration remain in that dashboard.
- To remove a note, identify the exact note first. Ask for confirmation before calling `delete_learning_note` because deletion is permanent.

## Privacy boundary

Only save language-learning material: the user's original expression, its polished form, corrections, reusable patterns, and transfer examples. Never save unrelated task details, source files, private context, or task answers.

Use judgment before saving. Save a note only when the message contains a meaningful error, unnatural or contextually inappropriate wording, or a genuinely useful reusable pattern. Do not save a note when the user's expression is already natural, correct, and appropriate. A merely optional stylistic rewrite is not enough reason to save.
