import type { References } from "../types/index.ts"

/**
 * A value that renders itself into arguments when a command compiles. Options
 * bundles, filters, stream references and time adapters are arguments; extend
 * this class to build your own.
 */
export abstract class Argument {
  abstract getArgs(refs: References): string[]
}
