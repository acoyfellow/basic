import * as Schema from "effect/Schema";

export const ConversationId = Schema.String.pipe(Schema.brand("ConversationId"));
export type ConversationId = typeof ConversationId.Type;

export const TurnId = Schema.String.pipe(Schema.brand("TurnId"));
export type TurnId = typeof TurnId.Type;

export const OwnerEmail = Schema.String.pipe(Schema.brand("OwnerEmail"));
export type OwnerEmail = typeof OwnerEmail.Type;
