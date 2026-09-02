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
  source?: NoteSource;
}

export interface NoteSource {
  deviceId: string;
  deviceName?: string;
}

export interface ProgressSummary {
  totalNotes: number;
  notesThisWeek: number;
  activeDays: number;
  currentStreak: number;
  weeklyActivity: Array<{ date: string; count: number }>;
  activity90Days: Array<{ date: string; count: number }>;
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
  sync?: SyncStatus;
  notesPage?: NotesPage;
}

export interface NotesPage {
  hasMore: boolean;
  nextCursor?: string;
  limit: number;
}

export interface DeletedLearningNote {
  id: string;
  deletedAt: string;
}

export interface SyncSnapshot {
  profile?: LanguageProfile;
  notes: LearningNote[];
  deletedNotes: DeletedLearningNote[];
  throughRevision: number;
}

export interface SyncCheckpoint {
  revision: number;
  lastSyncedAt?: string;
}

export interface SyncUploadBatch {
  deviceId: string;
  deviceName?: string;
  profile?: LanguageProfile;
  notes: LearningNote[];
  deletedNotes: DeletedLearningNote[];
}

export interface SyncUploadResult {
  deviceId: string;
  acceptedNotes: number;
  acceptedDeletions: number;
  syncedAt: string;
}

export interface SyncStatus {
  enabled: boolean;
  userId?: string;
  deviceId?: string;
  deviceName?: string;
  remoteUrl?: string;
  lastSyncedAt?: string;
  error?: string;
  state?: "idle" | "syncing" | "error";
  completedItems?: number;
  totalItems?: number;
}

export interface RemoteSyncConfig {
  remoteUrl: string;
  token: string;
  userId: string;
  deviceId: string;
  deviceName?: string;
}

export interface DashboardRuntimeConfig {
  mode: "local" | "remote";
  remoteUrl: string;
  authUrl?: string;
  deviceId?: string;
  deviceName?: string;
}
