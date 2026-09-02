import { SqliteLearningStore } from "@language-coach/core";
import { readHookInput } from "./input.js";

const input = await readHookInput();
const store = new SqliteLearningStore();
const profile = store.getProfile();
store.close();

const loopCount = typeof input.loop_count === "number" ? input.loop_count : 0;
const status = typeof input.status === "string" ? input.status : "";

if (!profile.coachEnabled || status !== "completed" || loopCount > 0) {
  process.stdout.write("{}");
} else {
  process.stdout.write(JSON.stringify({
    followup_message: "Before finishing, decide whether the latest user message has meaningful language-learning value. If you have not already handled it, save a note with the Language Coach MCP tool save_learning_note only when the expression contains a meaningful error, unnatural or contextually inappropriate wording, or a genuinely useful reusable pattern. Do not save a duplicate or save anything when the expression is already natural, correct, and appropriate. Never save unrelated task content. Then return the response without discussing this internal decision.",
  }));
}
