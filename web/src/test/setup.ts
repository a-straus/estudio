import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// React act() outside a test framework needs this flag; the root vitest
// config has no setupFiles, so each test file imports this module.
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(cleanup);
