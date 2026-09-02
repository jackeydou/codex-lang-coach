import type { CorrectionCategory, LearningNote, ProgressSummary } from "./types.js";

export function calculateProgress(notes: LearningNote[], today = new Date()): ProgressSummary {
  const dayKey = (date: Date) => date.toISOString().slice(0, 10);
  const counts = new Map<string, number>();
  for (const note of notes) {
    const key = note.createdAt.slice(0, 10);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const activityForDays = (days: number) => Array.from({ length: days }, (_, offset) => {
    const date = new Date(today);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - (days - 1 - offset));
    const dateString = dayKey(date);
    return { date: dateString, count: counts.get(dateString) ?? 0 };
  });
  const weeklyActivity = activityForDays(7);

  let currentStreak = 0;
  for (let offset = 0; offset < 366; offset += 1) {
    const date = new Date(today);
    date.setUTCDate(date.getUTCDate() - offset);
    if ((counts.get(dayKey(date)) ?? 0) > 0) currentStreak += 1;
    else if (offset > 0 || counts.size > 0) break;
  }

  const categoryMap = new Map<CorrectionCategory, number>();
  const patternMap = new Map<string, { explanation: string; count: number }>();
  const languageUse = { native: 0, target: 0, mixed: 0, other: 0 };
  for (const note of notes) {
    languageUse[note.inputLanguage] += 1;
    for (const correction of note.corrections) {
      categoryMap.set(correction.category, (categoryMap.get(correction.category) ?? 0) + 1);
    }
    for (const pattern of note.patterns) {
      const key = pattern.pattern.trim().toLocaleLowerCase();
      const item = patternMap.get(key) ?? { explanation: pattern.explanation, count: 0 };
      item.count += 1;
      patternMap.set(key, item);
    }
  }

  return {
    totalNotes: notes.length,
    notesThisWeek: weeklyActivity.reduce((sum, item) => sum + item.count, 0),
    activeDays: counts.size,
    currentStreak,
    weeklyActivity,
    activity90Days: activityForDays(90),
    categoryCounts: [...categoryMap.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count),
    recurringPatterns: [...patternMap.entries()]
      .map(([pattern, value]) => ({ pattern, ...value }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50),
    languageUse: {
      ...languageUse,
      targetShare: languageUse.native + languageUse.target > 0
        ? Math.round((languageUse.target / (languageUse.native + languageUse.target)) * 100)
        : 0,
    },
  };
}
