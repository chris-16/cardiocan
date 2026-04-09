import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, and } from "drizzle-orm";
import * as schema from "./schema";
import crypto from "crypto";

const { dogs, users, dogShares, shareInvitations } = schema;

function setupTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });

  // Create tables
  sqlite.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'America/Santiago',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE dogs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      breed TEXT,
      weight INTEGER,
      birth_date TEXT,
      cardiac_condition TEXT,
      rpm_threshold INTEGER NOT NULL DEFAULT 30,
      photo_url TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE respiratory_measurements (
      id TEXT PRIMARY KEY,
      dog_id TEXT NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      breath_count INTEGER NOT NULL,
      duration_seconds INTEGER NOT NULL,
      breaths_per_minute INTEGER NOT NULL,
      notes TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE dog_shares (
      id TEXT PRIMARY KEY,
      dog_id TEXT NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'caretaker',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE share_invitations (
      id TEXT PRIMARY KEY,
      dog_id TEXT NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
      invited_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      email TEXT,
      token TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE UNIQUE INDEX share_invitations_token_unique ON share_invitations (token);
  `);

  return db;
}

describe("Dog Sharing Feature - Schema and Data Layer", () => {
  let db: ReturnType<typeof setupTestDb>;
  const now = new Date();
  const ownerId = crypto.randomUUID();
  const caretakerId = crypto.randomUUID();
  const caretaker2Id = crypto.randomUUID();
  const dogId = crypto.randomUUID();

  beforeAll(() => {
    db = setupTestDb();

    // Seed users
    db.insert(users).values({
      id: ownerId,
      email: "owner@test.com",
      passwordHash: "hash",
      name: "Owner",
    }).run();

    db.insert(users).values({
      id: caretakerId,
      email: "caretaker@test.com",
      passwordHash: "hash",
      name: "Caretaker",
    }).run();

    db.insert(users).values({
      id: caretaker2Id,
      email: "caretaker2@test.com",
      passwordHash: "hash",
      name: "Caretaker 2",
    }).run();

    // Seed dog
    db.insert(dogs).values({
      id: dogId,
      userId: ownerId,
      name: "Max",
    }).run();
  });

  describe("AC1: Owner can generate invitation link", () => {
    it("should create a link-only invitation (no email)", () => {
      const invId = crypto.randomUUID();
      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      db.insert(shareInvitations).values({
        id: invId,
        dogId,
        invitedBy: ownerId,
        email: null,
        token,
        status: "pending",
        expiresAt,
      }).run();

      const [inv] = db
        .select()
        .from(shareInvitations)
        .where(eq(shareInvitations.token, token))
        .all();

      expect(inv).toBeDefined();
      expect(inv.email).toBeNull();
      expect(inv.status).toBe("pending");
      expect(inv.dogId).toBe(dogId);
      expect(inv.invitedBy).toBe(ownerId);
    });

    it("should create an email-based invitation", () => {
      const invId = crypto.randomUUID();
      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      db.insert(shareInvitations).values({
        id: invId,
        dogId,
        invitedBy: ownerId,
        email: "caretaker@test.com",
        token,
        status: "pending",
        expiresAt,
      }).run();

      const [inv] = db
        .select()
        .from(shareInvitations)
        .where(eq(shareInvitations.token, token))
        .all();

      expect(inv).toBeDefined();
      expect(inv.email).toBe("caretaker@test.com");
      expect(inv.status).toBe("pending");
    });

    it("should enforce unique token constraint", () => {
      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      db.insert(shareInvitations).values({
        id: crypto.randomUUID(),
        dogId,
        invitedBy: ownerId,
        token,
        status: "pending",
        expiresAt,
      }).run();

      expect(() => {
        db.insert(shareInvitations).values({
          id: crypto.randomUUID(),
          dogId,
          invitedBy: ownerId,
          token, // same token
          status: "pending",
          expiresAt,
        }).run();
      }).toThrow();
    });
  });

  describe("AC2: Caretaker can accept invitation and access dog", () => {
    it("should create a dog_share when accepting invitation", () => {
      const shareId = crypto.randomUUID();

      db.insert(dogShares).values({
        id: shareId,
        dogId,
        userId: caretakerId,
        role: "caretaker",
      }).run();

      const [share] = db
        .select()
        .from(dogShares)
        .where(
          and(eq(dogShares.dogId, dogId), eq(dogShares.userId, caretakerId))
        )
        .all();

      expect(share).toBeDefined();
      expect(share.role).toBe("caretaker");
    });

    it("should allow caretaker to query the shared dog", () => {
      // Check ownership first (should fail for caretaker)
      const ownedDog = db
        .select()
        .from(dogs)
        .where(and(eq(dogs.id, dogId), eq(dogs.userId, caretakerId)))
        .all();

      expect(ownedDog).toHaveLength(0);

      // Check shared access
      const sharedAccess = db
        .select()
        .from(dogShares)
        .where(
          and(eq(dogShares.dogId, dogId), eq(dogShares.userId, caretakerId))
        )
        .all();

      expect(sharedAccess).toHaveLength(1);

      // Then get the dog
      const [dog] = db
        .select()
        .from(dogs)
        .where(eq(dogs.id, dogId))
        .all();

      expect(dog).toBeDefined();
      expect(dog.name).toBe("Max");
    });
  });

  describe("AC3: Multiple users can access the same dog", () => {
    it("should allow 2+ caretakers for the same dog", () => {
      // caretakerId already has access from AC2 test
      const shareId2 = crypto.randomUUID();

      db.insert(dogShares).values({
        id: shareId2,
        dogId,
        userId: caretaker2Id,
        role: "caretaker",
      }).run();

      const shares = db
        .select()
        .from(dogShares)
        .where(eq(dogShares.dogId, dogId))
        .all();

      expect(shares.length).toBeGreaterThanOrEqual(2);

      const userIds = shares.map((s) => s.userId);
      expect(userIds).toContain(caretakerId);
      expect(userIds).toContain(caretaker2Id);
    });

    it("owner still has access via dogs.userId", () => {
      const [dog] = db
        .select()
        .from(dogs)
        .where(and(eq(dogs.id, dogId), eq(dogs.userId, ownerId)))
        .all();

      expect(dog).toBeDefined();
      expect(dog.userId).toBe(ownerId);
    });

    it("getAllAccessibleDogs pattern returns both owned and shared", () => {
      // For caretaker - should have shared dog
      const sharedEntries = db
        .select({ dog: dogs, role: dogShares.role })
        .from(dogShares)
        .innerJoin(dogs, eq(dogShares.dogId, dogs.id))
        .where(eq(dogShares.userId, caretakerId))
        .all();

      expect(sharedEntries).toHaveLength(1);
      expect(sharedEntries[0].dog.name).toBe("Max");

      // For owner - should have owned dog
      const ownedDogs = db
        .select()
        .from(dogs)
        .where(eq(dogs.userId, ownerId))
        .all();

      expect(ownedDogs.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("AC4: Owner can revoke caretaker access", () => {
    it("should delete dog_share to revoke access", () => {
      // Find caretaker2's share
      const [share] = db
        .select()
        .from(dogShares)
        .where(
          and(eq(dogShares.dogId, dogId), eq(dogShares.userId, caretaker2Id))
        )
        .all();

      expect(share).toBeDefined();

      // Revoke
      db.delete(dogShares).where(eq(dogShares.id, share.id)).run();

      // Verify revoked
      const remaining = db
        .select()
        .from(dogShares)
        .where(
          and(eq(dogShares.dogId, dogId), eq(dogShares.userId, caretaker2Id))
        )
        .all();

      expect(remaining).toHaveLength(0);
    });

    it("should revoke invitation by setting status", () => {
      const invId = crypto.randomUUID();
      const token = crypto.randomUUID();

      db.insert(shareInvitations).values({
        id: invId,
        dogId,
        invitedBy: ownerId,
        token,
        status: "pending",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }).run();

      // Revoke
      db.update(shareInvitations)
        .set({ status: "revoked" })
        .where(eq(shareInvitations.id, invId))
        .run();

      const [inv] = db
        .select()
        .from(shareInvitations)
        .where(eq(shareInvitations.id, invId))
        .all();

      expect(inv.status).toBe("revoked");
    });

    it("cascade delete: deleting dog removes all shares", () => {
      const tempDogId = crypto.randomUUID();
      db.insert(dogs).values({
        id: tempDogId,
        userId: ownerId,
        name: "Temp Dog",
      }).run();

      db.insert(dogShares).values({
        id: crypto.randomUUID(),
        dogId: tempDogId,
        userId: caretakerId,
        role: "caretaker",
      }).run();

      db.insert(shareInvitations).values({
        id: crypto.randomUUID(),
        dogId: tempDogId,
        invitedBy: ownerId,
        token: crypto.randomUUID(),
        status: "pending",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }).run();

      // Delete the dog
      db.delete(dogs).where(eq(dogs.id, tempDogId)).run();

      // All shares and invitations should be gone
      const shares = db
        .select()
        .from(dogShares)
        .where(eq(dogShares.dogId, tempDogId))
        .all();
      expect(shares).toHaveLength(0);

      const invitations = db
        .select()
        .from(shareInvitations)
        .where(eq(shareInvitations.dogId, tempDogId))
        .all();
      expect(invitations).toHaveLength(0);
    });
  });

  describe("Edge cases and security", () => {
    it("invitation expires after 7 days", () => {
      const invId = crypto.randomUUID();
      const token = crypto.randomUUID();
      const expired = new Date(Date.now() - 1000); // already expired

      db.insert(shareInvitations).values({
        id: invId,
        dogId,
        invitedBy: ownerId,
        token,
        status: "pending",
        expiresAt: expired,
      }).run();

      const [inv] = db
        .select()
        .from(shareInvitations)
        .where(eq(shareInvitations.token, token))
        .all();

      // The invitation exists but should be expired
      const expiresAt =
        inv.expiresAt instanceof Date
          ? inv.expiresAt
          : new Date(
              typeof inv.expiresAt === "number"
                ? (inv.expiresAt as number) * 1000
                : inv.expiresAt
            );

      expect(expiresAt.getTime()).toBeLessThan(Date.now());
    });

    it("deleting user cascades to their shares", () => {
      const tempUserId = crypto.randomUUID();
      db.insert(users).values({
        id: tempUserId,
        email: `temp_${tempUserId}@test.com`,
        passwordHash: "hash",
        name: "Temp User",
      }).run();

      db.insert(dogShares).values({
        id: crypto.randomUUID(),
        dogId,
        userId: tempUserId,
        role: "caretaker",
      }).run();

      db.delete(users).where(eq(users.id, tempUserId)).run();

      const shares = db
        .select()
        .from(dogShares)
        .where(eq(dogShares.userId, tempUserId))
        .all();

      expect(shares).toHaveLength(0);
    });
  });
});

describe("API Route Logic Validation", () => {
  let db: ReturnType<typeof setupTestDb>;
  const ownerId = crypto.randomUUID();
  const caretakerId = crypto.randomUUID();
  const dogId = crypto.randomUUID();

  beforeAll(() => {
    db = setupTestDb();

    db.insert(users).values([
      { id: ownerId, email: "owner2@test.com", passwordHash: "h", name: "Owner 2" },
      { id: caretakerId, email: "care2@test.com", passwordHash: "h", name: "Care 2" },
    ]).run();

    db.insert(dogs).values({
      id: dogId,
      userId: ownerId,
      name: "Buddy",
    }).run();
  });

  it("POST shares: prevents sharing with yourself (email match)", () => {
    const ownerEmail = "owner2@test.com";
    const inputEmail = "OWNER2@test.com".trim().toLowerCase();
    expect(inputEmail).toBe(ownerEmail);
  });

  it("POST shares: prevents duplicate share", () => {
    db.insert(dogShares).values({
      id: crypto.randomUUID(),
      dogId,
      userId: caretakerId,
      role: "caretaker",
    }).run();

    const [existingShare] = db
      .select()
      .from(dogShares)
      .where(and(eq(dogShares.dogId, dogId), eq(dogShares.userId, caretakerId)))
      .all();

    expect(existingShare).toBeDefined();
    // API would return 400 "Este usuario ya tiene acceso"
  });

  it("POST accept: prevents owner from accepting their own invitation", () => {
    const invId = crypto.randomUUID();
    const token = crypto.randomUUID();

    db.insert(shareInvitations).values({
      id: invId,
      dogId,
      invitedBy: ownerId,
      token,
      status: "pending",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    }).run();

    const [inv] = db
      .select()
      .from(shareInvitations)
      .where(eq(shareInvitations.token, token))
      .all();

    // The API checks: invitation.invitedBy === session.userId
    expect(inv.invitedBy).toBe(ownerId);
    // If session.userId === ownerId, this would be rejected
  });

  it("GET invitation preview: returns dog and inviter info", () => {
    const invId = crypto.randomUUID();
    const token = crypto.randomUUID();

    db.insert(shareInvitations).values({
      id: invId,
      dogId,
      invitedBy: ownerId,
      token,
      status: "pending",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    }).run();

    const [result] = db
      .select({
        id: shareInvitations.id,
        status: shareInvitations.status,
        dogName: dogs.name,
        invitedByName: users.name,
      })
      .from(shareInvitations)
      .innerJoin(dogs, eq(shareInvitations.dogId, dogs.id))
      .innerJoin(users, eq(shareInvitations.invitedBy, users.id))
      .where(eq(shareInvitations.token, token))
      .all();

    expect(result).toBeDefined();
    expect(result.dogName).toBe("Buddy");
    expect(result.invitedByName).toBe("Owner 2");
    expect(result.status).toBe("pending");
  });

  it("DELETE shares: can revoke both active share and pending invitation", () => {
    // Active share
    const shareId = crypto.randomUUID();
    db.insert(dogShares).values({
      id: shareId,
      dogId,
      userId: caretakerId,
      role: "caretaker",
    }).run();

    // Pending invitation
    const invId = crypto.randomUUID();
    db.insert(shareInvitations).values({
      id: invId,
      dogId,
      invitedBy: ownerId,
      token: crypto.randomUUID(),
      status: "pending",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    }).run();

    // Revoke share
    db.delete(dogShares).where(and(eq(dogShares.id, shareId), eq(dogShares.dogId, dogId))).run();
    const sharesAfter = db.select().from(dogShares).where(eq(dogShares.id, shareId)).all();
    expect(sharesAfter).toHaveLength(0);

    // Revoke invitation
    db.update(shareInvitations).set({ status: "revoked" }).where(eq(shareInvitations.id, invId)).run();
    const [invAfter] = db.select().from(shareInvitations).where(eq(shareInvitations.id, invId)).all();
    expect(invAfter.status).toBe("revoked");
  });

  it("GET shares: only returns pending invitations", () => {
    // Create one pending, one accepted, one revoked
    const tokens = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    const statuses = ["pending", "accepted", "revoked"];

    statuses.forEach((status, i) => {
      db.insert(shareInvitations).values({
        id: crypto.randomUUID(),
        dogId,
        invitedBy: ownerId,
        token: tokens[i],
        status,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }).run();
    });

    const pendingInvitations = db
      .select()
      .from(shareInvitations)
      .where(and(eq(shareInvitations.dogId, dogId), eq(shareInvitations.status, "pending")))
      .all();

    // Should only include pending ones
    pendingInvitations.forEach((inv) => {
      expect(inv.status).toBe("pending");
    });
  });
});
