export const CORRECTION_CATEGORIES = [
  "grammar",
  "spelling",
  "collocation",
  "word-choice",
  "tone",
  "context",
  "structure",
] as const;

export const EXAMPLE_CONTEXTS = [
  "work",
  "shopping",
  "travel",
  "social",
  "everyday",
  "other",
] as const;

export const INPUT_LANGUAGE_KINDS = ["native", "target", "mixed", "other"] as const;

export type CorrectionCategory = (typeof CORRECTION_CATEGORIES)[number];
export type ExampleContext = (typeof EXAMPLE_CONTEXTS)[number];
export type InputLanguageKind = (typeof INPUT_LANGUAGE_KINDS)[number];

export interface LanguageProfile {
  nativeLanguage: string;
  targetLanguage: string;
  coachEnabled: boolean;
  updatedAt: string;
}

export interface Correction {
  original: string;
  replacement: string;
  reason: string;
  category: CorrectionCategory;
}

export interface LearningPattern {
  pattern: string;
  explanation: string;
}

export interface TransferExample {
  context: ExampleContext;
  text: string;
}

export interface LearningNoteInput {
  turnId?: string;
  inputLanguage: InputLanguageKind;
  originalExpression: string;
  polishedExpression: string;
  corrections: Correction[];
  patterns: LearningPattern[];
  examples: TransferExample[];
  nativeLanguage?: string;
  targetLanguage?: string;
}

export interface LearningNote extends LearningNoteInput {
  id: string;
  nativeLanguage: string;
  targetLanguage: string;
  createdAt: string;
}

export interface ProgressSummary {
  totalNotes: number;
  notesThisWeek: number;
  activeDays: number;
  currentStreak: number;
  weeklyActivity: Array<{ date: string; count: number }>;
  categoryCounts: Array<{ category: CorrectionCategory; count: number }>;
  recurringPatterns: Array<{ pattern: string; explanation: string; count: number }>;
  languageUse: {
    native: number;
    target: number;
    mixed: number;
    other: number;
    targetShare: number;
  };
}

export interface DashboardData {
  profile: LanguageProfile;
  notes: LearningNote[];
  progress: ProgressSummary;
}
