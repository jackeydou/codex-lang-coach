import { SqliteLearningStore } from "@language-coach/core";
import { buildLanguageCoachContext } from "./context.js";
import { readHookInput } from "./input.js";

const input = await readHookInput();
const store = new SqliteLearningStore();
const profile = store.getProfile();
store.close();

if (!profile.coachEnabled) process.exit(0);

const turnId = typeof input.turn_id === "string" ? input.turn_id : "";

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "UserPromptSubmit",
    additionalContext: buildLanguageCoachContext(profile, turnId),
  },
}));
