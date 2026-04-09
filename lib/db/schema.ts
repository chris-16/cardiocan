import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(), // UUID
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(), // session token
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const dogs = sqliteTable("dogs", {
  id: text("id").primaryKey(), // UUID
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  breed: text("breed"),
  weight: integer("weight"), // weight in grams for precision
  birthDate: text("birth_date"), // ISO date string (YYYY-MM-DD)
  cardiacCondition: text("cardiac_condition"),
  photoUrl: text("photo_url"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export const respiratoryMeasurements = sqliteTable("respiratory_measurements", {
  id: text("id").primaryKey(), // UUID
  dogId: text("dog_id")
    .notNull()
    .references(() => dogs.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  breathCount: integer("breath_count").notNull(), // total taps counted
  durationSeconds: integer("duration_seconds").notNull(), // 30 or 60
  breathsPerMinute: integer("breaths_per_minute").notNull(), // calculated rate
  notes: text("notes"), // optional observation notes
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type Dog = typeof dogs.$inferSelect;
export type NewDog = typeof dogs.$inferInsert;
export type RespiratoryMeasurement = typeof respiratoryMeasurements.$inferSelect;
export type NewRespiratoryMeasurement = typeof respiratoryMeasurements.$inferInsert;
