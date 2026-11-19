import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const mutations = [
  {
    id: "M1",
    name: "allow SendMessage while a turn is running",
    file: "src/Conversation/Conversation.aggregate.ts",
    from: "if (chat.runningTurn !== null) return yield* new TurnInProgress({ turnId: chat.runningTurn });",
    to: "",
  },
  {
    id: "M2",
    name: "drop TurnStopped: StopRun records nothing",
    file: "src/Turn/Turn.aggregate.ts",
    from: "state._tag === \"Running\"\n          ? [new TurnStopped({ conversationId: state.conversationId, at: iso(now) })]\n          : [],",
    to: "[],",
  },
  {
    id: "M3",
    name: "ChatList ignores failures",
    file: "src/ChatList.view.ts",
    from: "if (outcome === \"failed\") return \"failed\";",
    to: "",
  },
  {
    id: "M4",
    name: "skip the owner check in commands",
    file: "src/Conversation/Conversation.aggregate.ts",
    from: "if (current.email !== state.owner) return yield* new NotOwner();",
    to: "",
  },
  {
    id: "M5",
    name: "ChatList validate lets any owner read any list",
    file: "src/ChatList.view.ts",
    from: "if (current.email !== request.key) return yield* new NotOwner();",
    to: "",
  },
  {
    id: "M6",
    name: "tool call finish time is not the time of the call",
    file: "src/Turn/Turn.aggregate.ts",
    from: "new ToolCallFinished({ callId: command.callId, at: iso(now) })",
    to: "new ToolCallFinished({ callId: command.callId, at: \"1970-01-01T00:00:00.000Z\" })",
  },
  {
    id: "M7",
    name: "task finish time is not the time of the finish",
    file: "src/Turn/Turn.aggregate.ts",
    from: "new TurnFinished({ conversationId: turn.conversationId, reply: command.reply, at: iso(now) })",
    to: "new TurnFinished({ conversationId: turn.conversationId, reply: command.reply, at: \"1970-01-01T00:00:00.000Z\" })",
  },
  {
    id: "M8",
    name: "ChatList ignores ChatStarted, so a new chat is not listed at once",
    file: "src/ChatList.view.ts",
    from: "ChatStarted: (state, event, { source, at }) =>\n        upsert(state, source.id, () => ({ title: event.title, status: \"working\", updatedAt: isoAt(at) })),",
    to: "ChatStarted: (state) => state,",
  },
  {
    id: "M9",
    name: "a settled turn does not free the chat",
    file: "src/Conversation/Conversation.aggregate.ts",
    from: "TurnSettled: (state) => whenActive(state, (chat) => ({ ...chat, runningTurn: null })),",
    to: "TurnSettled: (state) => state,",
  },
  {
    id: "M10",
    name: "ChatList shows a stopped turn as failed",
    file: "src/ChatList.view.ts",
    from: "return \"idle\";\n};",
    to: "return outcome === \"stopped\" ? \"failed\" : \"idle\";\n};",
  },
  {
    id: "M11",
    name: "deleting a chat leaves its row in the list",
    file: "src/ChatList.view.ts",
    from: "ChatDeleted: (state, _event, { source }) => upsert(state, source.id, () => undefined),",
    to: "ChatDeleted: (state) => state,",
  },
  {
    id: "M12",
    name: "stopping a chat does not settle it, so the list keeps working",
    file: "src/Turn/TurnSettlement.policy.ts",
    from: "  TurnStopped: \"stopped\",\n",
    to: "",
  },
  {
    id: "M13",
    name: "StopTurn is accepted when nothing is running",
    file: "src/Conversation/Conversation.aggregate.ts",
    from: "if (chat.runningTurn === null) return yield* new NoTurnRunning();\n        return [new TurnStopRequested({ owner: chat.owner, turnId: chat.runningTurn })];",
    to: "return [new TurnStopRequested({ owner: chat.owner, turnId: chat.runningTurn ?? TurnId.make(\"none\") })];",
  },
  {
    id: "M14",
    name: "ChatList ignores renames",
    file: "src/ChatList.view.ts",
    from: "upsert(state, source.id, (row) => touch(row, isoAt(at), { title: event.title })),",
    to: "state,",
  },
  {
    id: "M15",
    name: "a stopped turn still accepts tool calls",
    file: "src/Turn/Turn.aggregate.ts",
    from: "const running = (state: TurnState) => (state._tag === \"Running\" ? state : new TurnNotRunning());",
    to: "const running = (state: TurnState) =>\n  state._tag === \"Idle\" ? new TurnNotRunning() : { _tag: \"Running\" as const, conversationId: ConversationId.make(\"c1\") };",
  },
  {
    id: "M16",
    name: "ChatList files every chat under one shared key",
    file: "src/ChatList.view.ts",
    from: "ChatStarted: ({ event }: { event: ChatStarted }) => event.owner,",
    to: "ChatStarted: ({ event }: { event: ChatStarted }) => (event.owner, OwnerEmail.make(\"shared\")),",
  },
  {
    id: "M17",
    name: "no one may rename: RenameChat is accepted from a non-owner",
    file: "src/Conversation/Conversation.aggregate.ts",
    from: "const chat = yield* ownedChat(state);\n        return [new ChatRenamed(",
    to: "if (state._tag !== \"Active\") return yield* new ChatNotFound();\n        const chat = state;\n        return [new ChatRenamed(",
  },
  {
    id: "M18",
    name: "ChatList files every new chat under ada's key, so other owners' chats leak into her list",
    file: "src/ChatList.view.ts",
    from: "ChatStarted: ({ event }: { event: ChatStarted }) => event.owner,",
    to: "ChatStarted: () => OwnerEmail.make(\"ada@example.com\"),",
  },
];

const reportPath = "/tmp/domain-mutation-report.json";

const failingTests = () => {
  rmSync(reportPath, { force: true });
  spawnSync("npx", ["vitest", "run", "--reporter=json", `--outputFile=${reportPath}`], { encoding: "utf8" });
  if (!existsSync(reportPath)) return ["(run crashed)"];
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  return report.testResults.flatMap((file) =>
    file.assertionResults.filter((test) => test.status === "failed").map((test) => test.fullName ?? test.title),
  );
};

const only = process.argv.slice(2);
const results = [];
for (const mutation of mutations.filter((m) => only.length === 0 || only.includes(m.id))) {
  const original = readFileSync(mutation.file, "utf8");
  if (!original.includes(mutation.from)) {
    results.push({ id: mutation.id, name: mutation.name, caught: ["(pattern not found)"] });
    continue;
  }
  writeFileSync(mutation.file, original.replace(mutation.from, mutation.to));
  try {
    results.push({ id: mutation.id, name: mutation.name, caught: failingTests() });
  } finally {
    writeFileSync(mutation.file, original);
  }
}
console.log(JSON.stringify(results, null, 2));
