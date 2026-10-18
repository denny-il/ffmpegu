/** Descriptors belong to the process service, including behind nested protocols. */
const RESERVED_DESCRIPTOR =
  /^(?:[a-z][a-z0-9+.-]*:)*(?:pipe|fd):|^\/dev\/(?:fd\/\d|std(?:in|out|err)$)|^\/proc\/(?:self|thread-self|\d+)\/fd\//i

export const isDescriptorPath = (value: string): boolean =>
  RESERVED_DESCRIPTOR.test(value)

export const isReservedInputPath = (value: string): boolean =>
  value === "-" || isDescriptorPath(value)
