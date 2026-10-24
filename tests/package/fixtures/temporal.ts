import { filters, options } from "ffmpegu"

options.startTime(Temporal.Duration.from({ seconds: 1 }))
filters.atrim({ duration: Temporal.Duration.from({ milliseconds: 500 }) })
