import { getDb } from "@/lib/db";
import { dogs, dogShares } from "@/lib/db/schema";
import { eq, and, or } from "drizzle-orm";

export type DogAccessRole = "owner" | "caretaker";

interface DogAccess {
  dog: typeof dogs.$inferSelect;
  role: DogAccessRole;
}

/**
 * Check if a user can access a dog (as owner or shared caretaker).
 * Returns the dog and the user's role, or null if no access.
 */
export async function getDogAccess(
  dogId: string,
  userId: string
): Promise<DogAccess | null> {
  const db = getDb();

  // Check ownership first
  const [ownedDog] = await db
    .select()
    .from(dogs)
    .where(and(eq(dogs.id, dogId), eq(dogs.userId, userId)))
    .limit(1);

  if (ownedDog) {
    return { dog: ownedDog, role: "owner" };
  }

  // Check shared access
  const [share] = await db
    .select()
    .from(dogShares)
    .where(and(eq(dogShares.dogId, dogId), eq(dogShares.userId, userId)))
    .limit(1);

  if (share) {
    const [sharedDog] = await db
      .select()
      .from(dogs)
      .where(eq(dogs.id, dogId))
      .limit(1);

    if (sharedDog) {
      // Use the actual role stored in dogShares (defaults to "caretaker")
      const role = (share.role as DogAccessRole) || "caretaker";
      return { dog: sharedDog, role };
    }
  }

  return null;
}

/**
 * Get all dogs a user has access to (owned + shared).
 */
export async function getAllAccessibleDogs(userId: string) {
  const db = getDb();

  const ownedDogs = await db
    .select()
    .from(dogs)
    .where(eq(dogs.userId, userId));

  const sharedEntries = await db
    .select({
      dog: dogs,
      role: dogShares.role,
    })
    .from(dogShares)
    .innerJoin(dogs, eq(dogShares.dogId, dogs.id))
    .where(eq(dogShares.userId, userId));

  return {
    owned: ownedDogs,
    shared: sharedEntries.map((e) => e.dog),
  };
}
