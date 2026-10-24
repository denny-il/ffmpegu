import { Duration } from "effect"
import { filters, options } from "ffmpegu"

options.startTime(Duration.seconds(1))
filters.atrim({ duration: Duration.millis(500) })
