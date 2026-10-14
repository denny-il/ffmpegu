// Fail in each worker if the launcher silently switched JavaScript runtimes.
const actual = process.versions.bun ? "bun" : "node"
const expected = process.env.FFMPEGU_TEST_RUNTIME
if (expected && actual !== expected) {
  throw new Error(`Expected ${expected} test worker; received ${actual}`)
}
