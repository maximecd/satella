import * as Data from "effect/Data";

export class DatabaseConfigError extends Data.TaggedError("DatabaseConfigError")<{
  readonly reason: "invalid-override" | "invalid-path" | "filesystem";
  readonly path: string;
  readonly cause: unknown;
  readonly message: string;
}> {}

export class DatabaseOpenError extends Data.TaggedError("DatabaseOpenError")<{
  readonly path: string;
  readonly cause: unknown;
  readonly message: string;
}> {}

export class DatabasePragmaError extends Data.TaggedError("DatabasePragmaError")<{
  readonly pragma: string;
  readonly expected: string;
  readonly actual: unknown;
  readonly cause: unknown;
  readonly message: string;
}> {}

export class DatabaseHistoryError extends Data.TaggedError("DatabaseHistoryError")<{
  readonly reason: "invalid-registry" | "mismatch" | "newer-than-binary";
  readonly applied: ReadonlyArray<readonly [number, string]>;
  readonly expected: ReadonlyArray<readonly [number, string]>;
  readonly cause: unknown;
  readonly message: string;
}> {}

export class DatabaseMigrationError extends Data.TaggedError("DatabaseMigrationError")<{
  readonly cause: unknown;
  readonly message: string;
}> {}

export class DatabaseBackupError extends Data.TaggedError("DatabaseBackupError")<{
  readonly path: string;
  readonly cause: unknown;
  readonly message: string;
}> {}

export class DatabaseValidationError extends Data.TaggedError("DatabaseValidationError")<{
  readonly check: "quick_check" | "foreign_key_check";
  readonly cause: unknown;
  readonly message: string;
}> {}

export type DatabaseError =
  | DatabaseBackupError
  | DatabaseConfigError
  | DatabaseHistoryError
  | DatabaseMigrationError
  | DatabaseOpenError
  | DatabasePragmaError
  | DatabaseValidationError;
