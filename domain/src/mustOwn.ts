import * as Effect from "effect/Effect";
import { CurrentOwner } from "./CurrentOwner.context.ts";
import type { OwnerEmail } from "./ids.ts";
import { NotOwner } from "./NotOwner.rejection.ts";

export const mustOwn = Effect.fn(function* (owner: OwnerEmail) {
  const current = yield* CurrentOwner;
  if (current.email !== owner) return yield* new NotOwner();
});
