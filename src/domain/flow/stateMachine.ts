export type ConversationState = 
| "new"
| "asked_location"
| "asked_project"
| "asked_timeline"
| "asked_phone"
| "qualified"
| "in_close"
| "handed_off";

const NEXT_STATE: Record<ConversationState, ConversationState> = {
  new: "asked_location",
  asked_location: "asked_project",
  asked_project: "asked_timeline",
  asked_timeline: "asked_phone",
  asked_phone: "qualified",
  qualified: "in_close",
  in_close: "in_close",
  handed_off: "handed_off",
};

const STATE_PROMPTS: Record<ConversationState, string | null> = {
  new: null,
  asked_location: "What city or area is the project in?",
  asked_project: "What type of project are you considering? - ADU, remodel, rebuild, or new build?",
  asked_timeline: "What's your rough timeline to start?",
  asked_phone: "What's the best phone number to reach you at?",
  qualified: null,
  in_close: null,
  handed_off: null,
};

const HUMAN_REQUEST_PATTERN = /\b(human|agent|person|representative)\b/i;

export function requiresHandoff(text: string, isEcho: boolean): boolean {
  return isEcho || HUMAN_REQUEST_PATTERN.test(text);
}

const MESSAGING_WINDOW_MS = 24 * 60 * 60 * 1000;

export function withinMessagingWindow(lastInboundAt: Date, now: Date): boolean {
  return now.getTime() - lastInboundAt.getTime() < MESSAGING_WINDOW_MS;
}

export type AdvanceResult = {
  nextState: ConversationState;
  reply: string | null;
};

export function advanceConversation(
  currentState: ConversationState,
  input: { text: string; isEcho: boolean; lastInboundAt: Date; now: Date },
): AdvanceResult {
  if (currentState === "handed_off" || requiresHandoff(input.text, input.isEcho)) {
    return { nextState: "handed_off", reply: null };
  }

  if (!withinMessagingWindow(input.lastInboundAt, input.now)) {
    return { nextState: currentState, reply: null };
  }

  const nextState = NEXT_STATE[currentState];
  return { nextState, reply: STATE_PROMPTS[nextState] };
}
