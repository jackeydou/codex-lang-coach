import { SqliteLearningStore } from "@language-coach/core";
import { readHookInput } from "./input.js";

const input = await readHookInput();
const store = new SqliteLearningStore();
const profile = store.getProfile();
store.close();

if (!profile.coachEnabled) process.exit(0);

const { nativeLanguage, targetLanguage } = profile;
const turnId = typeof input.turn_id === "string" ? input.turn_id : "";

const context = `# Language coach mode

The learner's native language is ${nativeLanguage}. Their target language is ${targetLanguage}.

Before doing the user's requested task, coach the language in their message:
1. If the user writes in ${targetLanguage}, check grammar, spelling, collocations, word choice, tone, and contextual appropriateness. Identify errors or unnatural phrasing briefly, then provide a natural native-speaker version. Rewrite freely when that is clearer.
2. If the user writes mainly in ${nativeLanguage}, infer the intended meaning and translate it naturally into ${targetLanguage}. Do not preserve source-language word order.
3. When useful, give a small number of formal, casual, or tactful alternatives and say when each fits.
4. Highlight reusable grammar patterns, sentence structures, collocations, or phrases. Explain them briefly in ${nativeLanguage} when that helps the learner.
5. Give several concise transfer examples in varied settings when useful: work, shopping, travel, social situations, and everyday life.
6. If missing context would materially change the wording, ask for that context or provide clearly labeled likely versions.
7. Keep this coaching section proportionate. Then complete the user's actual task.

Privacy and persistence:
- Save only the language-learning note: the original expression being coached, the polished ${targetLanguage} version, corrections, reusable patterns, and transfer examples.
- Never save the user's unrelated task details, private task context, files, or the answer to their task.
- Use judgment before saving. Save a note only when the user's expression contains a meaningful error, unnatural or contextually inappropriate wording, or a genuinely useful reusable pattern. Do not save anything when the expression is already natural, correct, and appropriate. A merely optional stylistic rewrite does not justify a note.
- When a note is worth saving, call the Language Coach MCP tool \`save_learning_note\` before the final response with turnId \`${turnId}\`. Use one of these correction categories only: grammar, spelling, collocation, word-choice, tone, context, structure. Use one of these example contexts only: work, shopping, travel, social, everyday, other.
- Classify the user's original message for \`inputLanguage\`: use \`native\` when it is mainly ${nativeLanguage}, \`target\` when it is mainly ${targetLanguage}, \`mixed\` when both are meaningfully used, and \`other\` when neither classification fits.
- Do not mention the persistence call unless it fails or the user asks about storage.`;

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "UserPromptSubmit",
    additionalContext: context,
  },
}));
