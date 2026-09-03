import{mkdirSync as R}from"node:fs";import{Buffer as v}from"node:buffer";import{homedir as C}from"node:os";import{dirname as b,join as x}from"node:path";import{randomUUID as U}from"node:crypto";import{DatabaseSync as O}from"node:sqlite";function _(n,e=new Date){let r=s=>s.toISOString().slice(0,10),t=new Map;for(let s of n){let i=s.createdAt.slice(0,10);t.set(i,(t.get(i)??0)+1)}let a=s=>Array.from({length:s},(i,h)=>{let u=new Date(e);u.setUTCHours(0,0,0,0),u.setUTCDate(u.getUTCDate()-(s-1-h));let E=r(u);return{date:E,count:t.get(E)??0}}),c=a(7),o=0;for(let s=0;s<366;s+=1){let i=new Date(e);if(i.setUTCDate(i.getUTCDate()-s),(t.get(r(i))??0)>0)o+=1;else if(s>0||t.size>0)break}let l=new Map,d=new Map,g={native:0,target:0,mixed:0,other:0};for(let s of n){g[s.inputLanguage]+=1;for(let i of s.corrections)l.set(i.category,(l.get(i.category)??0)+1);for(let i of s.patterns){let h=i.pattern.trim().toLocaleLowerCase(),u=d.get(h)??{explanation:i.explanation,count:0};u.count+=1,d.set(h,u)}}return{totalNotes:n.length,notesThisWeek:c.reduce((s,i)=>s+i.count,0),activeDays:t.size,currentStreak:o,weeklyActivity:c,activity90Days:a(90),categoryCounts:[...l.entries()].map(([s,i])=>({category:s,count:i})).sort((s,i)=>i.count-s.count),recurringPatterns:[...d.entries()].map(([s,i])=>({pattern:s,...i})).sort((s,i)=>i.count-s.count).slice(0,50),languageUse:{...g,targetShare:g.native+g.target>0?Math.round(g.target/(g.native+g.target)*100):0}}}function D(n=process.env){return n.LANGUAGE_COACH_DB_PATH||x(C(),".language-coach","language-coach.sqlite")}function P(n){if(n)try{let e=JSON.parse(v.from(n,"base64url").toString("utf8"));return e.createdAt&&e.id?{createdAt:e.createdAt,id:e.id}:void 0}catch{return}}function w(n){return v.from(JSON.stringify({createdAt:n.createdAt,id:n.id})).toString("base64url")}function m(){return new Date().toISOString()}function y(n,e){if(typeof n!="string")return e;try{return JSON.parse(n)}catch{return e}}function N(n){return n.replace(/\/$/,"")}function p(n){return{id:n.id,turnId:n.turn_id??void 0,inputLanguage:n.input_language||"other",originalExpression:n.original_expression,polishedExpression:n.polished_expression,corrections:y(n.corrections_json,[]),patterns:y(n.patterns_json,[]),examples:y(n.examples_json,[]),nativeLanguage:n.native_language,targetLanguage:n.target_language,createdAt:n.created_at}}var f=class{database;constructor(e=D()){R(b(e),{recursive:!0}),this.database=new O(e),this.database.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;"),this.migrate()}migrate(){this.database.exec(`
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
    `),this.database.prepare("PRAGMA table_info(profile)").all().some(o=>o.name==="sync_revision")||this.database.exec("ALTER TABLE profile ADD COLUMN sync_revision INTEGER NOT NULL DEFAULT 0");let r=this.database.prepare("PRAGMA table_info(learning_notes)").all();r.some(o=>o.name==="input_language")||this.database.exec("ALTER TABLE learning_notes ADD COLUMN input_language TEXT NOT NULL DEFAULT 'other'"),r.some(o=>o.name==="sync_revision")||this.database.exec("ALTER TABLE learning_notes ADD COLUMN sync_revision INTEGER NOT NULL DEFAULT 0"),this.database.prepare("PRAGMA table_info(deleted_learning_notes)").all().some(o=>o.name==="sync_revision")||this.database.exec("ALTER TABLE deleted_learning_notes ADD COLUMN sync_revision INTEGER NOT NULL DEFAULT 0");let a=m();this.database.prepare(`INSERT OR IGNORE INTO profile
        (id, native_language, target_language, coach_enabled, updated_at, sync_revision)
        VALUES (1, 'Chinese', 'English', 1, ?, 0)`).run(a),this.database.prepare("INSERT OR IGNORE INTO local_sync_clock (id, current_revision) VALUES (1, 0)").run(),this.database.prepare(`SELECT 1 FROM profile WHERE sync_revision = 0
      UNION ALL SELECT 1 FROM learning_notes WHERE sync_revision = 0
      UNION ALL SELECT 1 FROM deleted_learning_notes WHERE sync_revision = 0 LIMIT 1`).get()&&this.database.exec(`
        UPDATE local_sync_clock SET current_revision = MAX(current_revision, 1) WHERE id = 1;
        UPDATE profile SET sync_revision = 1 WHERE sync_revision = 0;
        UPDATE learning_notes SET sync_revision = 1 WHERE sync_revision = 0;
        UPDATE deleted_learning_notes SET sync_revision = 1 WHERE sync_revision = 0;
      `)}nextSyncRevision(){return this.database.prepare(`UPDATE local_sync_clock SET current_revision = current_revision + 1
      WHERE id = 1 RETURNING current_revision`).get().current_revision}transaction(e){this.database.exec("BEGIN IMMEDIATE");try{let r=e();return this.database.exec("COMMIT"),r}catch(r){throw this.database.exec("ROLLBACK"),r}}getProfile(){let e=this.database.prepare("SELECT * FROM profile WHERE id = 1").get();return{nativeLanguage:e.native_language,targetLanguage:e.target_language,coachEnabled:!!e.coach_enabled,updatedAt:e.updated_at}}updateProfile(e){let r=this.getProfile(),t={nativeLanguage:e.nativeLanguage?.trim()||r.nativeLanguage,targetLanguage:e.targetLanguage?.trim()||r.targetLanguage,coachEnabled:e.coachEnabled??r.coachEnabled,updatedAt:m()};return this.transaction(()=>{let a=this.nextSyncRevision();this.database.prepare("UPDATE profile SET native_language = ?, target_language = ?, coach_enabled = ?, updated_at = ?, sync_revision = ? WHERE id = 1").run(t.nativeLanguage,t.targetLanguage,t.coachEnabled?1:0,t.updatedAt,a)}),t}saveNote(e){let r=this.getProfile(),t={...e,id:U(),inputLanguage:e.inputLanguage||"other",originalExpression:e.originalExpression.trim(),polishedExpression:e.polishedExpression.trim(),nativeLanguage:e.nativeLanguage?.trim()||r.nativeLanguage,targetLanguage:e.targetLanguage?.trim()||r.targetLanguage,createdAt:m()};if(!t.originalExpression||!t.polishedExpression)throw new Error("Both originalExpression and polishedExpression are required.");let a=e.turnId?this.database.prepare("SELECT id FROM learning_notes WHERE turn_id = ?").get(e.turnId):void 0;if(a){let c=this.database.prepare("SELECT * FROM learning_notes WHERE id = ?").get(a.id);return p(c)}return this.transaction(()=>{let c=this.nextSyncRevision();this.database.prepare(`INSERT INTO learning_notes (
        id, turn_id, input_language, original_expression, polished_expression, corrections_json,
        patterns_json, examples_json, native_language, target_language, created_at, sync_revision
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(t.id,t.turnId??null,t.inputLanguage,t.originalExpression,t.polishedExpression,JSON.stringify(t.corrections),JSON.stringify(t.patterns),JSON.stringify(t.examples),t.nativeLanguage,t.targetLanguage,t.createdAt,c)}),t}hasNoteForTurn(e){return!!this.database.prepare("SELECT 1 FROM learning_notes WHERE turn_id = ?").get(e)}listNotes(e=100,r=0){let t=Math.max(1,Math.min(500,Math.trunc(e))),a=Math.max(0,Math.trunc(r));return this.database.prepare("SELECT * FROM learning_notes ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?").all(t,a).map(p)}listAllNotes(){return this.database.prepare("SELECT * FROM learning_notes ORDER BY created_at DESC, id DESC").all().map(p)}deleteNote(e){return this.transaction(()=>{let r=this.database.prepare("DELETE FROM learning_notes WHERE id = ?").run(e);if(r.changes>0){let t=this.nextSyncRevision();this.database.prepare(`INSERT INTO deleted_learning_notes (id, deleted_at, sync_revision) VALUES (?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET deleted_at = excluded.deleted_at, sync_revision = excluded.sync_revision`).run(e,m(),t)}return r.changes>0})}getProgress(){return _(this.listAllNotes())}getDashboardData(e=50,r){let t=Math.max(1,Math.min(100,Math.trunc(e))),a=P(r),c=this.database.prepare(`SELECT * FROM learning_notes
      WHERE (? IS NULL OR created_at < ? OR (created_at = ? AND id < ?))
      ORDER BY created_at DESC, id DESC LIMIT ?`).all(a?.createdAt??null,a?.createdAt??null,a?.createdAt??null,a?.id??null,t+1),o=c.length>t,l=c.slice(0,t).map(p),d=this.getProgress();return{profile:this.getProfile(),notes:l,progress:d,notesPage:{limit:t,hasMore:o,nextCursor:o&&l.length?w(l[l.length-1]):void 0}}}getSyncCheckpoint(e,r){let t=this.database.prepare(`SELECT last_synced_revision, last_synced_at FROM sync_checkpoints
      WHERE remote_url = ? AND user_id = ?`).get(N(e),r);return{revision:t?.last_synced_revision??0,lastSyncedAt:t?.last_synced_at??void 0}}getSyncSnapshot(e,r){let t=this.getSyncCheckpoint(e,r),a=this.database.prepare("SELECT current_revision FROM local_sync_clock WHERE id = 1").get().current_revision,c=this.database.prepare("SELECT sync_revision FROM profile WHERE id = 1").get(),o=this.database.prepare("SELECT id, deleted_at FROM deleted_learning_notes WHERE sync_revision > ? AND sync_revision <= ? ORDER BY sync_revision").all(t.revision,a),l=this.database.prepare(`SELECT * FROM learning_notes WHERE sync_revision > ? AND sync_revision <= ?
      ORDER BY sync_revision`).all(t.revision,a);return{profile:c.sync_revision>t.revision&&c.sync_revision<=a?this.getProfile():void 0,notes:l.map(p),deletedNotes:o.map(d=>({id:d.id,deletedAt:d.deleted_at})),throughRevision:a}}markSyncCheckpoint(e,r,t,a){this.database.prepare(`INSERT INTO sync_checkpoints
      (remote_url, user_id, last_synced_revision, last_synced_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(remote_url, user_id) DO UPDATE SET
        last_synced_revision = MAX(sync_checkpoints.last_synced_revision, excluded.last_synced_revision),
        last_synced_at = excluded.last_synced_at`).run(N(e),r,t,a)}close(){this.database.close()}};import*as k from"node:tls";function M(){let n=k;if(!n.getCACertificates||!n.setDefaultCACertificates)return;let e=new Set([...n.getCACertificates("default"),...n.getCACertificates("system")]);n.setDefaultCACertificates([...e])}M();function T({nativeLanguage:n,targetLanguage:e},r){let t=e.trim().toLowerCase()==="english"?"natural, contemporary American English":`natural, contemporary ${e}`,a=r?` with turnId \`${r}\``:"; omit turnId unless the host provides a reliable identifier for the current turn";return`# Language coach mode

The learner's native language is ${n}. Their target language is ${e}.

Before doing the user's requested task, coach the language in their message:
1. Aim for ${t}: the way people normally speak and write in daily life, not stiff or textbook-style language. Preserve the user's intended meaning, tone, and level of politeness.
2. If the user writes in ${e}, check grammar, spelling, collocations, word choice, tone, and contextual appropriateness. Briefly identify meaningful problems, then rewrite the message the way a native speaker would naturally express it in the same situation. Fix awkward phrasing even when it is technically grammatical.
3. If the user writes mainly in ${n}, translate the intended meaning into ${t}. Translate the message as a whole instead of following the original word order or sentence structure.
4. Prefer common words, natural collocations, and contractions when they fit. Avoid unnecessary formality, but do not add slang, idioms, or friendliness that changes the user's voice.
5. When useful, give a small number of casual, neutral, formal, or tactful alternatives and say when each fits. Treat neutral everyday language as the default.
6. Highlight reusable grammar patterns, sentence structures, collocations, or phrases. Explain them briefly in ${n} when that helps the learner.
7. Give several concise transfer examples in varied settings when useful: work, shopping, travel, social situations, and everyday life.
8. If missing context would materially change the wording, ask for that context or provide clearly labeled likely versions.
9. Keep this coaching section proportionate. Then complete the user's actual task.

Privacy and persistence:
- Save only the language-learning note: the original expression being coached, the polished ${e} version, corrections, reusable patterns, and transfer examples.
- Never save the user's unrelated task details, private task context, files, or the answer to their task.
- Use judgment before saving. Save a note only when the user's expression contains a meaningful error, unnatural or contextually inappropriate wording, or a genuinely useful reusable pattern. Do not save anything when the expression is already natural, correct, and appropriate. A merely optional stylistic rewrite does not justify a note.
- When a note is worth saving, call the Language Coach MCP tool \`save_learning_note\` before the final response${a}. Use one of these correction categories only: grammar, spelling, collocation, word-choice, tone, context, structure. Use one of these example contexts only: work, shopping, travel, social, everyday, other.
- Classify the user's original message for \`inputLanguage\`: use \`native\` when it is mainly ${n}, \`target\` when it is mainly ${e}, \`mixed\` when both are meaningfully used, and \`other\` when neither classification fits.
- Do not mention the persistence call unless it fails or the user asks about storage.`}async function L(){let n="";for await(let e of process.stdin)n+=e;return n?JSON.parse(n):{}}var S=await L(),A=new f,I=A.getProfile();A.close();I.coachEnabled||process.exit(0);var F=typeof S.turn_id=="string"?S.turn_id:"";process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:"UserPromptSubmit",additionalContext:T(I,F)}}));
