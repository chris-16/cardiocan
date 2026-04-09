import type { DogAccessRole } from "./dog-access";

/**
 * Central permissions definitions for owner/cuidador roles.
 *
 * Owner  – full admin: edit profile, manage caretakers, delete dog.
 * Cuidador (caretaker) – can measure and view, cannot modify settings.
 */

const ROLE_PERMISSIONS = {
  owner: [
    "dog:read",
    "dog:edit",
    "dog:delete",
    "dog:photo",
    "measurement:create",
    "measurement:read",
    "measurement:editNotes",
    "shares:manage",
    "medication:manage",
    "medication:read",
    "medication:log",
  ],
  caretaker: [
    "dog:read",
    "measurement:create",
    "measurement:read",
    "measurement:editNotes",
    "medication:read",
    "medication:log",
  ],
} as const;

export type Permission = (typeof ROLE_PERMISSIONS)[DogAccessRole][number];

/**
 * Check if a role has a specific permission.
 */
export function hasPermission(
  role: DogAccessRole,
  permission: Permission
): boolean {
  const permissions = ROLE_PERMISSIONS[role] as readonly string[];
  return permissions.includes(permission);
}

/**
 * Require a specific permission; throws a descriptive error if denied.
 * Use in API routes for consistent error responses.
 */
export function requirePermission(
  role: DogAccessRole,
  permission: Permission
): void {
  if (!hasPermission(role, permission)) {
    throw new PermissionDeniedError(permission, role);
  }
}

export class PermissionDeniedError extends Error {
  public readonly permission: Permission;
  public readonly role: DogAccessRole;

  constructor(permission: Permission, role: DogAccessRole) {
    super(
      `El rol "${role}" no tiene permiso para "${permission}"`
    );
    this.name = "PermissionDeniedError";
    this.permission = permission;
    this.role = role;
  }
}
