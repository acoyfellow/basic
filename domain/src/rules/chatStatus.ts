export type TurnOutcome = "finished" | "failed" | "stopped" | "needs-you";

export type ChatStatus = "working" | "idle" | "failed" | "needs-you";

export const EMPTY_REPLY_REASON = "Agent completed without a visible response. Please retry.";

export const statusAfter = (outcome: TurnOutcome): ChatStatus => {
  if (outcome === "failed") return "failed";
  if (outcome === "needs-you") return "needs-you";
  return "idle";
};

export const statusOf = (running: boolean, lastOutcome: TurnOutcome | null): ChatStatus =>
  running ? "working" : lastOutcome === null ? "idle" : statusAfter(lastOutcome);

export const isVisibleReply = (reply: string) => reply.trim() !== "";
