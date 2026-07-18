import { createClient } from "@supabase/supabase-js";

const TIMEOUT_MS = 20_000;

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Upstream HTTP ${response.status}`);
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("CRON_SECRET");
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = Deno.env.get("NEXT_PUBLIC_SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return Response.json({ error: "Supabase service role is not configured" }, { status: 500 });

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const startedAt = new Date().toISOString();
  const status = { openMeteo: "skipped", firms: "skipped" };

  try {
    const openMeteoUrl = Deno.env.get("OPEN_METEO_SYNC_URL");
    if (openMeteoUrl) {
      await fetchWithTimeout(openMeteoUrl);
      status.openMeteo = "success";
    }
    const firmsUrl = Deno.env.get("FIRMS_SYNC_URL");
    if (firmsUrl) {
      await fetchWithTimeout(firmsUrl);
      status.firms = "success";
    }
    const partial = Object.values(status).some((value) => value !== "success");
    await supabase.from("cron_log").insert({ job_name: "daily-sync", started_at: startedAt, finished_at: new Date().toISOString(), status: partial ? "partial" : "success", meta: status });
    return Response.json({ ok: true, status: partial ? "partial" : "success", sources: status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "daily-sync failed";
    await supabase.from("cron_log").insert({ job_name: "daily-sync", started_at: startedAt, finished_at: new Date().toISOString(), status: "error", error_msg: message.slice(0, 500) });
    return Response.json({ ok: false, error: message }, { status: 502 });
  }
});
