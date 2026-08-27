import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { resetDb } from "./helpers";

const app = createApp();

async function authToken(email = "user@example.com") {
  const res = await request(app)
    .post("/auth/register")
    .send({ email, password: "password123" });
  return res.body.token as string;
}

const sampleApplication = {
  applicantName: "Jane Doe",
  amountRequested: 20000,
  purpose: "home improvement",
  income: 90000,
  employmentStatus: "employed full-time",
  documentText: "Jane Doe, employed full-time, 6 years experience, income 90000.",
};

describe("applications", () => {
  beforeEach(resetDb);

  it("creates and fetches an application", async () => {
    const token = await authToken();
    const create = await request(app)
      .post("/applications")
      .set("authorization", `Bearer ${token}`)
      .send(sampleApplication);

    expect(create.status).toBe(201);
    expect(create.body.status).toBe("draft");
    expect(create.body.documents).toHaveLength(1);

    const get = await request(app)
      .get(`/applications/${create.body.id}`)
      .set("authorization", `Bearer ${token}`);
    expect(get.status).toBe(200);
    expect(get.body.applicantName).toBe("Jane Doe");
  });

  it("rejects invalid input with 400", async () => {
    const token = await authToken();
    const res = await request(app)
      .post("/applications")
      .set("authorization", `Bearer ${token}`)
      .send({ ...sampleApplication, amountRequested: -5 });
    expect(res.status).toBe(400);
  });

  it("submit returns 202 and moves the application to processing", async () => {
    const token = await authToken("submit@example.com");
    const create = await request(app)
      .post("/applications")
      .set("authorization", `Bearer ${token}`)
      .send(sampleApplication);

    const submit = await request(app)
      .post(`/applications/${create.body.id}/submit`)
      .set("authorization", `Bearer ${token}`);
    expect(submit.status).toBe(202);
    expect(submit.body.status).toBe("processing");

    // Re-submitting a non-draft application is rejected.
    const again = await request(app)
      .post(`/applications/${create.body.id}/submit`)
      .set("authorization", `Bearer ${token}`);
    expect(again.status).toBe(400);
  });

  it("forbids access to another user's application", async () => {
    const tokenA = await authToken("owner@example.com");
    const created = await request(app)
      .post("/applications")
      .set("authorization", `Bearer ${tokenA}`)
      .send(sampleApplication);

    const tokenB = await authToken("intruder@example.com");
    const res = await request(app)
      .get(`/applications/${created.body.id}`)
      .set("authorization", `Bearer ${tokenB}`);
    expect(res.status).toBe(403);
  });
});
