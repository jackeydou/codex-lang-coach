import{mkdirSync as k}from"node:fs";import{Buffer as _}from"node:buffer";import{homedir as M}from"node:os";import{dirname as F,join as H}from"node:path";import{randomUUID as f}from"node:crypto";import{DatabaseSync as X}from"node:sqlite";function y(t,e=new Date){let r=a=>a.toISOString().slice(0,10),s=new Map;for(let a of t){let o=a.createdAt.slice(0,10);s.set(o,(s.get(o)??0)+1)}let n=a=>Array.from({length:a},(o,p)=>{let E=new Date(e);E.setUTCHours(0,0,0,0),E.setUTCDate(E.getUTCDate()-(a-1-p));let S=r(E);return{date:S,count:s.get(S)??0}}),c=n(7),i=0;for(let a=0;a<366;a+=1){let o=new Date(e);if(o.setUTCDate(o.getUTCDate()-a),(s.get(r(o))??0)>0)i+=1;else if(a>0||s.size>0)break}let d=new Map,g=new Map,l={native:0,target:0,mixed:0,other:0};for(let a of t){l[a.inputLanguage]+=1;for(let o of a.corrections)d.set(o.category,(d.get(o.category)??0)+1);for(let o of a.patterns){let p=o.pattern.trim().toLocaleLowerCase(),E=g.get(p)??{explanation:o.explanation,count:0};E.count+=1,g.set(p,E)}}return{totalNotes:t.length,notesThisWeek:c.reduce((a,o)=>a+o.count,0),activeDays:s.size,currentStreak:i,weeklyActivity:c,activity90Days:n(90),categoryCounts:[...d.entries()].map(([a,o])=>({category:a,count:o})).sort((a,o)=>o.count-a.count),recurringPatterns:[...g.entries()].map(([a,o])=>({pattern:a,...o})).sort((a,o)=>o.count-a.count).slice(0,50),languageUse:{...l,targetShare:l.native+l.target>0?Math.round(l.target/(l.native+l.target)*100):0}}}var R=[1,3,7,14,30,60],L=1800*1e3;function w(){return{stage:0,reviewCount:0,lastReviewedAt:null,nextReviewAt:null,version:0,algorithmVersion:"fixed-v1"}}function I(t,e=Date.now()){return t.stage===0||t.nextReviewAt!==null&&Date.parse(t.nextReviewAt)<=e}function A(t,e){let r=Math.min(t.stage+1,R.length);return{stage:r,reviewCount:t.reviewCount+1,lastReviewedAt:e,nextReviewAt:new Date(Date.parse(e)+R[r-1]*864e5).toISOString(),version:t.version+1,algorithmVersion:"fixed-v1"}}var u=class extends Error{constructor(r,s,n){super(s);this.code=r;this.review=n;this.name="ReviewError"}code;review};function W(t=process.env){return t.LANGUAGE_COACH_DB_PATH||H(M(),".language-coach","language-coach.sqlite")}function G(t){if(t)try{let e=JSON.parse(_.from(t,"base64url").toString("utf8"));return e.createdAt&&e.id?{createdAt:e.createdAt,id:e.id}:void 0}catch{return}}function B(t){return _.from(JSON.stringify({createdAt:t.createdAt,id:t.id})).toString("base64url")}function h(){return new Date().toISOString()}function N(t,e){if(typeof t!="string")return e;try{return JSON.parse(t)}catch{return e}}function C(t){return t.replace(/\/$/,"")}function v(t){return{id:t.id,turnId:t.turn_id??void 0,inputLanguage:t.input_language||"other",originalExpression:t.original_expression,polishedExpression:t.polished_expression,corrections:N(t.corrections_json,[]),patterns:N(t.patterns_json,[]),examples:N(t.examples_json,[]),nativeLanguage:t.native_language,targetLanguage:t.target_language,createdAt:t.created_at}}var T=`reviews.stage, reviews.review_count, reviews.last_reviewed_at,
  reviews.next_review_at, reviews.version`;function b(t){return!t||t.stage===null?w():{stage:t.stage,reviewCount:t.review_count,lastReviewedAt:t.last_reviewed_at,nextReviewAt:t.next_review_at,version:t.version,algorithmVersion:"fixed-v1"}}function x(t){return{...v(t),review:b(t)}}function V(t){try{let e=JSON.parse(_.from(t,"base64url").toString("utf8"));if(typeof e.sessionId=="string"&&Number.isSafeInteger(e.afterRank)&&e.afterRank>=0)return{sessionId:e.sessionId,afterRank:e.afterRank}}catch{}throw new u("INVALID_REQUEST","Invalid review cursor. Refresh the review order.")}var m=class{database;constructor(e=W()){k(F(e),{recursive:!0}),this.database=new X(e),this.database.exec("PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;"),this.migrate()}migrate(){this.database.exec(`
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
      CREATE TABLE IF NOT EXISTS learning_note_reviews (
        note_id TEXT PRIMARY KEY REFERENCES learning_notes(id) ON DELETE CASCADE,
        stage INTEGER NOT NULL CHECK (stage BETWEEN 1 AND 6),
        review_count INTEGER NOT NULL CHECK (review_count > 0),
        last_reviewed_at TEXT NOT NULL,
        next_review_at TEXT NOT NULL,
        version INTEGER NOT NULL CHECK (version > 0),
        algorithm_version TEXT NOT NULL DEFAULT 'fixed-v1'
      );
      CREATE INDEX IF NOT EXISTS idx_learning_reviews_due ON learning_note_reviews(next_review_at, note_id);
      CREATE TABLE IF NOT EXISTS learning_review_events (
        request_id TEXT PRIMARY KEY,
        note_id TEXT NOT NULL REFERENCES learning_notes(id) ON DELETE CASCADE,
        expected_version INTEGER NOT NULL,
        reviewed_at TEXT NOT NULL,
        response_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS review_sessions (
        id TEXT PRIMARY KEY,
        as_of TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS review_session_items (
        session_id TEXT NOT NULL REFERENCES review_sessions(id) ON DELETE CASCADE,
        rank INTEGER NOT NULL,
        note_id TEXT NOT NULL,
        PRIMARY KEY (session_id, rank)
      );
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
    `),this.database.prepare("PRAGMA table_info(profile)").all().some(i=>i.name==="sync_revision")||this.database.exec("ALTER TABLE profile ADD COLUMN sync_revision INTEGER NOT NULL DEFAULT 0");let r=this.database.prepare("PRAGMA table_info(learning_notes)").all();r.some(i=>i.name==="input_language")||this.database.exec("ALTER TABLE learning_notes ADD COLUMN input_language TEXT NOT NULL DEFAULT 'other'"),r.some(i=>i.name==="sync_revision")||this.database.exec("ALTER TABLE learning_notes ADD COLUMN sync_revision INTEGER NOT NULL DEFAULT 0"),this.database.prepare("PRAGMA table_info(deleted_learning_notes)").all().some(i=>i.name==="sync_revision")||this.database.exec("ALTER TABLE deleted_learning_notes ADD COLUMN sync_revision INTEGER NOT NULL DEFAULT 0");let n=h();this.database.prepare(`INSERT OR IGNORE INTO profile
        (id, native_language, target_language, coach_enabled, updated_at, sync_revision)
        VALUES (1, 'Chinese', 'English', 1, ?, 0)`).run(n),this.database.prepare("INSERT OR IGNORE INTO local_sync_clock (id, current_revision) VALUES (1, 0)").run(),this.database.prepare(`SELECT 1 FROM profile WHERE sync_revision = 0
      UNION ALL SELECT 1 FROM learning_notes WHERE sync_revision = 0
      UNION ALL SELECT 1 FROM deleted_learning_notes WHERE sync_revision = 0 LIMIT 1`).get()&&this.database.exec(`
        UPDATE local_sync_clock SET current_revision = MAX(current_revision, 1) WHERE id = 1;
        UPDATE profile SET sync_revision = 1 WHERE sync_revision = 0;
        UPDATE learning_notes SET sync_revision = 1 WHERE sync_revision = 0;
        UPDATE deleted_learning_notes SET sync_revision = 1 WHERE sync_revision = 0;
      `)}nextSyncRevision(){return this.database.prepare(`UPDATE local_sync_clock SET current_revision = current_revision + 1
      WHERE id = 1 RETURNING current_revision`).get().current_revision}transaction(e){this.database.exec("BEGIN IMMEDIATE");try{let r=e();return this.database.exec("COMMIT"),r}catch(r){throw this.database.exec("ROLLBACK"),r}}getProfile(){let e=this.database.prepare("SELECT * FROM profile WHERE id = 1").get();return{nativeLanguage:e.native_language,targetLanguage:e.target_language,coachEnabled:!!e.coach_enabled,updatedAt:e.updated_at}}updateProfile(e){let r=this.getProfile(),s={nativeLanguage:e.nativeLanguage?.trim()||r.nativeLanguage,targetLanguage:e.targetLanguage?.trim()||r.targetLanguage,coachEnabled:e.coachEnabled??r.coachEnabled,updatedAt:h()};return this.transaction(()=>{let n=this.nextSyncRevision();this.database.prepare("UPDATE profile SET native_language = ?, target_language = ?, coach_enabled = ?, updated_at = ?, sync_revision = ? WHERE id = 1").run(s.nativeLanguage,s.targetLanguage,s.coachEnabled?1:0,s.updatedAt,n)}),s}saveNote(e){let r=this.getProfile(),s=e.turnId?.trim()||f(),n={...e,turnId:s,id:f(),inputLanguage:e.inputLanguage||"other",originalExpression:e.originalExpression.trim(),polishedExpression:e.polishedExpression.trim(),nativeLanguage:e.nativeLanguage?.trim()||r.nativeLanguage,targetLanguage:e.targetLanguage?.trim()||r.targetLanguage,createdAt:h()};if(!n.originalExpression||!n.polishedExpression)throw new Error("Both originalExpression and polishedExpression are required.");let c=this.database.prepare("SELECT id FROM learning_notes WHERE turn_id = ?").get(s);if(c){let i=this.database.prepare("SELECT * FROM learning_notes WHERE id = ?").get(c.id);return v(i)}return this.transaction(()=>{let i=this.nextSyncRevision();this.database.prepare(`INSERT INTO learning_notes (
        id, turn_id, input_language, original_expression, polished_expression, corrections_json,
        patterns_json, examples_json, native_language, target_language, created_at, sync_revision
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(n.id,n.turnId??null,n.inputLanguage,n.originalExpression,n.polishedExpression,JSON.stringify(n.corrections),JSON.stringify(n.patterns),JSON.stringify(n.examples),n.nativeLanguage,n.targetLanguage,n.createdAt,i)}),n}hasNoteForTurn(e){return!!this.database.prepare("SELECT 1 FROM learning_notes WHERE turn_id = ?").get(e)}listNotes(e=100,r=0){let s=Math.max(1,Math.min(500,Math.trunc(e))),n=Math.max(0,Math.trunc(r));return this.database.prepare("SELECT * FROM learning_notes ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?").all(s,n).map(v)}listAllNotes(){return this.database.prepare("SELECT * FROM learning_notes ORDER BY created_at DESC, id DESC").all().map(v)}deleteNote(e){return this.transaction(()=>{let r=this.database.prepare("DELETE FROM learning_notes WHERE id = ?").run(e);if(r.changes>0){let s=this.nextSyncRevision();this.database.prepare(`INSERT INTO deleted_learning_notes (id, deleted_at, sync_revision) VALUES (?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET deleted_at = excluded.deleted_at, sync_revision = excluded.sync_revision`).run(e,h(),s)}return r.changes>0})}getProgress(){return y(this.listAllNotes())}markReviewed(e){if(!e||typeof e.id!="string"||!e.id||e.id.length>200||typeof e.requestId!="string"||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(e.requestId)||!Number.isSafeInteger(e.expectedVersion)||e.expectedVersion<0)throw new u("INVALID_REQUEST","A note ID, UUID request ID and non-negative version are required.");return this.transaction(()=>{let r=this.database.prepare("SELECT * FROM learning_review_events WHERE request_id = ?").get(e.requestId);if(r){if(r.note_id!==e.id||r.expected_version!==e.expectedVersion)throw new u("INVALID_REQUEST","This request ID was already used for a different review.");return JSON.parse(r.response_json)}let s=this.database.prepare(`SELECT notes.*, ${T} FROM learning_notes AS notes
        LEFT JOIN learning_note_reviews AS reviews ON reviews.note_id = notes.id WHERE notes.id = ?`).get(e.id);if(!s)throw new u("NOT_FOUND","This learning note no longer exists.");let n=b(s);if(n.version!==e.expectedVersion)throw new u("VERSION_CONFLICT","This card was updated elsewhere. Its review status has been refreshed.",n);let c=h();if(!I(n,Date.parse(c)))throw new u("NOT_DUE","This card is not due for review yet.",n);let i=A(n,c);this.database.prepare(`INSERT INTO learning_note_reviews
        (note_id, stage, review_count, last_reviewed_at, next_review_at, version, algorithm_version)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(note_id) DO UPDATE SET stage = excluded.stage, review_count = excluded.review_count,
          last_reviewed_at = excluded.last_reviewed_at, next_review_at = excluded.next_review_at,
          version = excluded.version, algorithm_version = excluded.algorithm_version`).run(e.id,i.stage,i.reviewCount,i.lastReviewedAt,i.nextReviewAt,i.version,i.algorithmVersion);let d={id:e.id,review:i};return this.database.prepare(`INSERT INTO learning_review_events
        (request_id, note_id, expected_version, reviewed_at, response_json) VALUES (?, ?, ?, ?, ?)`).run(e.requestId,e.id,e.expectedVersion,c,JSON.stringify(d)),d})}getReviewSummary(e,r){return{...this.database.prepare(`SELECT
      COALESCE(SUM(CASE WHEN reviews.stage IS NOT NULL AND reviews.next_review_at <= ? THEN 1 ELSE 0 END), 0) AS due,
      COALESCE(SUM(CASE WHEN reviews.stage IS NULL THEN 1 ELSE 0 END), 0) AS new,
      COALESCE(SUM(CASE WHEN reviews.next_review_at > ? THEN 1 ELSE 0 END), 0) AS scheduled
      FROM learning_notes AS notes LEFT JOIN learning_note_reviews AS reviews ON reviews.note_id = notes.id
      WHERE (? IS NULL OR notes.id IN (SELECT note_id FROM review_session_items WHERE session_id = ?))`).get(e,e,r??null,r??null),asOf:e}}getReviewDashboardData(e,r){return this.transaction(()=>{let s=h(),n,c=-1,i=s;if(r){let o=V(r);n=o.sessionId,c=o.afterRank;let p=this.database.prepare("SELECT as_of, expires_at FROM review_sessions WHERE id = ?").get(n);if(!p||p.expires_at<=s)throw new u("SESSION_EXPIRED","This review session expired. Refresh the review order.");i=p.as_of}else this.database.prepare("DELETE FROM review_sessions WHERE expires_at <= ?").run(s),n=f(),this.database.prepare("INSERT INTO review_sessions (id, as_of, expires_at) VALUES (?, ?, ?)").run(n,s,new Date(Date.parse(s)+L).toISOString()),this.database.prepare(`INSERT INTO review_session_items (session_id, rank, note_id)
          SELECT ?, ROW_NUMBER() OVER (ORDER BY
            CASE WHEN reviews.next_review_at <= ? THEN 0 WHEN reviews.stage IS NULL THEN 1 ELSE 2 END,
            CASE WHEN reviews.stage IS NOT NULL THEN reviews.next_review_at END ASC,
            CASE WHEN reviews.next_review_at <= ? THEN reviews.stage END ASC,
            notes.created_at DESC, notes.id DESC) - 1, notes.id
          FROM learning_notes AS notes LEFT JOIN learning_note_reviews AS reviews ON reviews.note_id = notes.id`).run(n,s,s);let d=this.database.prepare(`SELECT notes.*, ${T}, items.rank
        FROM review_session_items AS items JOIN learning_notes AS notes ON notes.id = items.note_id
        LEFT JOIN learning_note_reviews AS reviews ON reviews.note_id = notes.id
        WHERE items.session_id = ? AND items.rank > ? ORDER BY items.rank LIMIT ?`).all(n,c,e+1),g=d.length>e,l=d.slice(0,e),a=l.at(-1);return{profile:this.getProfile(),notes:l.map(x),progress:this.getProgress(),capabilities:{reviewScheduling:!0},reviewSummary:this.getReviewSummary(i,n),notesPage:{limit:e,hasMore:g,nextCursor:g&&a?_.from(JSON.stringify({sessionId:n,afterRank:a.rank})).toString("base64url"):void 0}}})}getDashboardData(e=50,r,s="recent"){let n=Math.max(1,Math.min(100,Number.isFinite(e)?Math.trunc(e):50));if(s==="review")return this.getReviewDashboardData(n,r);if(s!=="recent")throw new u("INVALID_REQUEST","Unknown card order.");if(r)try{if(JSON.parse(_.from(r,"base64url").toString("utf8")).sessionId)throw new u("INVALID_REQUEST","A review cursor cannot be used for recent notes.")}catch(l){if(l instanceof u)throw l}let c=G(r),i=this.database.prepare(`SELECT notes.*, ${T} FROM learning_notes AS notes
      LEFT JOIN learning_note_reviews AS reviews ON reviews.note_id = notes.id
      WHERE (? IS NULL OR notes.created_at < ? OR (notes.created_at = ? AND notes.id < ?))
      ORDER BY notes.created_at DESC, notes.id DESC LIMIT ?`).all(c?.createdAt??null,c?.createdAt??null,c?.createdAt??null,c?.id??null,n+1),d=i.length>n,g=i.slice(0,n).map(x);return{profile:this.getProfile(),notes:g,progress:this.getProgress(),capabilities:{reviewScheduling:!0},reviewSummary:this.getReviewSummary(h()),notesPage:{hasMore:d,limit:n,nextCursor:d&&g.length?B(g.at(-1)):void 0}}}getSyncCheckpoint(e,r){let s=this.database.prepare(`SELECT last_synced_revision, last_synced_at FROM sync_checkpoints
      WHERE remote_url = ? AND user_id = ?`).get(C(e),r);return{revision:s?.last_synced_revision??0,lastSyncedAt:s?.last_synced_at??void 0}}getSyncSnapshot(e,r){let s=this.getSyncCheckpoint(e,r),n=this.database.prepare("SELECT current_revision FROM local_sync_clock WHERE id = 1").get().current_revision,c=this.database.prepare("SELECT sync_revision FROM profile WHERE id = 1").get(),i=this.database.prepare("SELECT id, deleted_at FROM deleted_learning_notes WHERE sync_revision > ? AND sync_revision <= ? ORDER BY sync_revision").all(s.revision,n),d=this.database.prepare(`SELECT * FROM learning_notes WHERE sync_revision > ? AND sync_revision <= ?
      ORDER BY sync_revision`).all(s.revision,n);return{profile:c.sync_revision>s.revision&&c.sync_revision<=n?this.getProfile():void 0,notes:d.map(v),deletedNotes:i.map(g=>({id:g.id,deletedAt:g.deleted_at})),throughRevision:n}}markSyncCheckpoint(e,r,s,n){this.database.prepare(`INSERT INTO sync_checkpoints
      (remote_url, user_id, last_synced_revision, last_synced_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(remote_url, user_id) DO UPDATE SET
        last_synced_revision = MAX(sync_checkpoints.last_synced_revision, excluded.last_synced_revision),
        last_synced_at = excluded.last_synced_at`).run(C(e),r,s,n)}close(){this.database.close()}};import*as Y from"node:tls";function J(){let t=Y;if(!t.getCACertificates||!t.setDefaultCACertificates)return;let e=new Set([...t.getCACertificates("default"),...t.getCACertificates("system")]);t.setDefaultCACertificates([...e])}J();function O({nativeLanguage:t,targetLanguage:e},r){let s=e.trim().toLowerCase()==="english"?"natural, contemporary American English":`natural, contemporary ${e}`,n=r?`Use turnId \`${r}\` when calling \`save_learning_note\` for this turn.`:"Omit turnId when calling `save_learning_note`; the tool will generate a UUID. Do not reuse a previous turn's ID.";return`# Language coach

The learner's native language is ${t}. Their target language is ${e}. ${n}

## Coach instructions

Before doing the user's requested task, coach the language in their message:
1. Aim for ${s}: the way people normally speak and write in daily life, not stiff or textbook-style language. Preserve the user's intended meaning, tone, and level of politeness.
2. If the user writes in ${e}, check grammar, spelling, collocations, word choice, tone, and contextual appropriateness. Briefly identify meaningful problems, then rewrite the message the way a native speaker would naturally express it in the same situation. Fix awkward phrasing even when it is technically grammatical.
3. If the user writes mainly in ${t}, translate the intended meaning into ${s}. Translate the message as a whole instead of following the original word order or sentence structure.
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
- Do not mention the persistence call unless it fails or the user asks about storage.`}async function D(){let t="";for await(let e of process.stdin)t+=e;return t?JSON.parse(t):{}}await D();var P=new m,U=P.getProfile();P.close();U.coachEnabled?process.stdout.write(JSON.stringify({additional_context:O(U)})):process.stdout.write("{}");
