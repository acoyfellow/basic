import * as RpcMiddleware from "effect/rpc/RpcMiddleware";
import * as Schema from "effect/Schema";
import { CurrentOwner } from "./CurrentOwner.context.ts";

export class Unauthorized extends Schema.TaggedError<Unauthorized>()("Unauthorized", {}) {}

export class Session extends RpcMiddleware.Service<Session, { provides: CurrentOwner }>()(
  "Chat/Session",
  { error: Unauthorized },
) {}
