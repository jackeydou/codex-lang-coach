---
name: language-coach
description: Review language-learning history, reflect on recurring mistakes, update native and target languages, or open the local Language Coach dashboard.
---

# Language Coach

Use the bundled Language Coach MCP tools for learning-history tasks.

## Workflows

- To change languages or coaching status, call `get_language_profile`, confirm the requested change, then call `update_language_profile`.
- To reflect on progress, call `get_learning_progress` and `list_learning_notes`. Explain recurring patterns with concrete examples from the saved notes.
- To open the dashboard, call `start_learning_dashboard` and give the returned localhost link to the user.
- To remove a note, identify the exact note first. Ask for confirmation before calling `delete_learning_note` because deletion is permanent.

## Privacy boundary

Only save language-learning material: the user's original expression, its polished form, corrections, reusable patterns, and transfer examples. Never save unrelated task details, source files, private context, or task answers.

Use judgment before saving. Save a note only when the message contains a meaningful error, unnatural or contextually inappropriate wording, or a genuinely useful reusable pattern. Do not save a note when the user's expression is already natural, correct, and appropriate. A merely optional stylistic rewrite is not enough reason to save.
