import { getSql, normalizeChat, sendJson } from "./_db.js";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const sql = getSql();
      const rows = await sql`
        select
          c.id::text,
          c.created_at,
          c.last_message,
          c.last_updated,
          coalesce(
            json_agg(
              json_build_object(
                'id', m.id::text,
                'sender', m.sender,
                'text', m.body,
                'sent_at', m.created_at
              )
              order by m.created_at asc
            ) filter (where m.id is not null),
            '[]'::json
          ) as messages
        from chat_sessions c
        left join chat_messages m on m.chat_id = c.id
        group by c.id
        order by c.last_updated desc
        limit 200
      `;

      sendJson(res, 200, { chats: rows.map(normalizeChat), server_time: new Date().toISOString() });
      return;
    }

    if (req.method === "POST") {
      const sql = getSql();
      const [chat] = await sql`
        insert into chat_sessions default values
        returning id::text, created_at, last_message, last_updated
      `;

      sendJson(res, 201, { chat: normalizeChat({ ...chat, messages: [] }) });
      return;
    }

    res.setHeader("Allow", "GET, POST");
    sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    console.error("chats_api_error", error);
    sendJson(res, 500, { error: "Database request failed" });
  }
}
