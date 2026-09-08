import{randomUUID as F}from"node:crypto";import{mkdirSync as b}from"node:fs";import{Buffer as T}from"node:buffer";import{homedir as C}from"node:os";import{dirname as x,join as U}from"node:path";import{randomUUID as v}from"node:crypto";import{DatabaseSync as O}from"node:sqlite";function _(t,e=new Date){let a=s=>s.toISOString().slice(0,10),n=new Map;for(let s of t){let i=s.createdAt.slice(0,10);n.set(i,(n.get(i)??0)+1)}let r=s=>Array.from({length:s},(i,h)=>{let u=new Date(e);u.setUTCHours(0,0,0,0),u.setUTCDate(u.getUTCDate()-(s-1-h));let y=a(u);return{date:y,count:n.get(y)??0}}),c=r(7),o=0;for(let s=0;s<366;s+=1){let i=new Date(e);if(i.setUTCDate(i.getUTCDate()-s),(n.get(a(i))??0)>0)o+=1;else if(s>0||n.size>0)break}let l=new Map,d=new Map,g={native:0,target:0,mixed:0,other:0};for(let s of t){g[s.inputLanguage]+=1;for(let i of s.corrections)l.set(i.category,(l.get(i.category)??0)+1);for(let i of s.patterns){let h=i.pattern.trim().toLocaleLowerCase(),u=d.get(h)??{explanation:i.explanation,count:0};u.count+=1,d.set(h,u)}}return{totalNotes:t.length,notesThisWeek:c.reduce((s,i)=>s+i.count,0),activeDays:n.size,currentStreak:o,weeklyActivity:c,activity90Days:r(90),categoryCounts:[...l.entries()].map(([s,i])=>({category:s,count:i})).sort((s,i)=>i.count-s.count),recurringPatterns:[...d.entries()].map(([s,i])=>({pattern:s,...i})).sort((s,i)=>i.count-s.count).slice(0,50),languageUse:{...g,targetShare:g.native+g.target>0?Math.round(g.target/(g.native+g.target)*100):0}}}function D(t=process.env){return t.LANGUAGE_COACH_DB_PATH||U(C(),".language-coach","language-coach.sqlite")}function w(t){if(t)try{let e=JSON.parse(T.from(t,"base64url").toString("utf8"));return e.createdAt&&e.id?{createdAt:e.createdAt,id:e.id}:void 0}catch{return}}function P(t){return T.from(JSON.stringify({createdAt:t.createdAt,id:t.id})).toString("base64url")}function m(){return new Date().toISOString()}function E(t,e){if(typeof t!="string")return e;try{return JSON.parse(t)}catch{return e}}function N(t){return t.replace(/\/$/,"")}function p(t){return{id:t.id,turnId:t.turn_id??void 0,inputLanguage:t.input_language||"other",originalExpression:t.original_expression,polishedExpression:t.polished_expression,corrections:E(t.corrections_json,[]),patterns:E(t.patterns_json,[]),examples:E(t.examples_json,[]),nativeLanguage:t.native_language,targetLanguage:t.target_language,createdAt:t.created_at}}var f=class{database;constructor(e=D()){b(x(e),{recursive:!0}),this.database=new O(e),this.database.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;"),this.migrate()}migrate(){this.database.exec(`
      CREATE TABLE IF NOT EXISTS profile (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        native_language TEXT NOT NULL,
        target_language TEXT NOT NULL,
        coach_enabled INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL,
        sync_revision INTEGER NOT NULL DEFAULT 0
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
        created_at TEXT NOT NULL,
        sync_revision INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_learning_notes_created_at
        ON learning_notes(created_at DESC);
      CREATE TABLE IF NOT EXISTS deleted_learning_notes (
        id TEXT PRIMARY KEY,
        deleted_at TEXT NOT NULL,
        sync_revision INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS local_sync_clock (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        current_revision INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sync_checkpoints (
        remote_url TEXT NOT NULL,
        user_id TEXT NOT NULL,
        last_synced_revision INTEGER NOT NULL DEFAULT 0,
        last_synced_at TEXT,
        PRIMARY KEY (remote_url, user_id)
      );
    `),this.database.prepare("PRAGMA table_info(profile)").all().some(o=>o.name==="sync_revision")||this.database.exec("ALTER TABLE profile ADD COLUMN sync_revision INTEGER NOT NULL DEFAULT 0");let a=this.database.prepare("PRAGMA table_info(learning_notes)").all();a.some(o=>o.name==="input_language")||this.database.exec("ALTER TABLE learning_notes ADD COLUMN input_language TEXT NOT NULL DEFAULT 'other'"),a.some(o=>o.name==="sync_revision")||this.database.exec("ALTER TABLE learning_notes ADD COLUMN sync_revision INTEGER NOT NULL DEFAULT 0"),this.database.prepare("PRAGMA table_info(deleted_learning_notes)").all().some(o=>o.name==="sync_revision")||this.database.exec("ALTER TABLE deleted_learning_notes ADD COLUMN sync_revision INTEGER NOT NULL DEFAULT 0");let r=m();this.database.prepare(`INSERT OR IGNORE INTO profile
        (id, native_language, target_language, coach_enabled, updated_at, sync_revision)
        VALUES (1, 'Chinese', 'English', 1, ?, 0)`).run(r),this.database.prepare("INSERT OR IGNORE INTO local_sync_clock (id, current_revision) VALUES (1, 0)").run(),this.database.prepare(`SELECT 1 FROM profile WHERE sync_revision = 0
      UNION ALL SELECT 1 FROM learning_notes WHERE sync_revision = 0
      UNION ALL SELECT 1 FROM deleted_learning_notes WHERE sync_revision = 0 LIMIT 1`).get()&&this.database.exec(`
        UPDATE local_sync_clock SET current_revision = MAX(current_revision, 1) WHERE id = 1;
        UPDATE profile SET sync_revision = 1 WHERE sync_revision = 0;
        UPDATE learning_notes SET sync_revision = 1 WHERE sync_revision = 0;
        UPDATE deleted_learning_notes SET sync_revision = 1 WHERE sync_revision = 0;
      `)}nextSyncRevision(){return this.database.prepare(`UPDATE local_sync_clock SET current_revision = current_revision + 1
      WHERE id = 1 RETURNING current_revision`).get().current_revision}transaction(e){this.database.exec("BEGIN IMMEDIATE");try{let a=e();return this.database.exec("COMMIT"),a}catch(a){throw this.database.exec("ROLLBACK"),a}}getProfile(){let e=this.database.prepare("SELECT * FROM profile WHERE id = 1").get();return{nativeLanguage:e.native_language,targetLanguage:e.target_language,coachEnabled:!!e.coach_enabled,updatedAt:e.updated_at}}updateProfile(e){let a=this.getProfile(),n={nativeLanguage:e.nativeLanguage?.trim()||a.nativeLanguage,targetLanguage:e.targetLanguage?.trim()||a.targetLanguage,coachEnabled:e.coachEnabled??a.coachEnabled,updatedAt:m()};return this.transaction(()=>{let r=this.nextSyncRevision();this.database.prepare("UPDATE profile SET native_language = ?, target_language = ?, coach_enabled = ?, updated_at = ?, sync_revision = ? WHERE id = 1").run(n.nativeLanguage,n.targetLanguage,n.coachEnabled?1:0,n.updatedAt,r)}),n}saveNote(e){let a=this.getProfile(),n=e.turnId?.trim()||v(),r={...e,turnId:n,id:v(),inputLanguage:e.inputLanguage||"other",originalExpression:e.originalExpression.trim(),polishedExpression:e.polishedExpression.trim(),nativeLanguage:e.nativeLanguage?.trim()||a.nativeLanguage,targetLanguage:e.targetLanguage?.trim()||a.targetLanguage,createdAt:m()};if(!r.originalExpression||!r.polishedExpression)throw new Error("Both originalExpression and polishedExpression are required.");let c=this.database.prepare("SELECT id FROM learning_notes WHERE turn_id = ?").get(n);if(c){let o=this.database.prepare("SELECT * FROM learning_notes WHERE id = ?").get(c.id);return p(o)}return this.transaction(()=>{let o=this.nextSyncRevision();this.database.prepare(`INSERT INTO learning_notes (
        id, turn_id, input_language, original_expression, polished_expression, corrections_json,
        patterns_json, examples_json, native_language, target_language, created_at, sync_revision
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(r.id,r.turnId??null,r.inputLanguage,r.originalExpression,r.polishedExpression,JSON.stringify(r.corrections),JSON.stringify(r.patterns),JSON.stringify(r.examples),r.nativeLanguage,r.targetLanguage,r.createdAt,o)}),r}hasNoteForTurn(e){return!!this.database.prepare("SELECT 1 FROM learning_notes WHERE turn_id = ?").get(e)}listNotes(e=100,a=0){let n=Math.max(1,Math.min(500,Math.trunc(e))),r=Math.max(0,Math.trunc(a));return this.database.prepare("SELECT * FROM learning_notes ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?").all(n,r).map(p)}listAllNotes(){return this.database.prepare("SELECT * FROM learning_notes ORDER BY created_at DESC, id DESC").all().map(p)}deleteNote(e){return this.transaction(()=>{let a=this.database.prepare("DELETE FROM learning_notes WHERE id = ?").run(e);if(a.changes>0){let n=this.nextSyncRevision();this.database.prepare(`INSERT INTO deleted_learning_notes (id, deleted_at, sync_revision) VALUES (?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET deleted_at = excluded.deleted_at, sync_revision = excluded.sync_revision`).run(e,m(),n)}return a.changes>0})}getProgress(){return _(this.listAllNotes())}getDashboardData(e=50,a){let n=Math.max(1,Math.min(100,Math.trunc(e))),r=w(a),c=this.database.prepare(`SELECT * FROM learning_notes
      WHERE (? IS NULL OR created_at < ? OR (created_at = ? AND id < ?))
      ORDER BY created_at DESC, id DESC LIMIT ?`).all(r?.createdAt??null,r?.createdAt??null,r?.createdAt??null,r?.id??null,n+1),o=c.length>n,l=c.slice(0,n).map(p),d=this.getProgress();return{profile:this.getProfile(),notes:l,progress:d,notesPage:{limit:n,hasMore:o,nextCursor:o&&l.length?P(l[l.length-1]):void 0}}}getSyncCheckpoint(e,a){let n=this.database.prepare(`SELECT last_synced_revision, last_synced_at FROM sync_checkpoints
      WHERE remote_url = ? AND user_id = ?`).get(N(e),a);return{revision:n?.last_synced_revision??0,lastSyncedAt:n?.last_synced_at??void 0}}getSyncSnapshot(e,a){let n=this.getSyncCheckpoint(e,a),r=this.database.prepare("SELECT current_revision FROM local_sync_clock WHERE id = 1").get().current_revision,c=this.database.prepare("SELECT sync_revision FROM profile WHERE id = 1").get(),o=this.database.prepare("SELECT id, deleted_at FROM deleted_learning_notes WHERE sync_revision > ? AND sync_revision <= ? ORDER BY sync_revision").all(n.revision,r),l=this.database.prepare(`SELECT * FROM learning_notes WHERE sync_revision > ? AND sync_revision <= ?
      ORDER BY sync_revision`).all(n.revision,r);return{profile:c.sync_revision>n.revision&&c.sync_revision<=r?this.getProfile():void 0,notes:l.map(p),deletedNotes:o.map(d=>({id:d.id,deletedAt:d.deleted_at})),throughRevision:r}}markSyncCheckpoint(e,a,n,r){this.database.prepare(`INSERT INTO sync_checkpoints
      (remote_url, user_id, last_synced_revision, last_synced_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(remote_url, user_id) DO UPDATE SET
        last_synced_revision = MAX(sync_checkpoints.last_synced_revision, excluded.last_synced_revision),
        last_synced_at = excluded.last_synced_at`).run(N(e),a,n,r)}close(){this.database.close()}};import*as k from"node:tls";function M(){let t=k;if(!t.getCACertificates||!t.setDefaultCACertificates)return;let e=new Set([...t.getCACertificates("default"),...t.getCACertificates("system")]);t.setDefaultCACertificates([...e])}M();function L({nativeLanguage:t,targetLanguage:e},a){let n=e.trim().toLowerCase()==="english"?"natural, contemporary American English":`natural, contemporary ${e}`,r=a?`Use turnId \`${a}\` when calling \`save_learning_note\` for this turn.`:"Omit turnId when calling `save_learning_note`; the tool will generate a UUID. Do not reuse a previous turn's ID.";return`# Language coach

The learner's native language is ${t}. Their target language is ${e}. ${r}

## Coach instructions

Before doing the user's requested task, coach the language in their message:
1. Aim for ${n}: the way people normally speak and write in daily life, not stiff or textbook-style language. Preserve the user's intended meaning, tone, and level of politeness.
2. If the user writes in ${e}, check grammar, spelling, collocations, word choice, tone, and contextual appropriateness. Briefly identify meaningful problems, then rewrite the message the way a native speaker would naturally express it in the same situation. Fix awkward phrasing even when it is technically grammatical.
3. If the user writes mainly in ${t}, translate the intended meaning into ${n}. Translate the message as a whole instead of following the original word order or sentence structure.
4. Prefer common words, natural collocations, and contractions when they fit. Avoid unnecessary formality, but do not add slang, idioms, or friendliness that changes the user's voice.
5. When useful, give a small number of casual, neutral, formal, or tactful alternatives and say when each fits. Treat neutral everyday language as the default.
6. Highlight reusable grammar patterns, sentence structures, collocations, or phrases. Explain them briefly in ${t} when that helps the learner.
7. Give several concise transfer examples in varied settings when useful: work, shopping, travel, social situations, and everyday life.
8. If missing context would materially change the wording, ask for that context or provide clearly labeled likely versions.
9. Use the Language Coach MCP tool \`save_learning_note\` to save a learning note when the polished ${e} version goes beyond simple singular/plural or verb tense corrections and includes more substantial grammar changes or more natural phrasing. Do not save a note if the only changes are singular/plural forms, verb tense, or optional stylistic preferences.

## Coaching output format:
Use a Markdown bullet list with the following structure. Replace the placeholders with the user's wording, the polished version, concise explanations, and useful reusable patterns. Add more pattern bullets when useful.

- Your version: [Original wording]
- Polished version: [Polished wording]
  - [Fixes or changes, with details and explanations]
- Repeat patterns:
  - Pattern A: [Reusable pattern and brief explanation]
    - Work: [Example at work]
    - Daily life: [Example in daily life]

---

Place the Markdown horizontal rule shown above after the coaching list, with a blank line before and after it. Then complete the user's actual task.

## Privacy and persistence:
- Save only the language-learning note: the original expression being coached, the polished ${e} version, corrections, reusable patterns, and transfer examples.
- Never save the user's unrelated task details, private task context, files, or the answer to their task.
- Follow the saving criteria in instruction 9. Do not save anything when the expression is already natural, correct, and appropriate.
- Classify the user's original message for \`inputLanguage\`: use \`native\` when it is mainly ${t}, \`target\` when it is mainly ${e}, \`mixed\` when both are meaningfully used, and \`other\` when neither classification fits.
- Do not mention the persistence call unless it fails or the user asks about storage.`}async function S(){let t="";for await(let e of process.stdin)t+=e;return t?JSON.parse(t):{}}var A=await S(),I=new f,R=I.getProfile();I.close();R.coachEnabled||process.exit(0);var G=(typeof A.turn_id=="string"?A.turn_id.trim():"")||F();process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:"UserPromptSubmit",additionalContext:L(R,G)}}));
