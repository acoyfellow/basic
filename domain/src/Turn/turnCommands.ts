import * as Domain from "@alchemy.run/domain";
import * as Schema from "effect/Schema";
import { ConversationId, OwnerEmail, TurnId } from "../ids.ts";
import { TurnNotRunning } from "./TurnNotRunning.rejection.ts";

export class TurnStarted extends Domain.Event("TurnStarted", {
  conversationId: ConversationId,
  owner: OwnerEmail,
  text: Schema.String,
  at: Schema.String,
}) {}

export class ToolCallStarted extends Domain.Event("ToolCallStarted", {
  callId: Schema.String,
  tool: Schema.String,
  at: Schema.String,
}) {}

export class ToolCallFinished extends Domain.Event("ToolCallFinished", {
  callId: Schema.String,
  at: Schema.String,
}) {}

export class TurnFinished extends Domain.Event("TurnFinished", {
  conversationId: ConversationId,
  reply: Schema.String,
  at: Schema.String,
}) {}

export class TurnFailed extends Domain.Event("TurnFailed", {
  conversationId: ConversationId,
  reason: Schema.String,
  at: Schema.String,
}) {}

export class TurnStopped extends Domain.Event("TurnStopped", {
  conversationId: ConversationId,
  at: Schema.String,
}) {}

export class TurnNeedsInput extends Domain.Event("TurnNeedsInput", {
  conversationId: ConversationId,
  question: Schema.String,
  at: Schema.String,
}) {}

export class StartTurn extends Domain.Command("StartTurn", {
  target: TurnId,
  input: { conversationId: ConversationId, owner: OwnerEmail, text: Schema.String },
  events: [TurnStarted],
}) {}

export class StartToolCall extends Domain.Command("StartToolCall", {
  target: TurnId,
  input: { callId: Schema.String, tool: Schema.String },
  events: [ToolCallStarted],
  rejects: [TurnNotRunning],
}) {}

export class FinishToolCall extends Domain.Command("FinishToolCall", {
  target: TurnId,
  input: { callId: Schema.String },
  events: [ToolCallFinished],
  rejects: [TurnNotRunning],
}) {}

export class FinishTurn extends Domain.Command("FinishTurn", {
  target: TurnId,
  input: { reply: Schema.String },
  events: [TurnFinished],
  rejects: [TurnNotRunning],
}) {}

export class FailTurn extends Domain.Command("FailTurn", {
  target: TurnId,
  input: { reason: Schema.String },
  events: [TurnFailed],
  rejects: [TurnNotRunning],
}) {}

export class StopRun extends Domain.Command("StopRun", {
  target: TurnId,
  events: [TurnStopped],
}) {}

export class AskForInput extends Domain.Command("AskForInput", {
  target: TurnId,
  input: { question: Schema.String },
  events: [TurnNeedsInput],
  rejects: [TurnNotRunning],
}) {}
