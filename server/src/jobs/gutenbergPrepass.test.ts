import { describe, expect, it } from "vitest";
import {
  deriveGutenbergTitle,
  prepassCandidates,
  resolveGutenbergUrl,
  stripGutenbergBoilerplate,
} from "./gutenbergPrepass.js";

describe("resolveGutenbergUrl", () => {
  it("resolves a bare numeric id to the plain-text fetch URL", () => {
    expect(resolveGutenbergUrl("10")).toBe(
      "https://www.gutenberg.org/ebooks/10.txt.utf-8",
    );
  });

  it("resolves a full ebooks URL to the plain-text fetch URL", () => {
    expect(resolveGutenbergUrl("https://www.gutenberg.org/ebooks/10")).toBe(
      "https://www.gutenberg.org/ebooks/10.txt.utf-8",
    );
    expect(resolveGutenbergUrl("gutenberg.org/ebooks/2701")).toBe(
      "https://www.gutenberg.org/ebooks/2701.txt.utf-8",
    );
  });

  it("resolves a /files/ URL by its id", () => {
    expect(
      resolveGutenbergUrl("https://www.gutenberg.org/files/10/10-0.txt"),
    ).toBe("https://www.gutenberg.org/ebooks/10.txt.utf-8");
  });

  it("passes a direct .txt link through unchanged", () => {
    const direct = "https://www.gutenberg.org/cache/epub/10/pg10.txt";
    expect(resolveGutenbergUrl(direct)).toBe(direct);
  });

  it("returns null for input that names no book", () => {
    expect(resolveGutenbergUrl("not a book")).toBeNull();
    expect(resolveGutenbergUrl("")).toBeNull();
  });
});

const BOOK = `The Project Gutenberg eBook of The Holy Bible

Title: The King James Version of the Holy Bible

*** START OF THE PROJECT GUTENBERG EBOOK THE HOLY BIBLE ***

And God said, Let the firmament divide the waters. Thou shalt not covet.
The propitiation cometh unto Moses, and he put on his raiment.

*** END OF THE PROJECT GUTENBERG EBOOK THE HOLY BIBLE ***

This file should make our complete Project Gutenberg collection.`;

describe("stripGutenbergBoilerplate", () => {
  it("keeps only the text between the START and END markers", () => {
    const body = stripGutenbergBoilerplate(BOOK);
    expect(body).toContain("firmament");
    expect(body).toContain("propitiation");
    expect(body).not.toContain("Title:");
    expect(body).not.toContain("complete Project Gutenberg collection");
    expect(body).not.toContain("START OF THE PROJECT GUTENBERG");
  });

  it("returns trimmed text unchanged when no markers are present", () => {
    expect(stripGutenbergBoilerplate("  plain text  ")).toBe("plain text");
  });
});

describe("deriveGutenbergTitle", () => {
  it("reads the Title: header line", () => {
    expect(deriveGutenbergTitle(BOOK, "10")).toBe(
      "The King James Version of the Holy Bible",
    );
  });

  it("falls back to the ref when no Title line exists", () => {
    expect(deriveGutenbergTitle("no header here", "10")).toBe("10");
  });
});

describe("prepassCandidates — token reduction, NOT the semantic filter", () => {
  const body = stripGutenbergBoilerplate(BOOK);
  const candidates = prepassCandidates(body);

  it("keeps genuinely difficult vocabulary for the LLM to judge", () => {
    // A hard word survives the pre-pass (the LLM is the real filter).
    expect(candidates).toContain("firmament");
    expect(candidates).toContain("propitiation");
    expect(candidates).toContain("covet");
    expect(candidates).toContain("raiment");
  });

  it("drops archaic function words and -eth/-est inflections as noise", () => {
    expect(candidates).not.toContain("thou");
    expect(candidates).not.toContain("shalt");
    expect(candidates).not.toContain("unto");
    expect(candidates).not.toContain("cometh");
  });

  it("drops high-frequency stopwords", () => {
    expect(candidates).not.toContain("and");
    expect(candidates).not.toContain("the");
    expect(candidates).not.toContain("not");
  });

  it("drops proper-noun-ish tokens (capitalized mid-sentence)", () => {
    expect(candidates).not.toContain("god");
    expect(candidates).not.toContain("moses");
  });

  it("returns each candidate once, in order of first appearance", () => {
    const dupes = prepassCandidates("firmament firmament waters firmament");
    expect(dupes).toEqual(["firmament", "waters"]);
  });
});
