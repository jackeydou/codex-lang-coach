import{mkdirSync as b}from"node:fs";import{homedir as v}from"node:os";import{dirname as C,join as I}from"node:path";import{randomUUID as S}from"node:crypto";import{DatabaseSync as A}from"node:sqlite";function P(r=process.env){return r.LANGUAGE_COACH_DB_PATH||I(v(),".language-coach","language-coach.sqlite")}function L(){return new Date().toISOString()}function E(r,e){if(typeof r!="string")return e;try{return JSON.parse(r)}catch{return e}}function T(r){return{id:r.id,turnId:r.turn_id??void 0,inputLanguage:r.input_language||"other",originalExpression:r.original_expression,polishedExpression:r.polished_expression,corrections:E(r.corrections_json,[]),patterns:E(r.patterns_json,[]),examples:E(r.examples_json,[]),nativeLanguage:r.native_language,targetLanguage:r.target_language,createdAt:r.created_at}}var p=class{database;constructor(e=P()){b(C(e),{recursive:!0}),this.database=new A(e),this.database.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;"),this.migrate()}migrate(){this.database.exec(`
      CREATE TABLE IF NOT EXISTS profile (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        native_language TEXT NOT NULL,
        target_language TEXT NOT NULL,
        coach_enabled INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS learning_notes (
        id TEXT PRIMARY KEY,
        turn_id TEXT UNIQUE,
        input_language TEXT NOT NULL DEFAULT 'other' CHECK (input_language IN ('native', 'target', 'mixed', 'other')),
        original_expression TEXT NOT NULL,
        polished_expression TEXT NOT NULL,
        corrections_json TEXT NOT NULL,
        patterns_json TEXT NOT NULL,
        examples_json TEXT NOT NULL,
        native_language TEXT NOT NULL,
        target_language TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_learning_notes_created_at
        ON learning_notes(created_at DESC);
    `),this.database.prepare("PRAGMA table_info(learning_notes)").all().some(t=>t.name==="input_language")||this.database.exec("ALTER TABLE learning_notes ADD COLUMN input_language TEXT NOT NULL DEFAULT 'other'");let o=L();this.database.prepare(`INSERT OR IGNORE INTO profile
        (id, native_language, target_language, coach_enabled, updated_at)
        VALUES (1, 'Chinese', 'English', 1, ?)`).run(o)}getProfile(){let e=this.database.prepare("SELECT * FROM profile WHERE id = 1").get();return{nativeLanguage:e.native_language,targetLanguage:e.target_language,coachEnabled:!!e.coach_enabled,updatedAt:e.updated_at}}updateProfile(e){let o=this.getProfile(),t={nativeLanguage:e.nativeLanguage?.trim()||o.nativeLanguage,targetLanguage:e.targetLanguage?.trim()||o.targetLanguage,coachEnabled:e.coachEnabled??o.coachEnabled,updatedAt:L()};return this.database.prepare("UPDATE profile SET native_language = ?, target_language = ?, coach_enabled = ?, updated_at = ? WHERE id = 1").run(t.nativeLanguage,t.targetLanguage,t.coachEnabled?1:0,t.updatedAt),t}saveNote(e){let o=this.getProfile(),t={...e,id:S(),inputLanguage:e.inputLanguage||"other",originalExpression:e.originalExpression.trim(),polishedExpression:e.polishedExpression.trim(),nativeLanguage:e.nativeLanguage?.trim()||o.nativeLanguage,targetLanguage:e.targetLanguage?.trim()||o.targetLanguage,createdAt:L()};if(!t.originalExpression||!t.polishedExpression)throw new Error("Both originalExpression and polishedExpression are required.");let i=e.turnId?this.database.prepare("SELECT id FROM learning_notes WHERE turn_id = ?").get(e.turnId):void 0;if(i){let c=this.database.prepare("SELECT * FROM learning_notes WHERE id = ?").get(i.id);return T(c)}return this.database.prepare(`INSERT INTO learning_notes (
        id, turn_id, input_language, original_expression, polished_expression, corrections_json,
        patterns_json, examples_json, native_language, target_language, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(t.id,t.turnId??null,t.inputLanguage,t.originalExpression,t.polishedExpression,JSON.stringify(t.corrections),JSON.stringify(t.patterns),JSON.stringify(t.examples),t.nativeLanguage,t.targetLanguage,t.createdAt),t}hasNoteForTurn(e){return!!this.database.prepare("SELECT 1 FROM learning_notes WHERE turn_id = ?").get(e)}listNotes(e=100){let o=Math.max(1,Math.min(500,Math.trunc(e)));return this.database.prepare("SELECT * FROM learning_notes ORDER BY created_at DESC LIMIT ?").all(o).map(T)}deleteNote(e){return this.database.prepare("DELETE FROM learning_notes WHERE id = ?").run(e).changes>0}getProgress(){let e=this.listNotes(500),o=new Date,t=n=>n.toISOString().slice(0,10),i=new Map;for(let n of e){let a=n.createdAt.slice(0,10);i.set(a,(i.get(a)??0)+1)}let c=Array.from({length:7},(n,a)=>{let g=new Date(o);g.setUTCHours(0,0,0,0),g.setUTCDate(g.getUTCDate()-(6-a));let u=t(g);return{date:u,count:i.get(u)??0}}),f=0;for(let n=0;n<366;n+=1){let a=new Date(o);if(a.setUTCDate(a.getUTCDate()-n),(i.get(t(a))??0)>0)f+=1;else if(n>0||i.size>0)break}let h=new Map,m=new Map,s={native:0,target:0,mixed:0,other:0};for(let n of e){s[n.inputLanguage]+=1;for(let a of n.corrections)h.set(a.category,(h.get(a.category)??0)+1);for(let a of n.patterns){let g=a.pattern.trim().toLocaleLowerCase(),u=m.get(g)??{explanation:a.explanation,count:0};u.count+=1,m.set(g,u)}}return{totalNotes:e.length,notesThisWeek:c.reduce((n,a)=>n+a.count,0),activeDays:i.size,currentStreak:f,weeklyActivity:c,categoryCounts:[...h.entries()].map(([n,a])=>({category:n,count:a})).sort((n,a)=>a.count-n.count),recurringPatterns:[...m.entries()].map(([n,a])=>({pattern:n,...a})).sort((n,a)=>a.count-n.count).slice(0,8),languageUse:{...s,targetShare:s.native+s.target>0?Math.round(s.target/(s.native+s.target)*100):0}}}getDashboardData(e=100){return{profile:this.getProfile(),notes:this.listNotes(e),progress:this.getProgress()}}close(){this.database.close()}};async function _(){let r="";for await(let e of process.stdin)r+=e;return r?JSON.parse(r):{}}var x=await _(),N=new p,y=N.getProfile();N.close();y.coachEnabled||process.exit(0);var{nativeLanguage:d,targetLanguage:l}=y,O=typeof x.turn_id=="string"?x.turn_id:"",w=`# Language coach mode

The learner's native language is ${d}. Their target language is ${l}.

Before doing the user's requested task, coach the language in their message:
1. If the user writes in ${l}, check grammar, spelling, collocations, word choice, tone, and contextual appropriateness. Identify errors or unnatural phrasing briefly, then provide a natural native-speaker version. Rewrite freely when that is clearer.
2. If the user writes mainly in ${d}, infer the intended meaning and translate it naturally into ${l}. Do not preserve source-language word order.
3. When useful, give a small number of formal, casual, or tactful alternatives and say when each fits.
4. Highlight reusable grammar patterns, sentence structures, collocations, or phrases. Explain them briefly in ${d} when that helps the learner.
5. Give several concise transfer examples in varied settings when useful: work, shopping, travel, social situations, and everyday life.
6. If missing context would materially change the wording, ask for that context or provide clearly labeled likely versions.
7. Keep this coaching section proportionate. Then complete the user's actual task.

Privacy and persistence:
- Save only the language-learning note: the original expression being coached, the polished ${l} version, corrections, reusable patterns, and transfer examples.
- Never save the user's unrelated task details, private task context, files, or the answer to their task.
- Use judgment before saving. Save a note only when the user's expression contains a meaningful error, unnatural or contextually inappropriate wording, or a genuinely useful reusable pattern. Do not save anything when the expression is already natural, correct, and appropriate. A merely optional stylistic rewrite does not justify a note.
- When a note is worth saving, call the Language Coach MCP tool \`save_learning_note\` before the final response with turnId \`${O}\`. Use one of these correction categories only: grammar, spelling, collocation, word-choice, tone, context, structure. Use one of these example contexts only: work, shopping, travel, social, everyday, other.
- Classify the user's original message for \`inputLanguage\`: use \`native\` when it is mainly ${d}, \`target\` when it is mainly ${l}, \`mixed\` when both are meaningfully used, and \`other\` when neither classification fits.
- Do not mention the persistence call unless it fails or the user asks about storage.`;process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:"UserPromptSubmit",additionalContext:w}}));
