import { FFmpeguArgument } from "../core/argument.ts"
import type { FFmpeguReferencesInterface } from "../types/index.ts"
import type { FFmpeguFilterChain } from "./chain.ts"

/**
 * Represents a complete filtergraph with multiple chains
 * Chains are separated by semicolons in FFmpeg syntax
 */
export class FFmpeguFilterGraph extends FFmpeguArgument {
  constructor(private readonly chains: FFmpeguFilterChain[]) {
    super()
  }

  static create(...chains: FFmpeguFilterChain[]): FFmpeguFilterGraph {
    return new FFmpeguFilterGraph(chains)
  }

  getArgs(refs: FFmpeguReferencesInterface): string[] {
    const chainArgs = this.chains.map((chain) => chain.getArgs(refs)[0])
    return [chainArgs.join(";")]
  }
}
