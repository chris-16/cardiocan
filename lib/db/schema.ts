import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(), // UUID
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  timezone: text("timezone").notNull().default("America/Santiago"),
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
  rpmThreshold: integer("rpm_threshold").notNull().default(30), // breaths/min alert threshold
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
  method: text("method").notNull().default("manual"), // 'manual' | 'ai'
  aiConfidence: text("ai_confidence"), // 'alta' | 'media' | 'baja' (only for AI)
  notes: text("notes"), // optional observation notes
  videoKey: text("video_key"), // R2 object key for the analysis video evidence
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const dogShares = sqliteTable("dog_shares", {
  id: text("id").primaryKey(), // UUID
  dogId: text("dog_id")
    .notNull()
    .references(() => dogs.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("caretaker"), // 'caretaker'
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const shareInvitations = sqliteTable("share_invitations", {
  id: text("id").primaryKey(), // UUID
  dogId: text("dog_id")
    .notNull()
    .references(() => dogs.id, { onDelete: "cascade" }),
  invitedBy: text("invited_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  email: text("email"), // nullable — null when link-only invitation
  token: text("token").notNull().unique(), // unique invite token
  status: text("status").notNull().default("pending"), // 'pending' | 'accepted' | 'revoked'
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const medications = sqliteTable("medications", {
  id: text("id").primaryKey(), // UUID
  dogId: text("dog_id")
    .notNull()
    .references(() => dogs.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // medication name
  dose: text("dose").notNull(), // e.g. "5mg", "1 comprimido"
  notes: text("notes"), // optional instructions
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const medicationSchedules = sqliteTable("medication_schedules", {
  id: text("id").primaryKey(), // UUID
  medicationId: text("medication_id")
    .notNull()
    .references(() => medications.id, { onDelete: "cascade" }),
  time: text("time").notNull(), // HH:MM format (24h)
  daysOfWeek: text("days_of_week").notNull().default("0,1,2,3,4,5,6"), // comma-separated: 0=Sun..6=Sat
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const medicationLogs = sqliteTable("medication_logs", {
  id: text("id").primaryKey(), // UUID
  medicationId: text("medication_id")
    .notNull()
    .references(() => medications.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  scheduledTime: text("scheduled_time").notNull(), // HH:MM that triggered it
  administeredAt: integer("administered_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  status: text("status").notNull().default("administered"), // 'administered' | 'skipped'
  notes: text("notes"),
});

export const pushSubscriptions = sqliteTable("push_subscriptions", {
  id: text("id").primaryKey(), // UUID
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type Dog = typeof dogs.$inferSelect;
export type NewDog = typeof dogs.$inferInsert;
export type RespiratoryMeasurement = typeof respiratoryMeasurements.$inferSelect;
export type NewRespiratoryMeasurement = typeof respiratoryMeasurements.$inferInsert;
export type DogShare = typeof dogShares.$inferSelect;
export type NewDogShare = typeof dogShares.$inferInsert;
export type ShareInvitation = typeof shareInvitations.$inferSelect;
export type NewShareInvitation = typeof shareInvitations.$inferInsert;
export type Medication = typeof medications.$inferSelect;
export type NewMedication = typeof medications.$inferInsert;
export type MedicationSchedule = typeof medicationSchedules.$inferSelect;
export type NewMedicationSchedule = typeof medicationSchedules.$inferInsert;
export type MedicationLog = typeof medicationLogs.$inferSelect;
export type NewMedicationLog = typeof medicationLogs.$inferInsert;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscription = typeof pushSubscriptions.$inferInsert;

export const calibrationRecords = sqliteTable("calibration_records", {
  id: text("id").primaryKey(), // UUID
  dogId: text("dog_id")
    .notNull()
    .references(() => dogs.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  measurementId: text("measurement_id")
    .notNull()
    .references(() => respiratoryMeasurements.id, { onDelete: "cascade" }),
  aiBreathsPerMinute: integer("ai_breaths_per_minute").notNull(), // Original AI result
  finalBreathsPerMinute: integer("final_breaths_per_minute").notNull(), // Accepted or corrected value
  deviation: integer("deviation").notNull(), // Absolute difference (ai - final)
  action: text("action").notNull(), // 'accepted' | 'corrected'
  aiMethod: text("ai_method").notNull(), // 'cloud' | 'on-device'
  aiConfidence: text("ai_confidence").notNull(), // 'alta' | 'media' | 'baja'
  correctionNotes: text("correction_notes"), // Optional note when correcting
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type CalibrationRecord = typeof calibrationRecords.$inferSelect;
export type NewCalibrationRecord = typeof calibrationRecords.$inferInsert;
