import type {
  FFmpeguCompilable,
  FFmpeguReferencesInterface
} from "../types/index.ts"

export class FFmpeguReferences implements FFmpeguReferencesInterface {
  #refs: Map<FFmpeguCompilable, number> = new Map()

  get(ref: FFmpeguCompilable): number {
    if (!this.has(ref)) {
      this.#refs.set(ref, this.#refs.size)
    }
    return this.#refs.get(ref)!
  }

  has(ref: FFmpeguCompilable): boolean {
    return this.#refs.has(ref)
  }

  set(ref: FFmpeguCompilable, index: number): void {
    if (this.has(ref)) {
      throw new Error(`Reference already exists: ${ref}`)
    }
    if (index < 0) {
      throw new Error(`Reference index must be non-negative, got: ${index}`)
    }
    this.#refs.set(ref, index)
  }
}
