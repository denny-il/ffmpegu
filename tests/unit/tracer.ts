import { Tracer } from "effect"

/** A tracer keeping the spans it creates, to inspect their attributes. */
export const makeRecordingTracer = () => {
  const spans: Array<Tracer.NativeSpan> = []
  const tracer = Tracer.make({
    span: (options) => {
      const span = new Tracer.NativeSpan(options)
      spans.push(span)
      return span
    }
  })
  /** Attributes of the only span with the name. */
  const attributes = (name: string) => {
    const named = spans.filter((span) => span.name === name)
    if (named.length !== 1) {
      throw new Error(`Expected one ${name} span, got ${named.length}`)
    }
    return Object.fromEntries(named[0]!.attributes)
  }
  return { tracer, attributes }
}
