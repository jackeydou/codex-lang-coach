import { SqliteLearningStore } from "@language-coach/core";
import { readHookInput } from "./input.js";

const input = await readHookInput();
const store = new SqliteLearningStore();
const profile = store.getProfile();
const turnId = typeof input.turn_id === "string" ? input.turn_id : "";
const saved = turnId ? store.hasNoteForTurn(turnId) : true;
store.close();

if (!profile.coachEnabled || saved || input.stop_hook_active) {
  process.stdout.write(JSON.stringify({ continue: true }));
} else {
  process.stdout.write(JSON.stringify({
    decision: "block",
    reason: `Before finishing, decide whether turn ${turnId} has meaningful language-learning value. Save a note with the Language Coach MCP tool save_learning_note only if the user's expression contains a meaningful error, unnatural or contextually inappropriate wording, or a genuinely useful reusable pattern. Do not save a note if the expression is already natural, correct, and appropriate, or if the rewrite is merely an optional stylistic preference. Never save unrelated task content. Then return the response without discussing this internal decision.`,
  }));
}
