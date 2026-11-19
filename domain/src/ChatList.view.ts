import * as Domain from "@alchemy.run/domain";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ChatDeleted } from "./Conversation/DeleteChat.command.ts";
import { Conversation } from "./Conversation/Conversation.aggregate.ts";
import { ChatRenamed } from "./Conversation/RenameChat.command.ts";
import { ChatStarted, MessageSent } from "./Conversation/StartConversation.command.ts";
import { TurnSettled } from "./Conversation/SettleTurn.command.ts";
import { CurrentOwner } from "./CurrentOwner.context.ts";
import { OwnerEmail } from "./ids.ts";
import { NotOwner } from "./NotOwner.rejection.ts";
import { Session } from "./Session.middleware.ts";

export const ChatStatus = Schema.Literals(["working", "idle", "failed", "needs-you"]);
export type ChatStatus = typeof ChatStatus.Type;

const ChatRow = Schema.Struct({
  title: Schema.String,
  status: ChatStatus,
  updatedAt: Schema.String,
});
type ChatRow = typeof ChatRow.Type;

const ChatListState = Schema.Struct({ chats: Schema.Record(Schema.String, ChatRow) });
type ChatListState = typeof ChatListState.Type;

const statusAfter = (outcome: typeof TurnSettled.Type.outcome): ChatStatus => {
  if (outcome === "failed") return "failed";
  if (outcome === "needs-you") return "needs-you";
  return "idle";
};

const upsert = (
  state: ChatListState,
  id: string,
  change: (row: ChatRow | undefined) => ChatRow | undefined,
): ChatListState => {
  const next = change(state.chats[id]);
  const { [id]: _removed, ...rest } = state.chats;
  return { chats: next === undefined ? rest : { ...rest, [id]: next } };
};

const touch = (row: ChatRow | undefined, at: string, patch: Partial<ChatRow>) =>
  row === undefined ? undefined : { ...row, ...patch, updatedAt: at };

const isoAt = (at: { readonly epochMilliseconds: number }) => new Date(at.epochMilliseconds).toISOString();

export class ChatList extends Domain.View(
  "ChatList",
  {
    from: [Conversation],
    key: OwnerEmail,
    middleware: [Session],
    rejects: [NotOwner],
    state: ChatListState,
    initial: { chats: {} },
    keyOf: {
      ChatStarted: ({ event }: { event: ChatStarted }) => event.owner,
      MessageSent: ({ event }: { event: MessageSent }) => event.owner,
      TurnSettled: ({ event }: { event: TurnSettled }) => event.owner,
      ChatRenamed: ({ event }: { event: ChatRenamed }) => event.owner,
      ChatDeleted: ({ event }: { event: ChatDeleted }) => event.owner,
    },
    evolve: {
      ChatStarted: (state, event, { source, at }) =>
        upsert(state, source.id, () => ({ title: event.title, status: "working", updatedAt: isoAt(at) })),
      MessageSent: (state, _event, { source, at }) =>
        upsert(state, source.id, (row) => touch(row, isoAt(at), { status: "working" })),
      TurnSettled: (state, event, { source, at }) =>
        upsert(state, source.id, (row) => touch(row, isoAt(at), { status: statusAfter(event.outcome) })),
      ChatRenamed: (state, event, { source, at }) =>
        upsert(state, source.id, (row) => touch(row, isoAt(at), { title: event.title })),
      ChatDeleted: (state, _event, { source }) => upsert(state, source.id, () => undefined),
    },
  },
  { description: "One owner's chats, each with a title, a status and its last update." },
) {}

export const ChatListLive = ChatList.toLayer(
  Effect.succeed(
    Effect.fn(function* (request) {
      const current = yield* CurrentOwner;
      if (current.email !== request.key) return yield* new NotOwner();
    }),
  ),
);
