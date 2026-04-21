import { getSql, sendJson } from "./_db.js";

const ALLOWED_SENDERS = new Set(["user", "admin"]);

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 10000) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });

    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });

    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    const body = await readBody(req);
    const chatId = String(body.chat_id || "");
    const sender = String(body.sender || "");
    const text = String(body.text || "").trim();

    if (!chatId || !ALLOWED_SENDERS.has(sender) || !text) {
      sendJson(res, 400, { error: "Invalid message payload" });
      return;
    }

    if (text.length > 2000) {
      sendJson(res, 400, { error: "Message is too long" });
      return;
    }

    const sql = getSql();
    const rows = await sql`
      with inserted as (
        insert into chat_messages (chat_id, sender, body)
        values (${chatId}::uuid, ${sender}, ${text})
        returning id::text, chat_id::text, sender, body, created_at
      ),
      updated as (
        update chat_sessions
        set last_message = ${text}, last_updated = now()
        where id = ${chatId}::uuid
        returning id::text, last_updated
      )
      select
        inserted.id,
        inserted.chat_id,
        inserted.sender,
        inserted.body as text,
        inserted.created_at as sent_at,
        updated.last_updated
      from inserted
      join updated on updated.id = inserted.chat_id
    `;

    if (!rows.length) {
      sendJson(res, 404, { error: "Chat not found" });
      return;
    }

    sendJson(res, 201, { message: rows[0] });
  } catch (error) {
    console.error("messages_api_error", error);
    sendJson(res, 500, { error: "Message could not be sent" });
  }
}
