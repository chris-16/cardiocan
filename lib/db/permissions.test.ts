import { describe, it, expect } from "vitest";
import {
  hasPermission,
  requirePermission,
  PermissionDeniedError,
} from "./permissions";

describe("Role Permissions", () => {
  describe("owner role", () => {
    it("should have all permissions", () => {
      expect(hasPermission("owner", "dog:read")).toBe(true);
      expect(hasPermission("owner", "dog:edit")).toBe(true);
      expect(hasPermission("owner", "dog:delete")).toBe(true);
      expect(hasPermission("owner", "dog:photo")).toBe(true);
      expect(hasPermission("owner", "measurement:create")).toBe(true);
      expect(hasPermission("owner", "measurement:read")).toBe(true);
      expect(hasPermission("owner", "measurement:editNotes")).toBe(true);
      expect(hasPermission("owner", "shares:manage")).toBe(true);
    });
  });

  describe("caretaker role", () => {
    it("should be able to read dog details", () => {
      expect(hasPermission("caretaker", "dog:read")).toBe(true);
    });

    it("should be able to create measurements", () => {
      expect(hasPermission("caretaker", "measurement:create")).toBe(true);
    });

    it("should be able to read measurements", () => {
      expect(hasPermission("caretaker", "measurement:read")).toBe(true);
    });

    it("should be able to edit measurement notes", () => {
      expect(hasPermission("caretaker", "measurement:editNotes")).toBe(true);
    });

    it("should NOT be able to edit the dog profile", () => {
      expect(hasPermission("caretaker", "dog:edit")).toBe(false);
    });

    it("should NOT be able to delete the dog", () => {
      expect(hasPermission("caretaker", "dog:delete")).toBe(false);
    });

    it("should NOT be able to change the dog photo", () => {
      expect(hasPermission("caretaker", "dog:photo")).toBe(false);
    });

    it("should NOT be able to manage shares", () => {
      expect(hasPermission("caretaker", "shares:manage")).toBe(false);
    });
  });

  describe("requirePermission", () => {
    it("should not throw for allowed permissions", () => {
      expect(() => requirePermission("owner", "dog:edit")).not.toThrow();
      expect(() =>
        requirePermission("caretaker", "measurement:create")
      ).not.toThrow();
    });

    it("should throw PermissionDeniedError for denied permissions", () => {
      expect(() =>
        requirePermission("caretaker", "dog:edit")
      ).toThrow(PermissionDeniedError);
    });

    it("should include role and permission in the error", () => {
      try {
        requirePermission("caretaker", "dog:delete");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(PermissionDeniedError);
        const permErr = err as PermissionDeniedError;
        expect(permErr.role).toBe("caretaker");
        expect(permErr.permission).toBe("dog:delete");
      }
    });
  });
});
