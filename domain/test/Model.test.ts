import * as Domain from "@alchemy.run/domain";
import { expect, it } from "@effect/vitest";
import { Chat } from "../src/Chat.model.ts";

it("the model is well defined", () => expect(Domain.verify(Chat)).toEqual([]));
