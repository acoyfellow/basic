import { expect, it } from "@effect/vitest";
import { statusOf } from "../src/rules/chatStatus.ts";

it("Rule 4 / the list dot: a running chat is working whatever came before", () => {
  expect(statusOf(true, "failed")).toBe("working");
  expect(statusOf(true, null)).toBe("working");
});

it("Rule 4 / the list dot: an ended chat shows how its last turn ended", () => {
  expect(statusOf(false, null)).toBe("idle");
  expect(statusOf(false, "finished")).toBe("idle");
  expect(statusOf(false, "stopped")).toBe("idle");
  expect(statusOf(false, "failed")).toBe("failed");
  expect(statusOf(false, "needs-you")).toBe("needs-you");
});
