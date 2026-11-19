import * as Domain from "@alchemy.run/domain";
import { ConversationId, OwnerEmail, TurnId } from "../ids.ts";
import { NotOwner } from "../NotOwner.rejection.ts";
import { Session } from "../Session.middleware.ts";
import { ChatNotFound, NoTurnRunning } from "./rejections.ts";

export class TurnStopRequested extends Domain.Event("TurnStopRequested", {
  owner: OwnerEmail,
  turnId: TurnId,
}) {}

export class StopTurn extends Domain.Command("StopTurn", {
  target: ConversationId,
  middleware: [Session],
  events: [TurnStopRequested],
  rejects: [ChatNotFound, NotOwner, NoTurnRunning],
}) {}
