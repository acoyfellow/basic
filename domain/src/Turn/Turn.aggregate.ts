import * as Domain from "@alchemy.run/domain";
import * as DateTime from "effect/DateTime";
import * as Schema from "effect/Schema";
import { ConversationId, TurnId } from "../ids.ts";
import { EMPTY_REPLY_REASON, isVisibleReply } from "../rules/chatStatus.ts";
import {
  AskForInput,
  FailTurn,
  FinishToolCall,
  FinishTurn,
  StartToolCall,
  StartTurn,
  StopRun,
  ToolCallAbandoned,
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
  Schema.TaggedStruct("Running", { conversationId: ConversationId, openCalls: Schema.Array(Schema.String) }),
  Schema.TaggedStruct("Ended", {}),
]);
type TurnState = typeof TurnState.Type;
type Running = Extract<TurnState, { _tag: "Running" }>;

const iso = (now: DateTime.Utc) => DateTime.formatIso(now);

const running = (state: TurnState) => (state._tag === "Running" ? state : new TurnNotRunning());

const abandonOpenCalls = (turn: Running, at: string) =>
  turn.openCalls.map((callId) => new ToolCallAbandoned({ callId, at }));

const withOpenCalls = (state: TurnState, change: (calls: ReadonlyArray<string>) => ReadonlyArray<string>): TurnState =>
  state._tag === "Running" ? { ...state, openCalls: change(state.openCalls) } : state;

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
        const at = iso(now);
        const ending = isVisibleReply(command.reply)
          ? new TurnFinished({ conversationId: turn.conversationId, reply: command.reply, at })
          : new TurnFailed({ conversationId: turn.conversationId, reason: EMPTY_REPLY_REASON, at });
        return [...abandonOpenCalls(turn, at), ending];
      },
      FailTurn: (state, command, { now }) => {
        const turn = running(state);
        if (turn instanceof TurnNotRunning) return turn;
        const at = iso(now);
        return [
          ...abandonOpenCalls(turn, at),
          new TurnFailed({ conversationId: turn.conversationId, reason: command.reason, at }),
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
      TurnStarted: (_, event) => ({ _tag: "Running" as const, conversationId: event.conversationId, openCalls: [] }),
      ToolCallStarted: (state, event) => withOpenCalls(state, (calls) => [...calls, event.callId]),
      ToolCallFinished: (state, event) => withOpenCalls(state, (calls) => calls.filter((id) => id !== event.callId)),
      ToolCallAbandoned: (state, event) => withOpenCalls(state, (calls) => calls.filter((id) => id !== event.callId)),
      TurnFinished: ended,
      TurnFailed: ended,
      TurnStopped: ended,
      TurnNeedsInput: ended,
    },
  },
  { description: "One run of the agent: tool calls, then one of finished, failed, stopped or needs input." },
) {}
