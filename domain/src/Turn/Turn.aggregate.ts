import * as Domain from "@alchemy.run/domain";
import * as DateTime from "effect/DateTime";
import * as Schema from "effect/Schema";
import { ConversationId, TurnId } from "../ids.ts";
import {
  AskForInput,
  FailTurn,
  FinishToolCall,
  FinishTurn,
  StartToolCall,
  StartTurn,
  StopRun,
  ToolCallFinished,
  ToolCallStarted,
  TurnFailed,
  TurnFinished,
  TurnNeedsInput,
  TurnStarted,
  TurnStopped,
} from "./turnCommands.ts";
import { TurnNotRunning } from "./TurnNotRunning.rejection.ts";

const TurnState = Schema.Union([
  Schema.TaggedStruct("Idle", {}),
  Schema.TaggedStruct("Running", { conversationId: ConversationId }),
  Schema.TaggedStruct("Ended", {}),
]);
type TurnState = typeof TurnState.Type;

const iso = (now: DateTime.Utc) => DateTime.formatIso(now);

const running = (state: TurnState) => (state._tag === "Running" ? state : new TurnNotRunning());

const ended = (state: TurnState): TurnState => (state._tag === "Running" ? { _tag: "Ended" } : state);

export class Turn extends Domain.Aggregate(
  "Turn",
  {
    id: TurnId,
    state: TurnState,
    initial: { _tag: "Idle" },
    commands: [StartTurn, StartToolCall, FinishToolCall, FinishTurn, FailTurn, StopRun, AskForInput],
    decide: {
      StartTurn: (state, command, { now }) =>
        state._tag === "Idle"
          ? [
              new TurnStarted({
                conversationId: command.conversationId,
                owner: command.owner,
                text: command.text,
                at: iso(now),
              }),
            ]
          : [],
      StartToolCall: (state, command, { now }) => {
        const turn = running(state);
        if (turn instanceof TurnNotRunning) return turn;
        return [new ToolCallStarted({ callId: command.callId, tool: command.tool, at: iso(now) })];
      },
      FinishToolCall: (state, command, { now }) => {
        const turn = running(state);
        if (turn instanceof TurnNotRunning) return turn;
        return [new ToolCallFinished({ callId: command.callId, at: iso(now) })];
      },
      FinishTurn: (state, command, { now }) => {
        const turn = running(state);
        if (turn instanceof TurnNotRunning) return turn;
        return [
          new TurnFinished({ conversationId: turn.conversationId, reply: command.reply, at: iso(now) }),
        ];
      },
      FailTurn: (state, command, { now }) => {
        const turn = running(state);
        if (turn instanceof TurnNotRunning) return turn;
        return [
          new TurnFailed({ conversationId: turn.conversationId, reason: command.reason, at: iso(now) }),
        ];
      },
      StopRun: (state, _command, { now }) =>
        state._tag === "Running"
          ? [new TurnStopped({ conversationId: state.conversationId, at: iso(now) })]
          : [],
      AskForInput: (state, command, { now }) => {
        const turn = running(state);
        if (turn instanceof TurnNotRunning) return turn;
        return [
          new TurnNeedsInput({
            conversationId: turn.conversationId,
            question: command.question,
            at: iso(now),
          }),
        ];
      },
    },
    evolve: {
      TurnStarted: (_, event) => ({ _tag: "Running" as const, conversationId: event.conversationId }),
      ToolCallStarted: (state) => state,
      ToolCallFinished: (state) => state,
      TurnFinished: ended,
      TurnFailed: ended,
      TurnStopped: ended,
      TurnNeedsInput: ended,
    },
  },
  { description: "One run of the agent: tool calls, then one of finished, failed, stopped or needs input." },
) {}
