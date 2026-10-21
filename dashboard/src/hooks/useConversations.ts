import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

export type ConversationState =
  | "new"
  | "asked_location"
  | "asked_project"
  | "asked_timeline"
  | "asked_phone"
  | "qualified"
  | "in_close"
  | "handed_off";

export type ConversationRow = {
  id: string;
  contact_id: string;
  state: ConversationState;
  keyword: string | null;
  project_type: string | null;
  timeline: string | null;
  location: string | null;
  updated_at: string;
  contact: {
    ig_user_id: string;
    ig_username: string | null;
  } | null;
};

const PAGE_SIZE = 100;

const CONVERSATION_SELECT = `
  id, contact_id, state, keyword, project_type, timeline, location, updated_at,
  contact:contacts ( ig_user_id, ig_username )
`;

function sortConversations(rows: ConversationRow[]): ConversationRow[] {
  return [...rows].sort((a, b) => {
    const aHandoff = a.state === "handed_off" ? 0 : 1;
    const bHandoff = b.state === "handed_off" ? 0 : 1;
    if (aHandoff !== bHandoff) {
      return aHandoff - bHandoff;
    }
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });
}

export function useConversations() {
  const [rows, setRows] = useState<Map<string, ConversationRow>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  useEffect(() => {
    let cancelled = false;

    async function loadInitial() {
      const { data, error: fetchError } = await supabase
        .from("conversations")
        .select(CONVERSATION_SELECT)
        .order("updated_at", { ascending: false })
        .limit(PAGE_SIZE);

      if (cancelled) return;

      if (fetchError) {
        setError(fetchError.message);
        setLoading(false);
        return;
      }

      const next = new Map<string, ConversationRow>();
      for (const row of (data ?? []) as unknown as ConversationRow[]) {
        next.set(row.id, row);
      }
      setRows(next);
      setLoading(false);
    }

    loadInitial();

    const channel = supabase
      .channel("conversations-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        async (payload) => {
          if (payload.eventType === "DELETE") {
            setRows((prev) => {
              const next = new Map(prev);
              next.delete((payload.old as { id: string }).id);
              return next;
            });
            return;
          }

          const updated = payload.new as Omit<ConversationRow, "contact">;
          const existing = rowsRef.current.get(updated.id);

          if (existing) {
            setRows((prev) => {
              const next = new Map(prev);
              next.set(updated.id, { ...existing, ...updated });
              return next;
            });
            return;
          }

          // Brand new conversation: fetch its contact once, since the
          // realtime payload only carries the bare row, no joined data.
          const { data: contactRow } = await supabase
            .from("contacts")
            .select("ig_user_id, ig_username")
            .eq("id", updated.contact_id)
            .maybeSingle();

          setRows((prev) => {
            const next = new Map(prev);
            next.set(updated.id, { ...updated, contact: contactRow ?? null });
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  const sorted = useMemo(() => sortConversations(Array.from(rows.values())), [rows]);

  return { conversations: sorted, loading, error };
}
