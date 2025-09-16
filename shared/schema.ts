import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, decimal, integer } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("employee"), // employee or admin
  employeeId: text("employee_id").unique(),
  department: text("department"),
  joinDate: timestamp("join_date").defaultNow(),
  isActive: boolean("is_active").default(true),
  isLoggedIn: boolean("is_logged_in").default(false),
  // Optional default work hours per employee in HH:MM 24h format
  defaultStartTime: text("default_start_time"),
  defaultEndTime: text("default_end_time"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const attendanceRecords = pgTable("attendance_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  checkInTime: timestamp("check_in_time").notNull(),
  checkOutTime: timestamp("check_out_time"),
  hoursWorked: decimal("hours_worked", { precision: 5, scale: 2 }),
  isLate: boolean("is_late").default(false),
  isEarlyLeave: boolean("is_early_leave").default(false),
  audioFileUrl: text("audio_file_url"),
  date: text("date").notNull(), // YYYY-MM-DD format
  createdAt: timestamp("created_at").defaultNow(),
});

export const audioRecordings = pgTable("audio_recordings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  attendanceId: varchar("attendance_id").references(() => attendanceRecords.id),
  fileUrl: text("file_url"),
  fileName: text("file_name"),
  fileSize: integer("file_size"), // in bytes
  duration: integer("duration"), // in seconds
  recordingDate: text("recording_date").notNull(), // YYYY-MM-DD format
  isActive: boolean("is_active").default(false), // true if currently recording
  createdAt: timestamp("created_at").defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  attendanceRecords: many(attendanceRecords),
  audioRecordings: many(audioRecordings),
}));

export const attendanceRecordsRelations = relations(attendanceRecords, ({ one, many }) => ({
  user: one(users, {
    fields: [attendanceRecords.userId],
    references: [users.id],
  }),
  audioRecordings: many(audioRecordings),
}));

export const audioRecordingsRelations = relations(audioRecordings, ({ one }) => ({
  user: one(users, {
    fields: [audioRecordings.userId],
    references: [users.id],
  }),
  attendanceRecord: one(attendanceRecords, {
    fields: [audioRecordings.attendanceId],
    references: [attendanceRecords.id],
  }),
}));

// Schemas for validation
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  isLoggedIn: true,
});

export const insertAttendanceSchema = createInsertSchema(attendanceRecords).omit({
  id: true,
  createdAt: true,
});

export const insertAudioRecordingSchema = createInsertSchema(audioRecordings).omit({
  id: true,
  createdAt: true,
});

export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  location: z.object({
    latitude: z.number(),
    longitude: z.number(),
    accuracy: z.number(),
  }).nullable(),
});

export const adminLoginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  audioPassword: z.string().optional(),
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type AttendanceRecord = typeof attendanceRecords.$inferSelect;
export type InsertAttendanceRecord = z.infer<typeof insertAttendanceSchema>;
export type AudioRecording = typeof audioRecordings.$inferSelect;
export type InsertAudioRecording = z.infer<typeof insertAudioRecordingSchema>;
export type LoginData = z.infer<typeof loginSchema>;
export type AdminLoginData = z.infer<typeof adminLoginSchema>;

// Monthly work hours types
export type DailyWorkHours = {
  date: string; // YYYY-MM-DD
  hoursWorked: number;
  checkInTime: string | null;
  checkOutTime: string | null;
  status: 'complete' | 'incomplete' | 'absent';
};

export type EmployeeWorkHours = {
  userId: string;
  username: string;
  employeeId: string;
  department: string;
  dailyHours: DailyWorkHours[];
  totalHours: number;
  totalDays: number;
};

export type MonthlyWorkHoursResponse = {
  month: string; // YYYY-MM
  employees: EmployeeWorkHours[];
};
