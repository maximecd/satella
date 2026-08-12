import * as Effect from "effect/Effect";

/**
 * Retained as a migration-history placeholder.
 *
 * The source-date presentation was removed from the account model. Keeping
 * this migration name in the registry lets databases that already recorded
 * migration 0003 start normally, while fresh databases no longer change
 * their schema for the retired field.
 */
export const addAccountSourceDate = Effect.void;
