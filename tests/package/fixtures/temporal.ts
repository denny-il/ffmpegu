import { Filter, Options } from "ffmpegu"

Options.startTime(Temporal.Duration.from({ seconds: 1 }))
Filter.atrim({ duration: Temporal.Duration.from({ milliseconds: 500 }) })
