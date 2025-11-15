import { Data } from "effect";

export class InvalidPermissionsError extends Data.TaggedError("InvalidPermissionsError")<{}> {}