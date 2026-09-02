import { SqliteLearningStore } from "@language-coach/core";
import { buildLanguageCoachContext } from "./context.js";
import { readHookInput } from "./input.js";

await readHookInput();
const store = new SqliteLearningStore();
const profile = store.getProfile();
store.close();

if (!profile.coachEnabled) {
  process.stdout.write("{}");
} else {
  process.stdout.write(JSON.stringify({
    additional_context: buildLanguageCoachContext(profile),
  }));
}
