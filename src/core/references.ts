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
