import * as Domain from "@alchemy.run/domain";
import { TurnId } from "../ids.ts";

export class ChatNotFound extends Domain.Rejection("ChatNotFound") {}
export class ChatAlreadyExists extends Domain.Rejection("ChatAlreadyExists") {}
export class TurnInProgress extends Domain.Rejection("TurnInProgress", { turnId: TurnId }) {}
export class NoTurnRunning extends Domain.Rejection("NoTurnRunning") {}
