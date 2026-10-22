import type { FFmpeguReferencesInterface } from "../types/index.ts"

/**
 * Standalone resolver for rendering builders outside a command: unknown refs
 * get the next free index on first use. Commands never use this resolver.
 */
export class FFmpeguReferences implements FFmpeguReferencesInterface {
  #refs: Map<object, number> = new Map()

  get(ref: object): number {
    if (!this.has(ref)) {
      this.#refs.set(ref, this.#refs.size)
    }
    return this.#refs.get(ref)!
  }

  has(ref: object): boolean {
    return this.#refs.has(ref)
  }

  set(ref: object, index: number): void {
    if (this.has(ref)) {
      throw new Error(`Reference already exists: ${ref}`)
    }
    if (index < 0) {
      throw new Error(`Reference index must be non-negative, got: ${index}`)
    }
    this.#refs.set(ref, index)
  }
}

/** @internal Thrown by {@link CommandReferences} for refs outside the command. */
export class ForeignReference extends Error {
  constructor(readonly ref: object) {
    super("Reference does not belong to the command")
  }
}

// Original messages, keyed by error. `message` is public and mutable, and
// custom builders may annotate it with user data before rethrowing, so
// compilers read this snapshot instead.
const invalidStreamIndexDetails = new WeakMap<object, string>()

/**
 * @internal Thrown when a track index cannot be rendered. Compilers include
 * only this library-owned message in `CommandError.message`; messages thrown
 * by custom builders may carry user data and stay in `cause`.
 */
/**
 * @internal Largest stream index FFmpeg can address: it parses the index as a
 * C int, so larger values wrap to another stream.
 */
export const MAX_STREAM_INDEX = 2_147_483_647

export class InvalidStreamIndex extends RangeError {
  constructor(got: unknown) {
    // The message is built here from the rejected value, never taken from a
    // caller: untyped callers may pass any value, and a recovered constructor
    // could otherwise be handed arbitrary text. Only numbers are rendered.
    const message = `Stream index must be an integer from 0 to ${MAX_STREAM_INDEX}, got: ${
      typeof got === "number" ? got : typeof got
    }`
    super(message)
    invalidStreamIndexDetails.set(this, message)
  }
}

/**
 * @internal The detail compilers may add to `CommandError.message`. A
 * `WeakMap` lookup never reads properties or triggers proxy traps, so a
 * tampered cause cannot throw out of `compile`.
 */
export const invalidStreamIndexDetail = (cause: unknown): string | undefined =>
  typeof cause === "object" && cause !== null
    ? invalidStreamIndexDetails.get(cause)
    : undefined

/**
 * @internal Command-scoped resolver: only the command's own inputs resolve.
 * Builders render synchronously through `getArgs`, so a foreign reference can
 * only be reported by throwing; `FFmpeguCommand.compile` converts it.
 */
export class CommandReferences implements FFmpeguReferencesInterface {
  constructor(private readonly refs: ReadonlyMap<object, number>) {}

  get(ref: object): number {
    const index = this.refs.get(ref)
    if (index === undefined) throw new ForeignReference(ref)
    return index
  }

  has(ref: object): boolean {
    return this.refs.has(ref)
  }
}
