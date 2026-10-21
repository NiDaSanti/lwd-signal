import { useConversations, type ConversationState } from "../hooks/useConversations";
import "./ConversationsConsole.css";

const STATE_LABEL: Record<ConversationState, string> = {
  new: "new",
  asked_location: "asked_location",
  asked_project: "asked_project",
  asked_timeline: "asked_timeline",
  asked_phone: "asked_phone",
  qualified: "qualified",
  in_close: "in_close",
  handed_off: "handed off",
};

function pillClass(state: ConversationState): string {
  if (state === "handed_off") return "handed_off";
  if (state === "new") return "new";
  if (state === "qualified" || state === "in_close") return state;
  return "progress";
}

export function ConversationsConsole() {
  const { conversations, loading, error } = useConversations();

  const needsHandoff = conversations.filter((c) => c.state === "handed_off").length;
  const qualified = conversations.filter((c) => c.state === "qualified" || c.state === "in_close").length;
  const active = conversations.length - needsHandoff;

  return (
    <div className="console">
      <main className="console-main">
        <div className="console-top">
          <span className="console-brand">LWD Signal</span>
        </div>

        <div className="console-stats">
          <div className="console-stat">
            <span className="label">Active conversations</span>
            <span className="value">{active}</span>
          </div>
          <div className="console-stat alert">
            <span className="label">Needs handoff</span>
            <span className="value">{needsHandoff}</span>
          </div>
          <div className="console-stat">
            <span className="label">Qualified</span>
            <span className="value">{qualified}</span>
          </div>
        </div>

        <div className="console-card">
          <div className="console-table-scroll">
            <table className="console-table">
              <thead>
                <tr>
                  <th>Contact</th>
                  <th>State</th>
                  <th>Keyword</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {conversations.map((c) => (
                  <tr key={c.id} className={c.state === "handed_off" ? "handoff" : ""}>
                    <td>
                      <div className="console-handle">@{c.contact?.ig_username ?? c.contact?.ig_user_id ?? "unknown"}</div>
                      <div className="console-handle-sub">{c.location ?? "—"}</div>
                    </td>
                    <td>
                      <span className={`console-pill ${pillClass(c.state)}`}>{STATE_LABEL[c.state]}</span>
                    </td>
                    <td>
                      <span className="console-keyword">{c.keyword ?? "—"}</span>
                    </td>
                    <td>{new Date(c.updated_at).toLocaleTimeString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {loading && <div className="console-empty">Loading…</div>}
          {!loading && conversations.length === 0 && <div className="console-empty">No conversations yet.</div>}
          {error && <div className="console-empty">Error loading conversations: {error}</div>}
        </div>
      </main>
    </div>
  );
}
