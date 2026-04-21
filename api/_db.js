import { neon } from "@neondatabase/serverless";

let sql;

export function getSql() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (!sql) {
    sql = neon(process.env.DATABASE_URL);
  }

  return sql;
}

export function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

export function normalizeChat(row) {
  return {
    id: row.id,
    created_at: row.created_at,
    last_message: row.last_message || "",
    last_updated: row.last_updated,
    messages: row.messages || [],
  };
}
