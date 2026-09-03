import{mkdirSync as R}from"node:fs";import{Buffer as v}from"node:buffer";import{homedir as I}from"node:os";import{dirname as C,join as b}from"node:path";import{randomUUID as x}from"node:crypto";import{DatabaseSync as U}from"node:sqlite";function L(n,e=new Date){let r=a=>a.toISOString().slice(0,10),t=new Map;for(let a of n){let i=a.createdAt.slice(0,10);t.set(i,(t.get(i)??0)+1)}let s=a=>Array.from({length:a},(i,E)=>{let u=new Date(e);u.setUTCHours(0,0,0,0),u.setUTCDate(u.getUTCDate()-(a-1-E));let T=r(u);return{date:T,count:t.get(T)??0}}),c=s(7),o=0;for(let a=0;a<366;a+=1){let i=new Date(e);if(i.setUTCDate(i.getUTCDate()-a),(t.get(r(i))??0)>0)o+=1;else if(a>0||t.size>0)break}let d=new Map,g=new Map,l={native:0,target:0,mixed:0,other:0};for(let a of n){l[a.inputLanguage]+=1;for(let i of a.corrections)d.set(i.category,(d.get(i.category)??0)+1);for(let i of a.patterns){let E=i.pattern.trim().toLocaleLowerCase(),u=g.get(E)??{explanation:i.explanation,count:0};u.count+=1,g.set(E,u)}}return{totalNotes:n.length,notesThisWeek:c.reduce((a,i)=>a+i.count,0),activeDays:t.size,currentStreak:o,weeklyActivity:c,activity90Days:s(90),categoryCounts:[...d.entries()].map(([a,i])=>({category:a,count:i})).sort((a,i)=>i.count-a.count),recurringPatterns:[...g.entries()].map(([a,i])=>({pattern:a,...i})).sort((a,i)=>i.count-a.count).slice(0,50),languageUse:{...l,targetShare:l.native+l.target>0?Math.round(l.target/(l.native+l.target)*100):0}}}function O(n=process.env){return n.LANGUAGE_COACH_DB_PATH||b(I(),".language-coach","language-coach.sqlite")}function D(n){if(n)try{let e=JSON.parse(v.from(n,"base64url").toString("utf8"));return e.createdAt&&e.id?{createdAt:e.createdAt,id:e.id}:void 0}catch{return}}function P(n){return v.from(JSON.stringify({createdAt:n.createdAt,id:n.id})).toString("base64url")}function h(){return new Date().toISOString()}function y(n,e){if(typeof n!="string")return e;try{return JSON.parse(n)}catch{return e}}function S(n){return n.replace(/\/$/,"")}function p(n){return{id:n.id,turnId:n.turn_id??void 0,inputLanguage:n.input_language||"other",originalExpression:n.original_expression,polishedExpression:n.polished_expression,corrections:y(n.corrections_json,[]),patterns:y(n.patterns_json,[]),examples:y(n.examples_json,[]),nativeLanguage:n.native_language,targetLanguage:n.target_language,createdAt:n.created_at}}var m=class{database;constructor(e=O()){R(C(e),{recursive:!0}),this.database=new U(e),this.database.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;"),this.migrate()}migrate(){this.database.exec(`
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
    `),this.database.prepare("PRAGMA table_info(profile)").all().some(o=>o.name==="sync_revision")||this.database.exec("ALTER TABLE profile ADD COLUMN sync_revision INTEGER NOT NULL DEFAULT 0");let r=this.database.prepare("PRAGMA table_info(learning_notes)").all();r.some(o=>o.name==="input_language")||this.database.exec("ALTER TABLE learning_notes ADD COLUMN input_language TEXT NOT NULL DEFAULT 'other'"),r.some(o=>o.name==="sync_revision")||this.database.exec("ALTER TABLE learning_notes ADD COLUMN sync_revision INTEGER NOT NULL DEFAULT 0"),this.database.prepare("PRAGMA table_info(deleted_learning_notes)").all().some(o=>o.name==="sync_revision")||this.database.exec("ALTER TABLE deleted_learning_notes ADD COLUMN sync_revision INTEGER NOT NULL DEFAULT 0");let s=h();this.database.prepare(`INSERT OR IGNORE INTO profile
        (id, native_language, target_language, coach_enabled, updated_at, sync_revision)
        VALUES (1, 'Chinese', 'English', 1, ?, 0)`).run(s),this.database.prepare("INSERT OR IGNORE INTO local_sync_clock (id, current_revision) VALUES (1, 0)").run(),this.database.prepare(`SELECT 1 FROM profile WHERE sync_revision = 0
      UNION ALL SELECT 1 FROM learning_notes WHERE sync_revision = 0
      UNION ALL SELECT 1 FROM deleted_learning_notes WHERE sync_revision = 0 LIMIT 1`).get()&&this.database.exec(`
        UPDATE local_sync_clock SET current_revision = MAX(current_revision, 1) WHERE id = 1;
        UPDATE profile SET sync_revision = 1 WHERE sync_revision = 0;
        UPDATE learning_notes SET sync_revision = 1 WHERE sync_revision = 0;
        UPDATE deleted_learning_notes SET sync_revision = 1 WHERE sync_revision = 0;
      `)}nextSyncRevision(){return this.database.prepare(`UPDATE local_sync_clock SET current_revision = current_revision + 1
      WHERE id = 1 RETURNING current_revision`).get().current_revision}transaction(e){this.database.exec("BEGIN IMMEDIATE");try{let r=e();return this.database.exec("COMMIT"),r}catch(r){throw this.database.exec("ROLLBACK"),r}}getProfile(){let e=this.database.prepare("SELECT * FROM profile WHERE id = 1").get();return{nativeLanguage:e.native_language,targetLanguage:e.target_language,coachEnabled:!!e.coach_enabled,updatedAt:e.updated_at}}updateProfile(e){let r=this.getProfile(),t={nativeLanguage:e.nativeLanguage?.trim()||r.nativeLanguage,targetLanguage:e.targetLanguage?.trim()||r.targetLanguage,coachEnabled:e.coachEnabled??r.coachEnabled,updatedAt:h()};return this.transaction(()=>{let s=this.nextSyncRevision();this.database.prepare("UPDATE profile SET native_language = ?, target_language = ?, coach_enabled = ?, updated_at = ?, sync_revision = ? WHERE id = 1").run(t.nativeLanguage,t.targetLanguage,t.coachEnabled?1:0,t.updatedAt,s)}),t}saveNote(e){let r=this.getProfile(),t={...e,id:x(),inputLanguage:e.inputLanguage||"other",originalExpression:e.originalExpression.trim(),polishedExpression:e.polishedExpression.trim(),nativeLanguage:e.nativeLanguage?.trim()||r.nativeLanguage,targetLanguage:e.targetLanguage?.trim()||r.targetLanguage,createdAt:h()};if(!t.originalExpression||!t.polishedExpression)throw new Error("Both originalExpression and polishedExpression are required.");let s=e.turnId?this.database.prepare("SELECT id FROM learning_notes WHERE turn_id = ?").get(e.turnId):void 0;if(s){let c=this.database.prepare("SELECT * FROM learning_notes WHERE id = ?").get(s.id);return p(c)}return this.transaction(()=>{let c=this.nextSyncRevision();this.database.prepare(`INSERT INTO learning_notes (
        id, turn_id, input_language, original_expression, polished_expression, corrections_json,
        patterns_json, examples_json, native_language, target_language, created_at, sync_revision
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(t.id,t.turnId??null,t.inputLanguage,t.originalExpression,t.polishedExpression,JSON.stringify(t.corrections),JSON.stringify(t.patterns),JSON.stringify(t.examples),t.nativeLanguage,t.targetLanguage,t.createdAt,c)}),t}hasNoteForTurn(e){return!!this.database.prepare("SELECT 1 FROM learning_notes WHERE turn_id = ?").get(e)}listNotes(e=100,r=0){let t=Math.max(1,Math.min(500,Math.trunc(e))),s=Math.max(0,Math.trunc(r));return this.database.prepare("SELECT * FROM learning_notes ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?").all(t,s).map(p)}listAllNotes(){return this.database.prepare("SELECT * FROM learning_notes ORDER BY created_at DESC, id DESC").all().map(p)}deleteNote(e){return this.transaction(()=>{let r=this.database.prepare("DELETE FROM learning_notes WHERE id = ?").run(e);if(r.changes>0){let t=this.nextSyncRevision();this.database.prepare(`INSERT INTO deleted_learning_notes (id, deleted_at, sync_revision) VALUES (?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET deleted_at = excluded.deleted_at, sync_revision = excluded.sync_revision`).run(e,h(),t)}return r.changes>0})}getProgress(){return L(this.listAllNotes())}getDashboardData(e=50,r){let t=Math.max(1,Math.min(100,Math.trunc(e))),s=D(r),c=this.database.prepare(`SELECT * FROM learning_notes
      WHERE (? IS NULL OR created_at < ? OR (created_at = ? AND id < ?))
      ORDER BY created_at DESC, id DESC LIMIT ?`).all(s?.createdAt??null,s?.createdAt??null,s?.createdAt??null,s?.id??null,t+1),o=c.length>t,d=c.slice(0,t).map(p),g=this.getProgress();return{profile:this.getProfile(),notes:d,progress:g,notesPage:{limit:t,hasMore:o,nextCursor:o&&d.length?P(d[d.length-1]):void 0}}}getSyncCheckpoint(e,r){let t=this.database.prepare(`SELECT last_synced_revision, last_synced_at FROM sync_checkpoints
      WHERE remote_url = ? AND user_id = ?`).get(S(e),r);return{revision:t?.last_synced_revision??0,lastSyncedAt:t?.last_synced_at??void 0}}getSyncSnapshot(e,r){let t=this.getSyncCheckpoint(e,r),s=this.database.prepare("SELECT current_revision FROM local_sync_clock WHERE id = 1").get().current_revision,c=this.database.prepare("SELECT sync_revision FROM profile WHERE id = 1").get(),o=this.database.prepare("SELECT id, deleted_at FROM deleted_learning_notes WHERE sync_revision > ? AND sync_revision <= ? ORDER BY sync_revision").all(t.revision,s),d=this.database.prepare(`SELECT * FROM learning_notes WHERE sync_revision > ? AND sync_revision <= ?
      ORDER BY sync_revision`).all(t.revision,s);return{profile:c.sync_revision>t.revision&&c.sync_revision<=s?this.getProfile():void 0,notes:d.map(p),deletedNotes:o.map(g=>({id:g.id,deletedAt:g.deleted_at})),throughRevision:s}}markSyncCheckpoint(e,r,t,s){this.database.prepare(`INSERT INTO sync_checkpoints
      (remote_url, user_id, last_synced_revision, last_synced_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(remote_url, user_id) DO UPDATE SET
        last_synced_revision = MAX(sync_checkpoints.last_synced_revision, excluded.last_synced_revision),
        last_synced_at = excluded.last_synced_at`).run(S(e),r,t,s)}close(){this.database.close()}};import*as k from"node:tls";function w(){let n=k;if(!n.getCACertificates||!n.setDefaultCACertificates)return;let e=new Set([...n.getCACertificates("default"),...n.getCACertificates("system")]);n.setDefaultCACertificates([...e])}w();async function A(){let n="";for await(let e of process.stdin)n+=e;return n?JSON.parse(n):{}}var f=await A(),N=new m,M=N.getProfile(),_=typeof f.turn_id=="string"?f.turn_id:"",F=_?N.hasNoteForTurn(_):!0;N.close();!M.coachEnabled||F||f.stop_hook_active?process.stdout.write(JSON.stringify({continue:!0})):process.stdout.write(JSON.stringify({decision:"block",reason:`Before finishing, decide whether turn ${_} has meaningful language-learning value. Save a note with the Language Coach MCP tool save_learning_note only if the user's expression contains a meaningful error, unnatural or contextually inappropriate wording, or a genuinely useful reusable pattern. Do not save a note if the expression is already natural, correct, and appropriate, or if the rewrite is merely an optional stylistic preference. Never save unrelated task content. Then return the response without discussing this internal decision.`}));
