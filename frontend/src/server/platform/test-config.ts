import stack from "../../../e2e/test-stack.cjs";

// Shared isolated test configuration; secrets are supplied by .env.test.local / CI.
export const testConfig = { ...stack.apiEnv };
