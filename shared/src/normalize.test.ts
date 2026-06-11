import { describe, expect, it } from "vitest";
import { normalize } from "./normalize.js";

describe("normalize", () => {
  it("lowercases", () => {
    expect(normalize("Casa")).toBe("casa");
  });

  it("strips accents: más → mas", () => {
    expect(normalize("más")).toBe("mas");
  });

  it("strips the tilde: ñ → n", () => {
    expect(normalize("señor")).toBe("senor");
    expect(normalize("ñ")).toBe("n");
  });

  it("handles uppercase accented input", () => {
    expect(normalize("ÁRBOL")).toBe("arbol");
  });

  it("keeps multi-word expressions intact", () => {
    expect(normalize("Más o Menos")).toBe("mas o menos");
  });

  it("leaves already-normalized text unchanged", () => {
    expect(normalize("mas")).toBe("mas");
  });
});
