import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { resetDb } from "./helpers";

const app = createApp();

describe("auth", () => {
  beforeAll(resetDb);
  beforeEach(resetDb);

  it("registers a user and returns a token", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ email: "a@example.com", password: "password123" });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeTypeOf("string");
    expect(res.body.user.email).toBe("a@example.com");
    expect(res.body.user.role).toBe("applicant");
  });

  it("rejects duplicate email", async () => {
    await request(app)
      .post("/auth/register")
      .send({ email: "dup@example.com", password: "password123" });
    const res = await request(app)
      .post("/auth/register")
      .send({ email: "dup@example.com", password: "password123" });

    expect(res.status).toBe(409);
  });

  it("rejects a short password with 400", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ email: "b@example.com", password: "short" });
    expect(res.status).toBe(400);
  });

  it("logs in and accesses a protected route", async () => {
    await request(app)
      .post("/auth/register")
      .send({ email: "c@example.com", password: "password123" });

    const login = await request(app)
      .post("/auth/login")
      .send({ email: "c@example.com", password: "password123" });
    expect(login.status).toBe(200);

    const profile = await request(app)
      .get("/auth/profile")
      .set("authorization", `Bearer ${login.body.token}`);
    expect(profile.status).toBe(200);
    expect(profile.body.email).toBe("c@example.com");
  });

  it("blocks the protected route without a token", async () => {
    const res = await request(app).get("/auth/profile");
    expect(res.status).toBe(401);
  });
});
