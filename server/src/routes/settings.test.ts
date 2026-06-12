import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import express, { type Express } from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GetSettingsResponse, PutSettingsResponse } from "@estudio/shared";
import { errorHandler } from "../app.js";
import { openDb, type DB } from "../db/db.js";
import { runMigrations } from "../db/migrate.js";
import { logger } from "../logger.js";
import { registerSettingsRoutes } from "./settings.js";

let dataDir: string;
let db: DB;
let app: Express;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "estudio-settings-r-"));
  db = openDb(dataDir);
  runMigrations(db, dataDir);

  app = express();
  app.use(express.json());
  registerSettingsRoutes(app, db);
  app.use(errorHandler);
});

afterEach(() => {
  logger.detachDb();
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("settings routes", () => {
  it("GET /api/settings returns defaults when nothing is stored", async () => {
    const res = await request(app).get("/api/settings").expect(200);
    const body = res.body as GetSettingsResponse;
    expect(body.settings).toEqual({
      definitionDisplay: "both",
      newCardsPerDay: 20,
      reviewFormat: "mc",
    });
  });

  it("PUT /api/settings updates valid values and returns the new state", async () => {
    const res = await request(app)
      .put("/api/settings")
      .send({ definitionDisplay: "es", newCardsPerDay: 40 })
      .expect(200);
    const body = res.body as PutSettingsResponse;
    expect(body.settings).toEqual({
      definitionDisplay: "es",
      newCardsPerDay: 40,
      reviewFormat: "mc",
    });

    // Persisted: a fresh GET reflects it, and new_cards_per_day is JSON-encoded.
    const get = (await request(app).get("/api/settings").expect(200))
      .body as GetSettingsResponse;
    expect(get.settings.definitionDisplay).toBe("es");
    expect(get.settings.newCardsPerDay).toBe(40);
    const row = db
      .prepare("SELECT value FROM setting WHERE key = 'new_cards_per_day'")
      .get() as { value: string };
    expect(row.value).toBe("40");
  });

  it("PUT /api/settings accepts a partial update", async () => {
    const res = await request(app)
      .put("/api/settings")
      .send({ definitionDisplay: "en" })
      .expect(200);
    const body = res.body as PutSettingsResponse;
    expect(body.settings).toEqual({
      definitionDisplay: "en",
      newCardsPerDay: 20,
      reviewFormat: "mc",
    });
  });

  it("GET /api/settings returns default reviewFormat 'mc'", async () => {
    const res = await request(app).get("/api/settings").expect(200);
    const body = res.body as GetSettingsResponse;
    expect(body.settings.reviewFormat).toBe("mc");
  });

  it("PUT { reviewFormat: 'yesno' } persists and GET reflects it", async () => {
    await request(app)
      .put("/api/settings")
      .send({ reviewFormat: "yesno" })
      .expect(200);
    const get = (await request(app).get("/api/settings").expect(200))
      .body as GetSettingsResponse;
    expect(get.settings.reviewFormat).toBe("yesno");
  });

  it("PUT an invalid reviewFormat value returns 400", async () => {
    const res = await request(app)
      .put("/api/settings")
      .send({ reviewFormat: "hard" })
      .expect(400);
    expect(res.body.error.code).toBe("invalid_setting");
    // Nothing was written — default is still returned.
    const get = (await request(app).get("/api/settings").expect(200))
      .body as GetSettingsResponse;
    expect(get.settings.reviewFormat).toBe("mc");
  });

  it("PUT /api/settings rejects an invalid definitionDisplay with 400", async () => {
    const res = await request(app)
      .put("/api/settings")
      .send({ definitionDisplay: "fr" })
      .expect(400);
    expect(res.body.error.code).toBe("invalid_setting");
    // Nothing was written.
    const get = (await request(app).get("/api/settings").expect(200))
      .body as GetSettingsResponse;
    expect(get.settings.definitionDisplay).toBe("both");
  });

  it("PUT /api/settings rejects an out-of-range newCardsPerDay with 400", async () => {
    const res = await request(app)
      .put("/api/settings")
      .send({ newCardsPerDay: 99 })
      .expect(400);
    expect(res.body.error.code).toBe("invalid_setting");
  });
});
