import * as Domain from "@alchemy.run/domain";
import * as Layer from "effect/Layer";
import { ChatList, ChatListLive } from "./ChatList.view.ts";
import { Conversation } from "./Conversation/Conversation.aggregate.ts";
import { Turn } from "./Turn/Turn.aggregate.ts";
import { TurnLaunch, TurnLaunchLive } from "./Turn/TurnLaunch.policy.ts";
import { TurnRun, TurnRunLive } from "./Turn/TurnRun.saga.ts";
import { TurnSettlement, TurnSettlementLive } from "./Turn/TurnSettlement.policy.ts";
import { TurnStop, TurnStopLive } from "./Turn/TurnStop.policy.ts";

export class Chat extends Domain.Model("Chat", {
  aggregates: [Conversation, Turn],
  views: [ChatList],
  policies: [TurnLaunch, TurnStop, TurnSettlement],
  sagas: [TurnRun],
}) {}

export const ChatHandlers = Layer.mergeAll(
  TurnLaunchLive,
  TurnStopLive,
  TurnSettlementLive,
  TurnRunLive,
  ChatListLive,
);
