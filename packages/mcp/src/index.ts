import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CORRECTION_CATEGORIES,
  EXAMPLE_CONTEXTS,
  INPUT_LANGUAGE_KINDS,
  type LearningStore,
} from "@language-coach/core";
import { z } from "zod";

export interface LanguageCoachMcpOptions {
  store: LearningStore;
  startDashboard: () => Promise<{ url: string; port: number }>;
}

const correctionSchema = z.object({
  original: z.string().min(1),
  replacement: z.string().min(1),
  reason: z.string().min(1),
  category: z.enum(CORRECTION_CATEGORIES),
});

const patternSchema = z.object({
  pattern: z.string().min(1),
  explanation: z.string().min(1),
});

const exampleSchema = z.object({
  context: z.enum(EXAMPLE_CONTEXTS),
  text: z.string().min(1),
});

function result(value: unknown, message?: string) {
  return {
    content: [{ type: "text" as const, text: message || JSON.stringify(value, null, 2) }],
    structuredContent: value as Record<string, unknown>,
  };
}

export function createLanguageCoachMcpServer({
  store,
  startDashboard,
}: LanguageCoachMcpOptions): McpServer {
  const server = new McpServer({ name: "language-coach", version: "0.1.0" });

  server.registerTool("get_language_profile", {
    title: "Get language profile",
    description: "Get the learner's active native language, target language, and coaching status.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async () => result(store.getProfile()));

  server.registerTool("update_language_profile", {
    title: "Update language profile",
    description: "Change the learner's native language, target language, or coaching status.",
    inputSchema: {
      nativeLanguage: z.string().min(2).optional(),
      targetLanguage: z.string().min(2).optional(),
      coachEnabled: z.boolean().optional(),
    },
    annotations: { idempotentHint: true, openWorldHint: false },
  }, async (input) => result(store.updateProfile(input), "Language profile updated."));

  server.registerTool("save_learning_note", {
    title: "Save language learning note",
    description: "Save useful language-learning material from a turn that needs meaningful correction or teaches a reusable pattern. Do not save already-natural expressions, unrelated task content, or task answers.",
    inputSchema: {
      turnId: z.string().optional().describe("Turn id provided by the language-coach hook."),
      inputLanguage: z.enum(INPUT_LANGUAGE_KINDS).describe("Whether the user's original message was mainly native, mainly target, mixed, or other."),
      originalExpression: z.string().min(1).describe("Only the expression being coached."),
      polishedExpression: z.string().min(1),
      corrections: z.array(correctionSchema).default([]),
      patterns: z.array(patternSchema).default([]),
      examples: z.array(exampleSchema).default([]),
      nativeLanguage: z.string().optional(),
      targetLanguage: z.string().optional(),
    },
    annotations: { idempotentHint: true, openWorldHint: false },
  }, async (input) => {
    const note = store.saveNote(input);
    return result(note, `Saved language-learning note ${note.id}.`);
  });

  server.registerTool("list_learning_notes", {
    title: "List language learning notes",
    description: "Retrieve recent corrections, reusable patterns, and transfer examples.",
    inputSchema: { limit: z.number().int().min(1).max(500).default(50) },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ limit }) => result({ notes: store.listNotes(limit) }));

  server.registerTool("get_learning_progress", {
    title: "Get language learning progress",
    description: "Summarize learning frequency, correction categories, and recurring language patterns.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async () => result(store.getProgress()));

  server.registerTool("delete_learning_note", {
    title: "Delete language learning note",
    description: "Permanently delete one stored learning note by id.",
    inputSchema: { id: z.string().uuid() },
    annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false },
  }, async ({ id }) => result({ deleted: store.deleteNote(id) }));

  server.registerTool("start_learning_dashboard", {
    title: "Start learning dashboard",
    description: "Start the private local dashboard and return its localhost URL.",
    inputSchema: {},
    annotations: { idempotentHint: true, openWorldHint: false },
  }, async () => {
    const dashboard = await startDashboard();
    return result({ url: dashboard.url, port: dashboard.port }, `Language Coach dashboard: ${dashboard.url}`);
  });

  return server;
}
