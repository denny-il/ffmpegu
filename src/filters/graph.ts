import { Argument } from "../core/argument.ts"
import type { References } from "../types/index.ts"
import type { Chain } from "./chain.ts"
import type { Filter } from "./core.ts"

/**
 * A complete filtergraph: chains separated by semicolons in FFmpeg syntax. A
 * filter stands for a chain of its own.
 */
export class Graph extends Argument {
  private readonly chains: ReadonlyArray<Chain | Filter>

  constructor(chains: ReadonlyArray<Chain | Filter>) {
    super()
    // Copy so later changes to the caller's array cannot alter this value.
    this.chains = [...chains]
  }

  getArgs(refs: References): string[] {
    return [this.chains.map((chain) => chain.getArgs(refs)[0]).join(";")]
  }
}

export const graph = (...chains: ReadonlyArray<Chain | Filter>): Graph =>
  new Graph(chains)
