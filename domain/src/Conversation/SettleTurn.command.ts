import * as Domain from "@alchemy.run/domain";
import * as Schema from "effect/Schema";
import { ConversationId, OwnerEmail, TurnId } from "../ids.ts";

export const TurnOutcome = Schema.Literals(["finished", "failed", "stopped", "needs-you"]);
export type TurnOutcome = typeof TurnOutcome.Type;

export class TurnSettled extends Domain.Event("TurnSettled", {
  owner: OwnerEmail,
  turnId: TurnId,
  outcome: TurnOutcome,
}) {}

export class SettleTurn extends Domain.Command("SettleTurn", {
  target: ConversationId,
  input: { turnId: TurnId, outcome: TurnOutcome },
  events: [TurnSettled],
}) {}
