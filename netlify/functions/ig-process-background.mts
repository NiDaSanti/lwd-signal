import { createClient } from "@supabase/supabase-js";
import { config as appConfig } from "../../src/lib/config.js";
import { matchKeyword } from "../../src/domain/flow/router.js";
import { advanceConversation, type ConversationState } from "../../src/domain/flow/stateMachine.js";

const supabase = createClient(appConfig.SUPABASE_URL, appConfig.SUPABASE_SERVICE_ROLE_KEY);

const TIME_BUDGET_MS = 25_000; // 25 seconds
const BATCH_SIZE = 50;

type IgEventRow = {
  id: number;
  external_id: string;
  event_type: "comment" | "message";
  payload: any;
};

type ConversationRow = {
  id: string;
  contact_id: string;
  state: ConversationState;
  keyword: string | null;
  last_inbound_at: string | null;
};

type Inbound = {
  igUserId: string;
  igUsername: string | null;
  text: string;
  isEcho: boolean;
};

async function claimBatch(): Promise<IgEventRow[]> {
  const { data, error } = await supabase.rpc("claim_ig_events", { batch_size: BATCH_SIZE });
  if (error) {
    throw error;
  }
  return data ?? [];
}

function extractInbound(event: IgEventRow): Inbound | null {
  if (event.event_type === "comment") {
    const from = event.payload?.from;
    const text = event.payload?.text;
    if (!from?.id || typeof text !== "string") {
      return null;
    }
    return { igUserId: from.id, igUsername: from.username ?? null, text, isEcho: false };
  }

  const message = event.payload?.message;
  const senderId = event.payload?.sender?.id;
  if (!senderId || typeof message?.text !== "string") {
    return null;
  }
  return { igUserId: senderId, igUsername: null, text: message.text, isEcho: Boolean(message.is_echo) };
}

async function getOrCreateContact(igUserId: string, igUsername: string | null): Promise<string> {
  const { data: existing, error: selectError } = await supabase
    .from("contacts")
    .select("id")
    .eq("ig_user_id", igUserId)
    .maybeSingle();
  if (selectError) {
    throw selectError;
  }
  if (existing) {
    return existing.id;
  }

  const { data: created, error: insertError } = await supabase
    .from("contacts")
    .insert({ ig_user_id: igUserId, ig_username: igUsername })
    .select("id")
    .single();
  if (insertError) {
    throw insertError;
  }
  return created.id;
}

async function getOrCreateConversation(contactId: string): Promise<ConversationRow> {
  const { data: existing, error: selectError } = await supabase
    .from("conversations")
    .select("id, contact_id, state, keyword, last_inbound_at")
    .eq("contact_id", contactId)
    .maybeSingle();
  if (selectError) {
    throw selectError;
  }
  if (existing) {
    return existing;
  }

  const { data: created, error: insertError } = await supabase
    .from("conversations")
    .insert({ contact_id: contactId, state: "new" })
    .select("id, contact_id, state, keyword, last_inbound_at")
    .single();
  if (insertError) {
    throw insertError;
  }
  return created;
}

async function processEvent(event: IgEventRow): Promise<void> {
  const inbound = extractInbound(event);
  if (!inbound) {
    return;
  }

  const contactId = await getOrCreateContact(inbound.igUserId, inbound.igUsername);
  const conversation = await getOrCreateConversation(contactId);

  const now = new Date();
  const lastInboundAt = conversation.last_inbound_at ? new Date(conversation.last_inbound_at) : now;

  const { nextState, reply } = advanceConversation(conversation.state, {
    text: inbound.text,
    isEcho: inbound.isEcho,
    lastInboundAt,
    now,
  });

  const keyword = conversation.keyword ?? matchKeyword(inbound.text);
  const shouldReply = Boolean(reply) && !inbound.isEcho;

  const update: Record<string, unknown> = {
    state: nextState,
    keyword,
    last_inbound_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
  if (shouldReply) {
    update.last_outbound_at = now.toISOString();
  }

  const { error: updateError } = await supabase.from("conversations").update(update).eq("id", conversation.id);
  if (updateError) {
    throw updateError;
  }

  if (shouldReply) {
    const { error: outboundError } = await supabase.from("outbound_messages").insert({
      conversation_id: conversation.id,
      kind: event.event_type === "comment" ? "private_reply" : "dm",
      comment_id: event.event_type === "comment" ? event.payload?.id ?? null : null,
      in_reply_to: event.event_type === "message" ? event.payload?.message?.mid ?? null : null,
      content: reply,
    });
    if (outboundError) {
      throw outboundError;
    }
  }
}

async function markDone(ids: number[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  const { error } = await supabase
    .from("ig_events")
    .update({ status: "done", processed_at: new Date().toISOString() })
    .in("id", ids);
  if (error) {
    throw error;
  }
}

export default async () => {
  const startedAt = Date.now();
  let totalProcessed = 0;

  while (Date.now() - startedAt < TIME_BUDGET_MS) {
    const batch = await claimBatch();
    if (batch.length === 0) {
      break; // No more events to process
    }

    for (const event of batch) {
      await processEvent(event);
    }

    await markDone(batch.map((event) => event.id));
    totalProcessed += batch.length;
  }

  return Response.json({ ok: true, totalProcessed });
};

export const config = { path: "/api/ig-process-background" };
