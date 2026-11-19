import * as Domain from "@alchemy.run/domain";
import * as Schema from "effect/Schema";
import { OwnerEmail } from "./ids.ts";

export class CurrentOwner extends Domain.RequestContext<CurrentOwner>()(
  "Chat/CurrentOwner",
  Schema.Struct({ email: OwnerEmail }),
) {}
