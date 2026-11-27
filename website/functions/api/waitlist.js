// The waitlist, as a Cloudflare Pages Function: POST /api/waitlist from the Get dialog.
// Sign-ups land in the WAITLIST KV namespace bound to this Pages project, one key per email.
// GET with "Authorization: Bearer <ADMIN_TOKEN>" downloads them all as CSV.
// With no KV bound, POST answers 503 and the page says sign-ups aren't open yet; it never pretends.

const MAX_BODY = 4096;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

export async function onRequestPost({ request, env }) {
  // Only the site itself may post here.
  const origin = request.headers.get("Origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) return json(403, { error: "origin" });
  if (!env.WAITLIST) return json(503, { error: "closed" });

  const text = await request.text();
  if (text.length > MAX_BODY) return json(413, { error: "size" });
  let data;
  try { data = JSON.parse(text); } catch (e) { return json(400, { error: "json" }); }

  const email = String(data.email || "").trim().toLowerCase();
  const os = data.os === "mac" || data.os === "win" ? data.os : "";
  const use = String(data.use || "").trim().slice(0, 500);
  const lang = data.lang === "zh" ? "zh" : "en";
  if (!EMAIL.test(email) || email.length > 254) return json(400, { error: "email" });
  if (!os) return json(400, { error: "os" });
  if (!use) return json(400, { error: "use" });

  // Joining twice keeps the first date and the latest answers.
  const key = "email:" + email;
  const old = await env.WAITLIST.get(key, "json");
  const now = new Date().toISOString();
  const row = {
    email, os, use, lang,
    joined: (old && old.joined) || now,
    updated: now,
    country: (request.cf && request.cf.country) || ""
  };
  await env.WAITLIST.put(key, JSON.stringify(row), { metadata: { os, lang, joined: row.joined } });
  return json(200, { ok: true });
}

function same(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function cell(v) {
  const s = String(v == null ? "" : v);
  // Quote everything, and keep spreadsheets from reading a sign-up as a formula.
  return '"' + (/^[=+\-@\t\r]/.test(s) ? "'" + s : s).replace(/"/g, '""') + '"';
}

export async function onRequestGet({ request, env }) {
  const auth = request.headers.get("Authorization") || "";
  if (!env.ADMIN_TOKEN || !same(auth, "Bearer " + env.ADMIN_TOKEN)) return json(401, { error: "auth" });
  if (!env.WAITLIST) return json(503, { error: "closed" });

  const cols = ["joined", "email", "os", "use", "lang", "country", "updated"];
  const lines = [cols.join(",")];
  let cursor;
  do {
    const page = await env.WAITLIST.list({ prefix: "email:", cursor });
    const rows = await Promise.all(page.keys.map(k => env.WAITLIST.get(k.name, "json")));
    rows.filter(Boolean).forEach(r => lines.push(cols.map(c => cell(r[c])).join(",")));
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);

  return new Response("﻿" + lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="waitlist.csv"',
      "Cache-Control": "no-store"
    }
  });
}
