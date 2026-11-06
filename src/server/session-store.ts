import type Database from "better-sqlite3";
import session from "express-session";

const idleLifetime = 7 * 24 * 60 * 60_000;
const touchInterval = 5 * 60_000;

export class SqliteSessionStore extends session.Store {
  private readonly selectSession: Database.Statement;
  private readonly save: Database.Statement;
  private readonly remove: Database.Statement;
  private readonly extend: Database.Statement;
  private readonly prune: Database.Statement;

  constructor(
    db: Database.Database,
    private readonly codec: { encrypt: (value: string) => string; decrypt: (value: string) => string },
  ) {
    super();
    db.exec(`
      CREATE TABLE IF NOT EXISTS web_sessions (
        id TEXT PRIMARY KEY, payload TEXT NOT NULL, expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS web_sessions_expiry ON web_sessions(expires_at);
    `);
    this.selectSession = db.prepare("SELECT payload FROM web_sessions WHERE id = ? AND expires_at > ?");
    this.save = db.prepare("INSERT OR REPLACE INTO web_sessions (id, payload, expires_at) VALUES (?, ?, ?)");
    this.remove = db.prepare("DELETE FROM web_sessions WHERE id = ?");
    this.extend = db.prepare("UPDATE web_sessions SET expires_at = ? WHERE id = ? AND expires_at > ? AND expires_at <= ?");
    this.prune = db.prepare("DELETE FROM web_sessions WHERE expires_at <= ?");
    this.prune.run(Date.now());
  }

  get(id: string, callback: (error: unknown, data?: session.SessionData | null) => void) {
    let row: { payload: string } | undefined;
    try {
      row = this.selectSession.get(id, Date.now()) as typeof row;
    } catch (error) {
      callback(error);
      return;
    }
    let data: session.SessionData | null = null;
    if (row) {
      try {
        data = JSON.parse(this.codec.decrypt(row.payload)) as session.SessionData;
      } catch {
        // An unreadable session can be replaced by signing in again.
      }
    }
    callback(null, data);
  }

  set(id: string, data: session.SessionData, callback?: (error?: unknown) => void) {
    try {
      const now = Date.now();
      this.prune.run(now);
      this.save.run(id, this.codec.encrypt(JSON.stringify(data)), now + idleLifetime);
    } catch (error) {
      callback?.(error);
      return;
    }
    callback?.();
  }

  destroy(id: string, callback?: (error?: unknown) => void) {
    try {
      this.remove.run(id);
    } catch (error) {
      callback?.(error);
      return;
    }
    callback?.();
  }

  touch(id: string, _data: session.SessionData, callback?: (error?: unknown) => void) {
    try {
      const now = Date.now();
      this.extend.run(now + idleLifetime, id, now, now + idleLifetime - touchInterval);
    } catch (error) {
      callback?.(error);
      return;
    }
    callback?.();
  }
}
