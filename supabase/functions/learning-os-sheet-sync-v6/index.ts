import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";

interface ReviewItem {
  id: string;
  subject: string;
  source: string;
}

interface ReviewEvent {
  id: string;
  date: string;
  rating: "○" | "△" | "×";
}

interface SyncPayload {
  item: ReviewItem;
  event: ReviewEvent;
}

export default {
  fetch: withSupabase(
    { auth: ["publishable", "secret"] },
    async (req, _ctx) => {
      const payload: SyncPayload = await req.json();
      const url = Deno.env.get("APPS_SCRIPT_URL");
      const secret = Deno.env.get("APPS_SCRIPT_SYNC_SECRET");

      if (!url || !secret) {
        return Response.json(
          { status: "error", message: "Missing sync configuration" },
          { status: 500 },
        );
      }

      const upstream = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item: payload.item,
          event: payload.event,
          secret,
        }),
        redirect: "follow",
      });

      return new Response(await upstream.text(), {
        status: upstream.status,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    },
  ),
};
