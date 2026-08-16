import * as Data from "effect/Data";

export class VaultStateError extends Data.TaggedError("VaultStateError")<{
  readonly reason:
    | "already-exists"
    | "absent"
    | "closed"
    | "open"
    | "screen-locked"
    | "pin-disabled"
    | "invalid-pin"
    | "password-too-short"
    | "reset-confirmation";
  readonly message: string;
}> {}
