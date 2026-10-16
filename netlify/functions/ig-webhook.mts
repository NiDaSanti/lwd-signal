import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { config as appConfig } from "../../src/lib/config.js";

const supabase = createClient(appConfig.SUPABASE_URL, appConfig.SUPABASE_SERVICE_ROLE_KEY);

type IgEvent = {
  external_id: string;
  event_type: "comment" | "message";
  payload: unknown;
};

export default async (req: Request) => {
  if (req.method === "GET") {
    return handleVerification(req);
  }

  if (req.method === "POST") {
    return handleIngestion(req);
  }

  return new Response("Method Not Allowed", { status: 405 });
};

function handleVerification(req: Request): Response {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === appConfig.IG_VERIFY_TOKEN && challenge) {
    return new Response(challenge, { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

async function handleIngestion(req: Request): Promise<Response> {
  const rawBody = await req.text();
  const signatureHeader = req.headers.get("x-hub-signature-256") ?? "";

  if (!isValidSignature(rawBody, signatureHeader)) {
    return new Response("Invalid signature", { status: 403 });
  }

  const payload = JSON.parse(rawBody);
  const events = extractEvents(payload);

  if (events.length > 0) {
    const { error } = await supabase
      .from("ig_events")
      .upsert(events, { onConflict: "external_id", ignoreDuplicates: true });

    if (error) {
      console.error("ig_events upsert failed", error);
    }
  }

  void fetch(new URL("/api/ig-process-background", req.url), { method: "POST" }).catch(() => {});

  return new Response("OK", { status: 200 });
}

function isValidSignature(rawBody: string, signatureHeader: string): boolean {
  const prefix = "sha256=";
  if (!signatureHeader.startsWith(prefix)) {
    return false;
  }

  const expectedSig = Buffer.from(signatureHeader.slice(prefix.length), "hex");
  const computedSig = crypto.createHmac("sha256", appConfig.IG_APP_SECRET).update(rawBody).digest();

  if (expectedSig.length !== computedSig.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedSig, computedSig);
}

function extractEvents(payload: any): IgEvent[] {
  const deduped = new Map<string, IgEvent>();

  for (const entry of payload?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const commentId = change.value?.id;
      if (commentId) {
        const externalId = `comment_${commentId}`;
        deduped.set(externalId, { external_id: externalId, event_type: "comment", payload: change.value });
      }
    }

    for (const messaging of entry.messaging ?? []) {
      const messageId = messaging.message?.mid;
      if (messageId) {
        const externalId = `message_${messageId}`;
        deduped.set(externalId, { external_id: externalId, event_type: "message", payload: messaging });
      }
    }
  }

  return Array.from(deduped.values());
}

export const config = { path: "/api/ig-webhook" };
