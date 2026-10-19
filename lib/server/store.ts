import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { initialData, isAppData, removeChatMedia, type AppData } from '../model';

let connection: DatabaseSync | undefined;
export const digest = (text: string) => createHash('sha256').update(text).digest('hex');
export const token = () => randomBytes(32).toString('base64url');
export function db() {
  if (process.env.VERCEL) throw new Error('Persistent remote database required on Vercel');
  if (connection) return connection;
  const path = resolve(/* turbopackIgnore: true */ process.env.CALCETTO_DB_PATH || 'data/calcetto.sqlite');
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  connection = new DatabaseSync(path);
  connection.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password TEXT NOT NULL, player_id TEXT NOT NULL UNIQUE, admin INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS invites (id TEXT PRIMARY KEY, hash TEXT NOT NULL UNIQUE, player_id TEXT NOT NULL, admin INTEGER NOT NULL DEFAULT 0, kind TEXT NOT NULL DEFAULT 'join', expires INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
  `);
  connection.prepare('INSERT OR IGNORE INTO state(id,body) VALUES(1,?)').run(JSON.stringify(initialData));
  return connection;
}
export function readState(): AppData {
  const saved = (db().prepare('SELECT body FROM state WHERE id=1').get() as {body:string}).body;
  const parsed: unknown = JSON.parse(saved);
  const cleaned = removeChatMedia(parsed);
  if (!isAppData(cleaned)) throw new Error('Invalid saved data');
  if (cleaned !== parsed) {
    // Compare the snapshot before replacing it so a concurrent write is never lost.
    const result = db().prepare('UPDATE state SET body=? WHERE id=1 AND body=?').run(JSON.stringify(cleaned), saved);
    if (!result.changes) return readState();
  }
  return cleaned;
}
export function writeState(data: AppData) { db().prepare('UPDATE state SET body=? WHERE id=1').run(JSON.stringify(data)); }
export function transaction<T>(operation: () => T): T {
  db().exec('BEGIN IMMEDIATE');
  try { const result = operation(); db().exec('COMMIT'); return result; }
  catch (error) { db().exec('ROLLBACK'); throw error; }
}
export type Account = {id:string; email:string; playerId:string; isAdmin:boolean};
export function account(row: Record<string, unknown>): Account {
  return {id:String(row.id),email:String(row.email),playerId:String(row.player_id),isAdmin:!!row.admin};
}
export function createInvite(playerId: string, admin: boolean, kind: 'join'|'reset' = 'join', hours = 72) {
  const raw = token(), id = crypto.randomUUID(), expires = Date.now()+hours*3600000;
  db().prepare('UPDATE invites SET used=1 WHERE player_id=? AND kind=? AND used=0').run(playerId,kind);
  db().prepare('INSERT INTO invites(id,hash,player_id,admin,kind,expires,created) VALUES(?,?,?,?,?,?,?)').run(id,digest(raw),playerId,admin?1:0,kind,expires,Date.now());
  return {id,token:raw,expires};
}
