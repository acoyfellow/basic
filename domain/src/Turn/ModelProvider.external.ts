import * as Domain from "@alchemy.run/domain";
import * as Schema from "effect/Schema";

export class ModelUnavailable extends Domain.Rejection("ModelUnavailable", { reason: Schema.String }) {}

export class ModelProvider extends Domain.ExternalSystem(
  "ModelProvider",
  {
    respond: {
      args: { text: Schema.String },
      success: { reply: Schema.String },
      error: ModelUnavailable,
    },
  },
  { description: "The language model that answers a chat message." },
) {}
