import type { FFmpeguReferencesInterface } from "../types/index.ts"

export abstract class FFmpeguArgument {
  abstract getArgs(refs: FFmpeguReferencesInterface): string[]
}
