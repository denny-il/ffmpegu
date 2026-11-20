import { Duration } from "effect"
import { Filter, Options } from "ffmpegu"

Options.startTime(Duration.seconds(1))
Filter.atrim({ duration: Duration.millis(500) })
