var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// shared/schema.ts
var schema_exports = {};
__export(schema_exports, {
  adminLoginSchema: () => adminLoginSchema,
  attendanceRecords: () => attendanceRecords,
  attendanceRecordsRelations: () => attendanceRecordsRelations,
  audioRecordings: () => audioRecordings,
  audioRecordingsRelations: () => audioRecordingsRelations,
  insertAttendanceSchema: () => insertAttendanceSchema,
  insertAudioRecordingSchema: () => insertAudioRecordingSchema,
  insertUserSchema: () => insertUserSchema,
  loginSchema: () => loginSchema,
  users: () => users,
  usersRelations: () => usersRelations
});
import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, decimal, integer } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
var users, attendanceRecords, audioRecordings, usersRelations, attendanceRecordsRelations, audioRecordingsRelations, insertUserSchema, insertAttendanceSchema, insertAudioRecordingSchema, loginSchema, adminLoginSchema;
var init_schema = __esm({
  "shared/schema.ts"() {
    "use strict";
    users = pgTable("users", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      username: text("username").notNull().unique(),
      password: text("password").notNull(),
      role: text("role").notNull().default("employee"),
      // employee or admin
      employeeId: text("employee_id").unique(),
      department: text("department"),
      joinDate: timestamp("join_date").defaultNow(),
      isActive: boolean("is_active").default(true),
      isLoggedIn: boolean("is_logged_in").default(false),
      // Optional default work hours per employee in HH:MM 24h format
      defaultStartTime: text("default_start_time"),
      defaultEndTime: text("default_end_time"),
      createdAt: timestamp("created_at").defaultNow()
    });
    attendanceRecords = pgTable("attendance_records", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id").notNull().references(() => users.id),
      checkInTime: timestamp("check_in_time").notNull(),
      checkOutTime: timestamp("check_out_time"),
      hoursWorked: decimal("hours_worked", { precision: 5, scale: 2 }),
      isLate: boolean("is_late").default(false),
      isEarlyLeave: boolean("is_early_leave").default(false),
      audioFileUrl: text("audio_file_url"),
      date: text("date").notNull(),
      // YYYY-MM-DD format
      createdAt: timestamp("created_at").defaultNow()
    });
    audioRecordings = pgTable("audio_recordings", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id").notNull().references(() => users.id),
      attendanceId: varchar("attendance_id").references(() => attendanceRecords.id),
      fileUrl: text("file_url"),
      fileName: text("file_name"),
      fileSize: integer("file_size"),
      // in bytes
      duration: integer("duration"),
      // in seconds
      recordingDate: text("recording_date").notNull(),
      // YYYY-MM-DD format
      isActive: boolean("is_active").default(false),
      // true if currently recording
      createdAt: timestamp("created_at").defaultNow()
    });
    usersRelations = relations(users, ({ many }) => ({
      attendanceRecords: many(attendanceRecords),
      audioRecordings: many(audioRecordings)
    }));
    attendanceRecordsRelations = relations(attendanceRecords, ({ one, many }) => ({
      user: one(users, {
        fields: [attendanceRecords.userId],
        references: [users.id]
      }),
      audioRecordings: many(audioRecordings)
    }));
    audioRecordingsRelations = relations(audioRecordings, ({ one }) => ({
      user: one(users, {
        fields: [audioRecordings.userId],
        references: [users.id]
      }),
      attendanceRecord: one(attendanceRecords, {
        fields: [audioRecordings.attendanceId],
        references: [attendanceRecords.id]
      })
    }));
    insertUserSchema = createInsertSchema(users).omit({
      id: true,
      createdAt: true,
      isLoggedIn: true
    });
    insertAttendanceSchema = createInsertSchema(attendanceRecords).omit({
      id: true,
      createdAt: true
    });
    insertAudioRecordingSchema = createInsertSchema(audioRecordings).omit({
      id: true,
      createdAt: true
    });
    loginSchema = z.object({
      username: z.string().min(1, "Username is required"),
      password: z.string().min(1, "Password is required"),
      location: z.object({
        latitude: z.number(),
        longitude: z.number(),
        accuracy: z.number()
      }).nullable()
    });
    adminLoginSchema = z.object({
      username: z.string().min(1, "Username is required"),
      password: z.string().min(1, "Password is required"),
      audioPassword: z.string().optional()
    });
  }
});

// server/db.ts
var db_exports = {};
__export(db_exports, {
  db: () => db,
  ensureDbReady: () => ensureDbReady,
  pool: () => pool
});
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
function parsePositiveInt(value) {
  if (!value) return void 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return void 0;
  const rounded = Math.floor(parsed);
  return rounded > 0 ? rounded : void 0;
}
async function ensureDbReady(retries = 10, delayMs = 1500) {
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query("select 1");
      return;
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}
var RUNTIME_DB_URL, noSslVerify, supabaseHost, poolMax, idleTimeout, connectionTimeout, keepAlive, poolConfig, pool, db, benignCodes, warnThrottleMs, lastBenignLog;
var init_db = __esm({
  "server/db.ts"() {
    "use strict";
    init_schema();
    RUNTIME_DB_URL = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
    if (!RUNTIME_DB_URL) {
      throw new Error(
        "DATABASE_URL must be set. Did you forget to provision a database?"
      );
    }
    noSslVerify = (process.env.PG_NO_SSL_VERIFY || "").toLowerCase() === "true";
    supabaseHost = false;
    try {
      const u = new URL(RUNTIME_DB_URL);
      supabaseHost = /\.supabase\.(co|com)$/i.test(u.hostname);
    } catch {
    }
    if (noSslVerify) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    }
    poolMax = parsePositiveInt(process.env.PG_POOL_MAX);
    idleTimeout = parsePositiveInt(process.env.PG_IDLE_TIMEOUT);
    connectionTimeout = parsePositiveInt(process.env.PG_CONN_TIMEOUT);
    keepAlive = parsePositiveInt(process.env.PG_KEEPALIVE_IDLE);
    poolConfig = {
      connectionString: RUNTIME_DB_URL,
      // Default to verified TLS for Supabase; allow opt-out via PG_NO_SSL_VERIFY
      ...noSslVerify ? { ssl: { rejectUnauthorized: false } } : supabaseHost ? { ssl: true } : {}
    };
    if (poolMax !== void 0) poolConfig.max = poolMax;
    if (idleTimeout !== void 0) poolConfig.idleTimeoutMillis = idleTimeout;
    if (connectionTimeout !== void 0) poolConfig.connectionTimeoutMillis = connectionTimeout;
    if (keepAlive !== void 0) poolConfig.keepAliveInitialDelayMillis = keepAlive;
    pool = new Pool(poolConfig);
    db = drizzle(pool, { schema: schema_exports });
    benignCodes = /* @__PURE__ */ new Set(["XX000"]);
    warnThrottleMs = parsePositiveInt(process.env.PG_POOL_WARN_THROTTLE_MS) ?? 6e4;
    lastBenignLog = 0;
    pool.on("error", (err) => {
      const msg = String(err?.message || err || "");
      const code = err && err.code || "";
      if (benignCodes.has(code) || msg.includes("db_termination") || msg.includes("{:shutdown")) {
        const now = Date.now();
        if (now - lastBenignLog >= warnThrottleMs) {
          console.info("Postgres connection closed by server (likely pooled backend). Will reconnect on next query.");
          lastBenignLog = now;
        }
        return;
      }
      console.error("Unexpected Postgres pool error. Will retry on next query:", err);
    });
  }
});

// server/audio-paths.ts
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
function getAudioBaseDir() {
  const override = (process.env.AUDIO_UPLOAD_DIR || "").trim();
  if (override) {
    const resolved = path.resolve(override);
    try {
      fs.mkdirSync(resolved, { recursive: true });
    } catch {
    }
    return resolved;
  }
  const rootCandidate = path.resolve(process.cwd(), "uploads", "audio");
  if (fs.existsSync(rootCandidate)) {
    try {
      fs.mkdirSync(rootCandidate, { recursive: true });
    } catch {
    }
    return rootCandidate;
  }
  const def = path.join(__dirname, "uploads", "audio");
  try {
    fs.mkdirSync(def, { recursive: true });
  } catch {
  }
  return def;
}
function slugifyPathSegment(value) {
  if (!value) return "";
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
}
function getUserAudioDirKey(user) {
  const segments = [];
  const username = slugifyPathSegment(user?.username ?? "");
  if (username) segments.push(username);
  const employeeId = slugifyPathSegment(user?.employeeId ?? "");
  if (employeeId && !segments.includes(employeeId)) segments.push(employeeId);
  const idSegment = slugifyPathSegment(user?.id ?? "");
  if (segments.length === 0 && idSegment) {
    segments.push(idSegment);
  } else if (idSegment) {
    segments.push(idSegment.slice(-8) || idSegment);
  }
  const key = segments.filter(Boolean).join("-");
  return key || "unknown-user";
}
function ensureUserAudioDir(user) {
  const key = getUserAudioDirKey(user);
  const dir = path.join(getAudioBaseDir(), key);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
  }
  return { key, dir };
}
function resolveFilePathFromUrl(fileUrl) {
  if (!fileUrl) return void 0;
  const normalized = fileUrl.startsWith("/") ? fileUrl : `/${fileUrl}`;
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length < 4) return void 0;
  const [uploads, audio2, dirKey, ...rest] = parts;
  if (uploads !== "uploads" || audio2 !== "audio" || !dirKey || rest.length === 0) {
    return void 0;
  }
  const filename = rest.join("/");
  return path.join(getAudioBaseDir(), dirKey, filename);
}
var __filename, __dirname;
var init_audio_paths = __esm({
  "server/audio-paths.ts"() {
    "use strict";
    __filename = fileURLToPath(import.meta.url);
    __dirname = path.dirname(__filename);
  }
});

// server/storage.db.ts
var storage_db_exports = {};
__export(storage_db_exports, {
  DatabaseStorage: () => DatabaseStorage,
  storage: () => storage
});
import { eq, desc, and, sql as sql2 } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";
import fs2 from "fs";
import path2 from "path";
var PostgresSessionStore, DatabaseStorage, storage;
var init_storage_db = __esm({
  "server/storage.db.ts"() {
    "use strict";
    init_schema();
    init_db();
    init_audio_paths();
    PostgresSessionStore = connectPg(session);
    DatabaseStorage = class {
      sessionStore;
      constructor() {
        this.sessionStore = new PostgresSessionStore({
          pool,
          createTableIfMissing: true
        });
      }
      async getUser(id) {
        const [user] = await db.select().from(users).where(eq(users.id, id));
        return user || void 0;
      }
      async getUserByUsername(username) {
        const [user] = await db.select().from(users).where(eq(users.username, username));
        return user || void 0;
      }
      async createUser(insertUser) {
        const [user] = await db.insert(users).values(insertUser).returning();
        return user;
      }
      async createAttendanceRecord(record) {
        const [attendanceRecord] = await db.insert(attendanceRecords).values(record).returning();
        return attendanceRecord;
      }
      async updateAttendanceRecord(id, record) {
        const [updatedRecord] = await db.update(attendanceRecords).set(record).where(eq(attendanceRecords.id, id)).returning();
        return updatedRecord || void 0;
      }
      async getAttendanceRecordsByUserId(userId) {
        return await db.select().from(attendanceRecords).where(eq(attendanceRecords.userId, userId)).orderBy(desc(attendanceRecords.checkInTime));
      }
      async getTodayAttendanceRecord(userId, date) {
        const [record] = await db.select().from(attendanceRecords).where(and(
          eq(attendanceRecords.userId, userId),
          eq(attendanceRecords.date, date)
        )).orderBy(desc(attendanceRecords.checkInTime)).limit(1);
        return record || void 0;
      }
      async getAllTodayAttendance(date) {
        return await db.select({
          id: attendanceRecords.id,
          userId: attendanceRecords.userId,
          checkInTime: attendanceRecords.checkInTime,
          checkOutTime: attendanceRecords.checkOutTime,
          hoursWorked: attendanceRecords.hoursWorked,
          isLate: attendanceRecords.isLate,
          isEarlyLeave: attendanceRecords.isEarlyLeave,
          audioFileUrl: attendanceRecords.audioFileUrl,
          date: attendanceRecords.date,
          createdAt: attendanceRecords.createdAt,
          user: users
        }).from(attendanceRecords).innerJoin(users, eq(attendanceRecords.userId, users.id)).where(eq(attendanceRecords.date, date)).orderBy(desc(attendanceRecords.checkInTime));
      }
      async createAudioRecording(recording) {
        const [audioRecording] = await db.insert(audioRecordings).values(recording).returning();
        return audioRecording;
      }
      async updateAudioRecording(id, recording) {
        const [updatedRecording] = await db.update(audioRecordings).set(recording).where(eq(audioRecordings.id, id)).returning();
        return updatedRecording || void 0;
      }
      async getAudioRecordingById(id) {
        const [recording] = await db.select().from(audioRecordings).where(eq(audioRecordings.id, id));
        return recording || void 0;
      }
      async getActiveAudioRecordingByAttendance(attendanceId) {
        const [recording] = await db.select().from(audioRecordings).where(and(eq(audioRecordings.attendanceId, attendanceId), eq(audioRecordings.isActive, true)));
        return recording || void 0;
      }
      async getAudioRecordingByUserAndDate(userId, date) {
        const [recording] = await db.select().from(audioRecordings).where(and(eq(audioRecordings.userId, userId), eq(audioRecordings.recordingDate, date))).orderBy(desc(audioRecordings.createdAt));
        return recording || void 0;
      }
      async getTotalAudioStorage() {
        const [result] = await db.select({ total: sql2`coalesce(sum(${audioRecordings.fileSize}), 0)` }).from(audioRecordings);
        return result?.total || 0;
      }
      async getOldestAudioRecording() {
        const [recording] = await db.select().from(audioRecordings).orderBy(audioRecordings.createdAt).limit(1);
        return recording || void 0;
      }
      async enforceAudioStorageLimit(maxBytes) {
        let total = await this.getTotalAudioStorage();
        const baseDir = getAudioBaseDir();
        while (total > maxBytes) {
          const oldest = await this.getOldestAudioRecording();
          if (!oldest) break;
          if (oldest.fileName) {
            let filePath2 = resolveFilePathFromUrl(oldest.fileUrl);
            if (!filePath2) {
              try {
                const user = await this.getUser(oldest.userId);
                const dirKey = getUserAudioDirKey(user ?? { id: oldest.userId });
                filePath2 = path2.join(baseDir, dirKey, oldest.fileName);
              } catch {
              }
            }
            if (filePath2) {
              try {
                await fs2.promises.unlink(filePath2);
              } catch (err) {
                console.warn("File delete error:", err);
              }
            }
          }
          await this.deleteAudioRecording(oldest.id);
          total -= oldest.fileSize || 0;
        }
      }
      async getAudioRecordingsByUserId(userId) {
        return await db.select().from(audioRecordings).where(eq(audioRecordings.userId, userId)).orderBy(desc(audioRecordings.createdAt));
      }
      async getAllAudioRecordings() {
        return await db.select({
          id: audioRecordings.id,
          userId: audioRecordings.userId,
          attendanceId: audioRecordings.attendanceId,
          fileUrl: audioRecordings.fileUrl,
          fileName: audioRecordings.fileName,
          fileSize: audioRecordings.fileSize,
          duration: audioRecordings.duration,
          recordingDate: audioRecordings.recordingDate,
          isActive: audioRecordings.isActive,
          createdAt: audioRecordings.createdAt,
          user: users
        }).from(audioRecordings).innerJoin(users, eq(audioRecordings.userId, users.id)).orderBy(desc(audioRecordings.createdAt));
      }
      async getActiveAudioRecordings() {
        return await db.select({
          id: audioRecordings.id,
          userId: audioRecordings.userId,
          attendanceId: audioRecordings.attendanceId,
          fileUrl: audioRecordings.fileUrl,
          fileName: audioRecordings.fileName,
          fileSize: audioRecordings.fileSize,
          duration: audioRecordings.duration,
          recordingDate: audioRecordings.recordingDate,
          isActive: audioRecordings.isActive,
          createdAt: audioRecordings.createdAt,
          user: users
        }).from(audioRecordings).innerJoin(users, eq(audioRecordings.userId, users.id)).where(eq(audioRecordings.isActive, true));
      }
      async deleteAudioRecording(id) {
        await db.delete(audioRecordings).where(eq(audioRecordings.id, id));
      }
      async deleteOldAudioRecordings(daysOld) {
        const cutoffDate = /* @__PURE__ */ new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);
        await db.delete(audioRecordings).where(sql2`${audioRecordings.createdAt} < ${cutoffDate}`);
      }
      async getAllUsers() {
        return await db.select().from(users).where(eq(users.role, "employee")).orderBy(users.username);
      }
      async updateUser(id, user) {
        const [updatedUser] = await db.update(users).set(user).where(eq(users.id, id)).returning();
        return updatedUser || void 0;
      }
      async deleteUser(id) {
        const fileCandidates = [];
        const dirCandidates = [];
        await db.transaction(async (tx) => {
          const user = await tx.query.users.findFirst({ where: eq(users.id, id) });
          if (!user) return;
          dirCandidates.push(path2.join(getAudioBaseDir(), getUserAudioDirKey(user)));
          const audioRows = await tx.select({ fileUrl: audioRecordings.fileUrl, fileName: audioRecordings.fileName }).from(audioRecordings).where(eq(audioRecordings.userId, id));
          for (const row of audioRows) {
            const resolved = resolveFilePathFromUrl(row.fileUrl);
            if (resolved) fileCandidates.push(resolved);
            else if (row.fileName) {
              fileCandidates.push(path2.join(getAudioBaseDir(), getUserAudioDirKey(user), row.fileName));
            }
          }
          await tx.delete(audioRecordings).where(eq(audioRecordings.userId, id));
          await tx.delete(attendanceRecords).where(eq(attendanceRecords.userId, id));
          await tx.delete(users).where(eq(users.id, id));
        });
        const uniqueFiles = Array.from(new Set(fileCandidates));
        for (const filePath2 of uniqueFiles) {
          try {
            await fs2.promises.rm(filePath2, { force: true });
          } catch {
          }
        }
        for (const dirPath of Array.from(new Set(dirCandidates))) {
          try {
            await fs2.promises.rm(dirPath, { recursive: true, force: true });
          } catch {
          }
        }
      }
      async getMonthlyWorkHours(month) {
        const allUsers = await db.select().from(users).where(eq(users.role, "employee")).orderBy(users.username);
        const monthStart = `${month}-01`;
        const monthEnd = `${month}-31`;
        const attendanceData = await db.select({
          userId: attendanceRecords.userId,
          date: attendanceRecords.date,
          checkInTime: attendanceRecords.checkInTime,
          checkOutTime: attendanceRecords.checkOutTime,
          hoursWorked: attendanceRecords.hoursWorked,
          username: users.username,
          employeeId: users.employeeId,
          department: users.department
        }).from(attendanceRecords).innerJoin(users, eq(attendanceRecords.userId, users.id)).where(
          and(
            sql2`${attendanceRecords.date} >= ${monthStart}`,
            sql2`${attendanceRecords.date} <= ${monthEnd}`
          )
        ).orderBy(users.username, attendanceRecords.date);
        const year = parseInt(month.split("-")[0]);
        const monthNum = parseInt(month.split("-")[1]);
        const daysInMonth = new Date(year, monthNum, 0).getDate();
        const allDaysInMonth = [];
        for (let day = 1; day <= daysInMonth; day++) {
          const dayStr = day.toString().padStart(2, "0");
          allDaysInMonth.push(`${month}-${dayStr}`);
        }
        const userAttendanceMap = /* @__PURE__ */ new Map();
        attendanceData.forEach((record) => {
          if (!userAttendanceMap.has(record.userId)) {
            userAttendanceMap.set(record.userId, []);
          }
          userAttendanceMap.get(record.userId).push(record);
        });
        const employees = allUsers.map((user) => {
          const userAttendance = userAttendanceMap.get(user.id) || [];
          const attendanceByDate = new Map(userAttendance.map((a) => [a.date, a]));
          const dailyHours = allDaysInMonth.map((date) => {
            const attendance2 = attendanceByDate.get(date);
            if (!attendance2) {
              return {
                date,
                hoursWorked: 0,
                checkInTime: null,
                checkOutTime: null,
                status: "absent"
              };
            }
            const hoursWorked = attendance2.hoursWorked ? parseFloat(attendance2.hoursWorked) : 0;
            const status = attendance2.checkOutTime ? "complete" : "incomplete";
            return {
              date,
              hoursWorked,
              checkInTime: attendance2.checkInTime ? attendance2.checkInTime.toISOString() : null,
              checkOutTime: attendance2.checkOutTime ? attendance2.checkOutTime.toISOString() : null,
              status
            };
          });
          const totalHours = dailyHours.reduce((sum, day) => sum + day.hoursWorked, 0);
          const totalDays = dailyHours.filter((day) => day.status !== "absent").length;
          return {
            userId: user.id,
            username: user.username,
            employeeId: user.employeeId || "",
            department: user.department || "",
            dailyHours,
            totalHours: Math.round(totalHours * 100) / 100,
            // Round to 2 decimal places
            totalDays
          };
        });
        return {
          month,
          employees
        };
      }
    };
    storage = new DatabaseStorage();
  }
});

// server/storage.memory.ts
var storage_memory_exports = {};
__export(storage_memory_exports, {
  MemoryStorage: () => MemoryStorage,
  storage: () => storage2
});
import session2 from "express-session";
import createMemoryStoreFactory from "memorystore";
import { nanoid } from "nanoid";
function todayStr(d = /* @__PURE__ */ new Date()) {
  return d.toISOString().split("T")[0];
}
function parseNumOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
var MemoryStoreFactory, users2, attendance, audio, MemoryStorage, storage2;
var init_storage_memory = __esm({
  "server/storage.memory.ts"() {
    "use strict";
    MemoryStoreFactory = createMemoryStoreFactory(session2);
    users2 = [];
    attendance = [];
    audio = [];
    MemoryStorage = class {
      sessionStore;
      constructor() {
        this.sessionStore = new MemoryStoreFactory({ checkPeriod: 60 * 60 * 1e3 });
      }
      async getUser(id) {
        return users2.find((u) => u.id === id);
      }
      async getUserByUsername(username) {
        return users2.find((u) => u.username === username);
      }
      async createUser(insertUser) {
        const user = {
          id: nanoid(),
          username: insertUser.username,
          password: insertUser.password,
          role: insertUser.role || "employee",
          employeeId: insertUser.employeeId || null,
          department: insertUser.department || null,
          joinDate: /* @__PURE__ */ new Date(),
          isActive: true,
          isLoggedIn: false,
          createdAt: /* @__PURE__ */ new Date()
        };
        users2.push(user);
        return user;
      }
      async createAttendanceRecord(record) {
        const rec = {
          id: nanoid(),
          userId: record.userId,
          checkInTime: record.checkInTime,
          checkOutTime: record.checkOutTime ?? null,
          hoursWorked: record.hoursWorked ?? null,
          isLate: !!record.isLate,
          isEarlyLeave: !!record.isEarlyLeave,
          audioFileUrl: record.audioFileUrl ?? null,
          date: record.date || todayStr(),
          createdAt: /* @__PURE__ */ new Date()
        };
        attendance.push(rec);
        return rec;
      }
      async updateAttendanceRecord(id, record) {
        const idx = attendance.findIndex((a) => a.id === id);
        if (idx === -1) return void 0;
        attendance[idx] = { ...attendance[idx], ...record };
        return attendance[idx];
      }
      async getAttendanceRecordsByUserId(userId) {
        return attendance.filter((a) => a.userId === userId).sort((a, b) => (b.checkInTime?.getTime?.() || 0) - (a.checkInTime?.getTime?.() || 0));
      }
      async getTodayAttendanceRecord(userId, date) {
        return attendance.filter((a) => a.userId === userId && a.date === date).sort((a, b) => (b.checkInTime?.getTime?.() || 0) - (a.checkInTime?.getTime?.() || 0))[0];
      }
      async getAllTodayAttendance(date) {
        const recs = attendance.filter((a) => a.date === date);
        return recs.map((r) => ({ ...r, user: users2.find((u) => u.id === r.userId) })).sort((a, b) => (b.checkInTime?.getTime?.() || 0) - (a.checkInTime?.getTime?.() || 0));
      }
      async createAudioRecording(recording) {
        const rec = {
          id: nanoid(),
          userId: recording.userId,
          attendanceId: recording.attendanceId || null,
          fileUrl: recording.fileUrl || null,
          fileName: recording.fileName || null,
          fileSize: parseNumOr(recording.fileSize, 0),
          duration: parseNumOr(recording.duration, 0),
          recordingDate: recording.recordingDate || todayStr(),
          isActive: !!recording.isActive,
          createdAt: /* @__PURE__ */ new Date()
        };
        audio.push(rec);
        return rec;
      }
      async updateAudioRecording(id, recording) {
        const idx = audio.findIndex((r) => r.id === id);
        if (idx === -1) return void 0;
        audio[idx] = { ...audio[idx], ...recording };
        return audio[idx];
      }
      async getAudioRecordingById(id) {
        return audio.find((r) => r.id === id);
      }
      async getActiveAudioRecordingByAttendance(attendanceId) {
        return audio.find((r) => r.attendanceId === attendanceId && r.isActive);
      }
      async getAudioRecordingByUserAndDate(userId, date) {
        return audio.filter((r) => r.userId === userId && r.recordingDate === date).sort((a, b) => (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0))[0];
      }
      async getTotalAudioStorage() {
        return audio.reduce((sum, r) => sum + (r.fileSize || 0), 0);
      }
      async getOldestAudioRecording() {
        return [...audio].sort((a, b) => (a.createdAt?.getTime?.() || 0) - (b.createdAt?.getTime?.() || 0))[0];
      }
      async enforceAudioStorageLimit(maxBytes) {
        let total = await this.getTotalAudioStorage();
        while (total > maxBytes) {
          const oldest = await this.getOldestAudioRecording();
          if (!oldest) break;
          await this.deleteAudioRecording(oldest.id);
          total -= oldest.fileSize || 0;
        }
      }
      async getAudioRecordingsByUserId(userId) {
        return audio.filter((r) => r.userId === userId).sort((a, b) => (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0));
      }
      async getAllAudioRecordings() {
        return audio.map((r) => ({ ...r, user: users2.find((u) => u.id === r.userId) }));
      }
      async getActiveAudioRecordings() {
        return audio.filter((r) => r.isActive).map((r) => ({ ...r, user: users2.find((u) => u.id === r.userId) }));
      }
      async deleteAudioRecording(id) {
        const idx = audio.findIndex((r) => r.id === id);
        if (idx !== -1) audio.splice(idx, 1);
      }
      async deleteOldAudioRecordings(daysOld) {
        const cutoff = /* @__PURE__ */ new Date();
        cutoff.setDate(cutoff.getDate() - daysOld);
        for (let i = audio.length - 1; i >= 0; i--) {
          const r = audio[i];
          if (r.createdAt < cutoff) audio.splice(i, 1);
        }
      }
      async getAllUsers() {
        return users2.filter((u) => u.role === "employee").sort((a, b) => a.username.localeCompare(b.username));
      }
      async updateUser(id, user) {
        const idx = users2.findIndex((u) => u.id === id);
        if (idx === -1) return void 0;
        users2[idx] = { ...users2[idx], ...user };
        return users2[idx];
      }
      async deleteUser(id) {
        for (let i = audio.length - 1; i >= 0; i--) {
          if (audio[i].userId === id) {
            audio.splice(i, 1);
          }
        }
        for (let i = attendance.length - 1; i >= 0; i--) {
          if (attendance[i].userId === id) {
            attendance.splice(i, 1);
          }
        }
        const idx = users2.findIndex((u) => u.id === id);
        if (idx !== -1) users2.splice(idx, 1);
      }
      async getMonthlyWorkHours(month) {
        const year = parseInt(month.split("-")[0]);
        const monthNum = parseInt(month.split("-")[1]);
        const daysInMonth = new Date(year, monthNum, 0).getDate();
        const allDaysInMonth = [];
        for (let day = 1; day <= daysInMonth; day++) {
          const dayStr = day.toString().padStart(2, "0");
          allDaysInMonth.push(`${month}-${dayStr}`);
        }
        const employees = users2.filter((u) => u.role === "employee").map((u) => {
          const dailyHours = allDaysInMonth.map((date) => {
            const rec = attendance.find((a) => a.userId === u.id && a.date === date);
            const hoursWorked = rec?.hoursWorked ? parseFloat(rec.hoursWorked) : 0;
            const status = rec ? rec.checkOutTime ? "complete" : "incomplete" : "absent";
            return {
              date,
              hoursWorked,
              checkInTime: rec?.checkInTime ? rec.checkInTime.toISOString?.() ?? null : null,
              checkOutTime: rec?.checkOutTime ? rec.checkOutTime.toISOString?.() ?? null : null,
              status
            };
          });
          const totalHours = dailyHours.reduce((s, d) => s + d.hoursWorked, 0);
          const totalDays = dailyHours.filter((d) => d.status !== "absent").length;
          return {
            userId: u.id,
            username: u.username,
            employeeId: u.employeeId || "",
            department: u.department || "",
            dailyHours,
            totalHours: Math.round(totalHours * 100) / 100,
            totalDays
          };
        });
        return { month, employees };
      }
    };
    storage2 = new MemoryStorage();
  }
});

// server/index.ts
import "dotenv/config";
import express2 from "express";

// server/routes.ts
import { WebSocketServer, WebSocket } from "ws";

// server/auth.ts
import passport from "passport";
import jwt from "jsonwebtoken";
import { Strategy as LocalStrategy } from "passport-local";
import session3 from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";

// server/storage.ts
var storage3;
var preferMemory = (process.env.USE_MEMORY_STORE || "").toLowerCase() === "true";
if (!preferMemory && process.env.DATABASE_URL) {
  try {
    const mod = await Promise.resolve().then(() => (init_storage_db(), storage_db_exports));
    storage3 = mod.storage;
  } catch (err) {
    console.warn("[storage] DB init failed, falling back to in-memory store:", err?.message || err);
    const mod = await Promise.resolve().then(() => (init_storage_memory(), storage_memory_exports));
    storage3 = mod.storage;
  }
} else {
  const mod = await Promise.resolve().then(() => (init_storage_memory(), storage_memory_exports));
  storage3 = mod.storage;
}

// server/device-lock.ts
import fs3 from "fs";
import path3 from "path";
var filePath = path3.resolve(import.meta.dirname, "device-lock.json");
function readMap() {
  try {
    if (!fs3.existsSync(filePath)) return {};
    const raw = fs3.readFileSync(filePath, "utf8");
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}
function writeMap(map) {
  try {
    fs3.writeFileSync(filePath, JSON.stringify(map, null, 2), "utf8");
  } catch {
  }
}
function getBoundDeviceId(userId) {
  const map = readMap();
  return map[userId];
}
function bindDeviceId(userId, deviceId) {
  const map = readMap();
  if (map[userId] && map[userId] !== deviceId) return;
  map[userId] = deviceId;
  writeMap(map);
}
function unbindDeviceId(userId) {
  const map = readMap();
  if (map[userId]) {
    delete map[userId];
    writeMap(map);
  }
}

// server/location.ts
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const dphi = (lat2 - lat1) * Math.PI / 180;
  const dlambda = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dphi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlambda / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
var SHOP_LOCATION = {
  latitude: 29.394154,
  longitude: 76.969757
};
var MAX_DISTANCE = 100;

// server/auth.ts
var scryptAsync = promisify(scrypt);
async function createTestEmployee() {
  try {
    const existingUser = await storage3.getUserByUsername("test");
    if (!existingUser) {
      const hashedPassword = await hashPassword("test");
      await storage3.createUser({
        username: "test",
        password: hashedPassword,
        role: "employee",
        employeeId: "EMP001",
        department: "Testing"
      });
      console.log("\xE2\u0153\u2026 Test employee created: username=test, password=test");
    }
  } catch (error) {
    console.log("\xE2\u201E\xB9\xEF\xB8\x8F Test employee creation skipped (database not ready)");
  }
}
async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const buf = await scryptAsync(password, salt, 64);
  return `${buf.toString("hex")}.${salt}`;
}
async function comparePasswords(supplied, stored) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = await scryptAsync(supplied, salt, 64);
  return timingSafeEqual(hashedBuf, suppliedBuf);
}
function setupAuth(app2) {
  createTestEmployee();
  (async () => {
    try {
      const adminUser = (process.env.ADMIN_USERNAME || "").trim();
      const adminPass = (process.env.ADMIN_PASSWORD || "").trim();
      if (adminUser && adminPass) {
        const existing = await storage3.getUserByUsername(adminUser);
        if (!existing) {
          const hashed = await hashPassword(adminPass);
          await storage3.createUser({
            username: adminUser,
            password: hashed,
            role: "admin",
            department: "Administration"
          });
          console.log(`[auth] Bootstrap admin created: ${adminUser}`);
        }
      }
    } catch (e) {
      console.log("[auth] Bootstrap admin skipped:", e?.message || e);
    }
  })();
  const corsEnabled = !!process.env.CORS_ORIGIN;
  const cookieSameSite = process.env.COOKIE_SAMESITE || (corsEnabled ? "none" : "lax");
  const cookieSecure = process.env.COOKIE_SECURE === "true" || cookieSameSite === "none" || process.env.NODE_ENV === "production";
  const sessionDays = parseInt(process.env.SESSION_MAX_AGE_DAYS || "30", 10);
  const sessionMaxAgeMs = Math.max(1, sessionDays) * 24 * 60 * 60 * 1e3;
  const sessionSettings = {
    secret: process.env.SESSION_SECRET || "bedi-enterprises-secret-key-2025",
    resave: false,
    saveUninitialized: false,
    store: storage3.sessionStore,
    cookie: {
      secure: cookieSecure,
      sameSite: cookieSameSite,
      httpOnly: true,
      maxAge: sessionMaxAgeMs
    }
  };
  const sessionMiddleware = session3(sessionSettings);
  app2.set("trust proxy", 1);
  app2.use(sessionMiddleware);
  app2.use(passport.initialize());
  app2.use(passport.session());
  app2.use((req, res, next) => {
    try {
      if (typeof req.isAuthenticated === "function" && req.isAuthenticated()) {
        return next();
      }
      const auth = req.headers.authorization || "";
      if (!auth.startsWith("Bearer ")) return next();
      const token = auth.slice(7);
      const secret = process.env.JWT_SECRET || "upload-secret-2025";
      const payload = jwt.verify(token, secret);
      if (!payload?.sub) return next();
      const deviceLock = (process.env.DEVICE_LOCK || "false").toLowerCase() !== "false";
      const boundDid = deviceLock ? getBoundDeviceId(payload.sub) : void 0;
      const tokenDid = payload.did;
      if (deviceLock && boundDid && tokenDid && boundDid !== tokenDid) {
        return next();
      }
      storage3.getUser(payload.sub).then((user) => {
        if (user) {
          req.user = user;
          req.isAuthenticated = () => true;
        }
      }).finally(() => next());
    } catch {
      return next();
    }
  });
  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage3.getUserByUsername(username);
        if (!user || !await comparePasswords(password, user.password)) {
          return done(null, false, { message: "Invalid username or password" });
        }
        return done(null, user);
      } catch (error) {
        return done(error);
      }
    })
  );
  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id, done) => {
    try {
      if (id === "admin-user") {
        const adminUser = {
          id: "admin-user",
          username: "bediAdmin",
          password: "",
          role: "admin",
          employeeId: null,
          department: null,
          joinDate: null,
          isActive: true,
          isLoggedIn: false,
          defaultStartTime: null,
          defaultEndTime: null,
          createdAt: null
        };
        return done(null, adminUser);
      }
      const user = await storage3.getUser(id);
      if (!user) {
        return done(null, false);
      }
      done(null, user);
    } catch (error) {
      console.error("Deserialize user error:", error);
      done(null, false);
    }
  });
  app2.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err, user, info) => {
      try {
        const raw2 = req.body || {};
        const uname2 = String(raw2.username || "").trim();
        const pword2 = String(raw2.password || "");
        const allowFlag = (process.env.ALLOW_HARDCODED_ADMIN || "").toLowerCase();
        const allowHardcoded = allowFlag === "" ? true : allowFlag === "true";
        const hardUser = (process.env.HARDCODED_ADMIN_USERNAME || "bediAdmin").trim();
        const hardPass = process.env.HARDCODED_ADMIN_PASSWORD || "BediMain2025";
        const envAdminUser = (process.env.ADMIN_USERNAME || "").trim();
        const envAdminPass = (process.env.ADMIN_PASSWORD || "").trim();
        const candidates = [
          allowHardcoded ? { u: hardUser, p: hardPass } : null,
          envAdminUser && envAdminPass ? { u: envAdminUser, p: envAdminPass } : null
        ].filter(Boolean);
        const fixed2 = candidates.find((c) => uname2.toLowerCase() === c.u.toLowerCase() && pword2 === c.p);
        if (fixed2) {
          const adminUser2 = {
            id: "admin-user",
            username: fixed2.u,
            password: "",
            role: "admin",
            employeeId: null,
            department: null,
            joinDate: null,
            isActive: true,
            isLoggedIn: false,
            defaultStartTime: null,
            defaultEndTime: null,
            createdAt: null
          };
          return req.login(adminUser2, (err2) => {
            if (err2) return next(err2);
            return res.status(200).json(adminUser2);
          });
        }
      } catch {
      }
      if (err) return next(err);
      if (!user) {
        return res.status(401).json({ message: info?.message || "Invalid credentials" });
      }
      const enforceLocation = (process.env.ENFORCE_LOCATION_CHECK || "true").toLowerCase() !== "false";
      if (user.role === "employee" && enforceLocation) {
        const { location } = req.body;
        if (!location) {
          return res.status(401).json({ message: "Location data is missing" });
        }
        const distance = calculateDistance(
          location.latitude,
          location.longitude,
          SHOP_LOCATION.latitude,
          SHOP_LOCATION.longitude
        );
        if (distance > MAX_DISTANCE) {
          return res.status(401).json({ message: `You are too far from the shop. Distance: ${distance.toFixed(0)}m` });
        }
      }
      req.login(user, (err2) => {
        if (err2) return next(err2);
        const deviceLock = (process.env.DEVICE_LOCK || "false").toLowerCase() !== "false";
        const deviceId = req.headers["x-device-id"] || req.body?.deviceId || void 0;
        try {
          if (deviceLock && deviceId) {
            const bound = getBoundDeviceId(user.id);
            if (bound && bound !== deviceId) {
              return res.status(403).json({ message: "Account already linked to a different device" });
            }
            if (!bound) {
              bindDeviceId(user.id, deviceId);
            }
          }
        } catch {
        }
        let token = void 0;
        try {
          const secret = process.env.JWT_SECRET || "upload-secret-2025";
          const expiresIn = process.env.JWT_EXPIRES_IN || "180d";
          const payload = { sub: user.id, role: user.role };
          if (deviceId) payload.did = deviceId;
          token = jwt.sign(payload, secret, { expiresIn });
        } catch {
        }
        res.status(200).json({ ...user, token });
      });
    })(req, res, next);
  });
  app2.post("/api/logout", (req, res, next) => {
    const userId = req.user?.id;
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });
  app2.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    res.json(req.user);
  });
  app2.post("/api/auth/upload-token", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const secret = process.env.JWT_SECRET || "upload-secret-2025";
    const expiresIn = process.env.JWT_EXPIRES_IN || "180d";
    const deviceLock = (process.env.DEVICE_LOCK || "false").toLowerCase() !== "false";
    const deviceId = req.headers["x-device-id"] || void 0;
    if (deviceLock) {
      const bound = getBoundDeviceId(req.user.id);
      if (bound && deviceId && bound !== deviceId) {
        return res.status(403).json({ message: "Account linked to a different device" });
      }
      if (!bound && deviceId) bindDeviceId(req.user.id, deviceId);
    }
    const payload = { sub: req.user.id, role: req.user.role };
    if (deviceId) payload.did = deviceId;
    const token = jwt.sign(payload, secret, { expiresIn });
    res.json({ token });
  });
  app2.post("/api/admin/login", async (req, res, next) => {
    const raw = req.body || {};
    const uname = String(raw.username || "").trim();
    const pword = String(raw.password || "");
    const audioPassword = raw.audioPassword;
    try {
      const allowFlag = (process.env.ALLOW_HARDCODED_ADMIN || "").toLowerCase();
      const allowHardcoded = allowFlag === "" ? true : allowFlag === "true";
      if (allowHardcoded) {
        const hardUser = (process.env.HARDCODED_ADMIN_USERNAME || "bediAdmin").trim();
        const hardPass = process.env.HARDCODED_ADMIN_PASSWORD || "BediMain2025";
        if (uname.toLowerCase() === hardUser.toLowerCase() && pword === hardPass) {
          const adminUser = {
            id: "admin-user",
            username: hardUser,
            password: "",
            role: "admin",
            employeeId: null,
            department: null,
            joinDate: null,
            isActive: true,
            isLoggedIn: false,
            defaultStartTime: null,
            defaultEndTime: null,
            createdAt: null
          };
          return req.login(adminUser, (err) => {
            if (err) return next(err);
            const expected = process.env.AUDIO_ACCESS_PASSWORD || "audioAccess2025";
            if (audioPassword && audioPassword === expected) {
              req.session.audioAccess = true;
              req.session.audioAccessTime = Date.now();
            }
            return res.status(200).json(adminUser);
          });
        }
      }
      const envAdminUser = (process.env.ADMIN_USERNAME || "").trim();
      const envAdminPass = (process.env.ADMIN_PASSWORD || "").trim();
      if (envAdminUser && envAdminPass) {
        if (uname.toLowerCase() === envAdminUser.toLowerCase() && pword === envAdminPass) {
          const adminUser = {
            id: "admin-user",
            username: envAdminUser,
            password: "",
            role: "admin",
            employeeId: null,
            department: null,
            joinDate: null,
            isActive: true,
            isLoggedIn: false,
            defaultStartTime: null,
            defaultEndTime: null,
            createdAt: null
          };
          return req.login(adminUser, (err) => {
            if (err) return next(err);
            const expected = process.env.AUDIO_ACCESS_PASSWORD || "audioAccess2025";
            if (audioPassword && audioPassword === expected) {
              req.session.audioAccess = true;
              req.session.audioAccessTime = Date.now();
            }
            return res.status(200).json(adminUser);
          });
        }
      }
      const user = await storage3.getUserByUsername(uname);
      if (!user) return res.status(401).json({ message: "Invalid admin credentials" });
      if (user.role !== "admin") return res.status(403).json({ message: "Admin access required" });
      const ok = await comparePasswords(pword, user.password);
      if (!ok) return res.status(401).json({ message: "Invalid admin credentials" });
      req.login(user, (err) => {
        if (err) return next(err);
        if (audioPassword && (process.env.AUDIO_ACCESS_PASSWORD || "audioAccess2025") === audioPassword) {
          req.session.audioAccess = true;
          req.session.audioAccessTime = Date.now();
        }
        res.status(200).json(user);
      });
    } catch (error) {
      next(error);
    }
  });
  app2.post("/api/admin/audio-access", (req, res) => {
    req.session.audioAccess = true;
    req.session.audioAccessTime = Date.now();
    res.status(200).json({ success: true });
  });
  app2.use("/api/admin/audio", (req, res, next) => {
    next();
  });
  app2.post("/api/admin/reset-device/:userId", (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }
    const { userId } = req.params;
    try {
      unbindDeviceId(userId);
      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ message: e.message || "Failed to reset device" });
    }
  });
  return sessionMiddleware;
}

// server/routes.ts
init_audio_paths();
import multer from "multer";
import path4 from "path";
import fs4 from "fs";
import { fileURLToPath as fileURLToPath2 } from "url";
import jwt2 from "jsonwebtoken";
import { dirname } from "path";
import { spawn } from "child_process";
var __filename2 = fileURLToPath2(import.meta.url);
var __dirname2 = dirname(__filename2);
function resolveRequestAudioDir(req) {
  if (req.audioDirKey) {
    const dir2 = path4.join(getAudioBaseDir(), req.audioDirKey);
    return { key: req.audioDirKey, dir: dir2 };
  }
  const { key, dir } = ensureUserAudioDir(req.user);
  req.audioDirKey = key;
  return { key, dir };
}
var audioStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const { key, dir } = resolveRequestAudioDir(req);
    req.audioDirKey = key;
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const date = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    const timestamp2 = Date.now();
    const mime = (file.mimetype || "").toLowerCase();
    const originalExt = path4.extname(file.originalname || "").toLowerCase();
    let ext = ".webm";
    if (mime.includes("audio/mp4")) ext = ".mp4";
    else if (mime.includes("audio/m4a")) ext = ".m4a";
    else if (mime.includes("audio/ogg")) ext = ".ogg";
    else if (originalExt) ext = originalExt;
    cb(null, `${date}-${timestamp2}${ext}`);
  }
});
var upload = multer({
  storage: audioStorage,
  // Raise limit to support long Android background recordings (lower bitrate used on-device)
  limits: { fileSize: 200 * 1024 * 1024 }
  // 200MB limit
});
function registerRoutes(app2, httpServer) {
  app2.get("/api/health", async (req, res) => {
    if (process.env.DATABASE_URL) {
      try {
        const { pool: pool2 } = await Promise.resolve().then(() => (init_db(), db_exports));
        await pool2.query("select 1");
        const auth2 = req.isAuthenticated();
        res.json({ ok: true, db: true, authenticated: auth2, user: auth2 ? req.user : null });
      } catch (e) {
        res.status(500).json({ ok: false, db: false, error: e?.message || String(e) });
      }
      return;
    }
    const auth = req.isAuthenticated();
    res.json({ ok: true, db: false, authenticated: auth, user: auth ? req.user : null });
  });
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  wss.on("connection", (ws, req) => {
    console.log("WebSocket client connected");
    ws.on("message", (message) => {
      try {
        const data = JSON.parse(message.toString());
        wss.clients.forEach((client) => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
          }
        });
      } catch (error) {
        console.error("WebSocket message error:", error);
      }
    });
    ws.on("close", () => {
      console.log("WebSocket client disconnected");
    });
  });
  app2.post("/api/attendance/checkin", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Login required" });
    }
    try {
      const { latitude, longitude } = req.body;
      const userId = req.user.id;
      const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      const existingRecord = await storage3.getTodayAttendanceRecord(userId, today);
      if (existingRecord) {
        return res.status(400).json({ message: "Attendance already recorded for today" });
      }
      console.log(`\u2705 Check-in allowed from anywhere - Location: ${latitude}, ${longitude}`);
      const checkInTime = /* @__PURE__ */ new Date();
      const user = await storage3.getUser(userId);
      const expectedStart = user?.defaultStartTime && typeof user.defaultStartTime === "string" ? user.defaultStartTime : "09:15";
      const [sh, sm] = expectedStart.split(":").map((v) => parseInt(v, 10));
      const isLate = checkInTime.getHours() > (sh || 9) || checkInTime.getHours() === (sh || 9) && checkInTime.getMinutes() > (sm || 15);
      const attendanceRecord = await storage3.createAttendanceRecord({
        userId,
        checkInTime,
        date: today,
        isLate,
        isEarlyLeave: false
      });
      const existingAudio = await storage3.getAudioRecordingByUserAndDate(userId, today);
      const audioRecording = existingAudio ? await storage3.updateAudioRecording(existingAudio.id, { isActive: true }) : await storage3.createAudioRecording({
        userId,
        attendanceId: attendanceRecord.id,
        recordingDate: today,
        isActive: true
      });
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: "audio_start", recording: audioRecording }));
        }
      });
      console.log(`\u2705 Check-in completed - audio recording will start`);
      res.status(201).json(attendanceRecord);
    } catch (error) {
      console.error("Check-in error:", error);
      res.status(500).json({ message: "Failed to check in" });
    }
  });
  app2.post("/api/attendance/checkout", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Login required" });
    }
    try {
      const userId = req.user.id;
      const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      const existingRecord = await storage3.getTodayAttendanceRecord(userId, today);
      if (!existingRecord || existingRecord.checkOutTime) {
        return res.status(400).json({ message: "No active check-in found" });
      }
      const checkOutTime = /* @__PURE__ */ new Date();
      const user = await storage3.getUser(userId);
      const expectedEnd = user?.defaultEndTime && typeof user.defaultEndTime === "string" ? user.defaultEndTime : "21:00";
      const [eh, em] = expectedEnd.split(":").map((v) => parseInt(v, 10));
      const isEarlyLeave = checkOutTime.getHours() < (eh || 21) || checkOutTime.getHours() === (eh || 21) && checkOutTime.getMinutes() < (em || 0);
      const hoursWorked = (checkOutTime.getTime() - existingRecord.checkInTime.getTime()) / (1e3 * 60 * 60);
      const updatedRecord = await storage3.updateAttendanceRecord(existingRecord.id, {
        checkOutTime,
        hoursWorked: hoursWorked.toFixed(2),
        isEarlyLeave
      });
      try {
        const active = await storage3.getActiveAudioRecordingByAttendance(existingRecord.id);
        if (active) {
          const recordedDuration = Number(active.duration) || 0;
          const sessionDuration = Math.floor((checkOutTime.getTime() - existingRecord.checkInTime.getTime()) / 1e3);
          const durationSec = recordedDuration > 0 ? recordedDuration : sessionDuration;
          const today2 = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
          await storage3.updateAudioRecording(active.id, {
            isActive: false,
            duration: durationSec,
            recordingDate: today2
          });
          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: "audio_stop", recordingId: active.id }));
            }
          });
        }
      } catch (err) {
        console.warn("Failed to finalize active audio session on checkout:", err);
      }
      console.log(`\u2705 Check-out completed - audio will be uploaded automatically`);
      res.json(updatedRecord);
    } catch (error) {
      console.error("Check-out error:", error);
      res.status(500).json({ message: "Failed to check out" });
    }
  });
  app2.get("/api/attendance/history", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "employee") {
      return res.status(401).json({ message: "Employee access required" });
    }
    try {
      const records = await storage3.getAttendanceRecordsByUserId(req.user.id);
      res.json(records);
    } catch (error) {
      console.error("Attendance history error:", error);
      res.status(500).json({ message: "Failed to fetch attendance history" });
    }
  });
  app2.get("/api/attendance/today", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "employee") {
      return res.status(401).json({ message: "Employee access required" });
    }
    try {
      const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      const record = await storage3.getTodayAttendanceRecord(req.user.id, today);
      res.json(record);
    } catch (error) {
      console.error("Today attendance error:", error);
      res.status(500).json({ message: "Failed to fetch today's attendance" });
    }
  });
  app2.get("/api/admin/attendance/today", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      const records = await storage3.getAllTodayAttendance(today);
      res.json(records);
    } catch (error) {
      console.error("Admin attendance error:", error);
      res.status(500).json({ message: "Failed to fetch attendance data" });
    }
  });
  app2.post("/api/admin/attendance/checkin", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      const { userId } = req.body;
      const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      const existingRecord = await storage3.getTodayAttendanceRecord(userId, today);
      if (existingRecord) {
        return res.status(400).json({ message: "Attendance already recorded for today" });
      }
      const checkInTime = /* @__PURE__ */ new Date();
      const isLate = checkInTime.getHours() > 9 || checkInTime.getHours() === 9 && checkInTime.getMinutes() > 15;
      const attendanceRecord = await storage3.createAttendanceRecord({
        userId,
        checkInTime,
        date: today,
        isLate,
        isEarlyLeave: false
      });
      res.status(201).json(attendanceRecord);
    } catch (error) {
      console.error("Admin manual check-in error:", error);
      res.status(500).json({ message: "Failed to check in employee" });
    }
  });
  app2.put("/api/admin/attendance/:id", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      const { isLate } = req.body;
      const updated = await storage3.updateAttendanceRecord(req.params.id, { isLate });
      if (!updated) {
        return res.status(404).json({ message: "Attendance record not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("Update attendance error:", error);
      res.status(500).json({ message: "Failed to update attendance" });
    }
  });
  app2.get("/api/admin/employees", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      const users3 = await storage3.getAllUsers();
      res.json(users3);
    } catch (error) {
      console.error("Admin employees error:", error);
      res.status(500).json({ message: "Failed to fetch employees" });
    }
  });
  app2.post("/api/admin/users/promote", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      const { id, username, role } = req.body;
      const targetRole = role === "employee" ? "employee" : "admin";
      if (!id && !username) {
        return res.status(400).json({ message: "Provide user id or username" });
      }
      const user = id ? await storage3.getUser(id) : await storage3.getUserByUsername(String(username));
      if (!user) return res.status(404).json({ message: "User not found" });
      const updated = await storage3.updateUser(user.id, { role: targetRole });
      return res.json(updated);
    } catch (error) {
      console.error("Promote user error:", error);
      return res.status(500).json({ message: "Failed to update user role" });
    }
  });
  app2.post("/api/admin/employees", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      const { username, password, employeeId, department, defaultStartTime, defaultEndTime } = req.body;
      const existingUser = await storage3.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }
      const hashedPassword = await hashPassword(password);
      const user = await storage3.createUser({
        username,
        password: hashedPassword,
        role: "employee",
        employeeId,
        department,
        defaultStartTime,
        defaultEndTime
      });
      res.status(201).json(user);
    } catch (error) {
      console.error("Create employee error:", error);
      res.status(500).json({ message: "Failed to create employee" });
    }
  });
  app2.put("/api/admin/employees/:id", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      const { username, employeeId, department, password, defaultStartTime, defaultEndTime } = req.body;
      const updateData = { username, employeeId, department, defaultStartTime, defaultEndTime };
      if (password) {
        updateData.password = await hashPassword(password);
      }
      const user = await storage3.updateUser(req.params.id, updateData);
      res.json(user);
    } catch (error) {
      console.error("Update employee error:", error);
      res.status(500).json({ message: "Failed to update employee" });
    }
  });
  app2.delete("/api/admin/employees/:id", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      await storage3.deleteUser(req.params.id);
      res.sendStatus(200);
    } catch (error) {
      console.error("Delete employee error:", error);
      res.status(500).json({ message: "Failed to delete employee" });
    }
  });
  app2.get("/api/admin/work-hours", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      const { month } = req.query;
      if (!month || typeof month !== "string") {
        return res.status(400).json({ message: "Month parameter is required in YYYY-MM format" });
      }
      const monthRegex = /^\d{4}-\d{2}$/;
      if (!monthRegex.test(month)) {
        return res.status(400).json({ message: "Invalid month format. Use YYYY-MM format" });
      }
      const [year, monthNum] = month.split("-").map(Number);
      if (year < 2e3 || year > 2100 || monthNum < 1 || monthNum > 12) {
        return res.status(400).json({ message: "Invalid month. Year must be between 2000-2100 and month between 01-12" });
      }
      const workHoursData = await storage3.getMonthlyWorkHours(month);
      res.json(workHoursData);
    } catch (error) {
      console.error("Monthly work hours error:", error);
      res.status(500).json({ message: "Failed to fetch monthly work hours data" });
    }
  });
  app2.post(
    "/api/audio/upload",
    async (req, res, next) => {
      if (req.isAuthenticated() && req.user?.role === "employee") return next();
      try {
        const auth = req.headers.authorization || "";
        if (auth.startsWith("Bearer ")) {
          const token = auth.slice(7);
          const secret = process.env.JWT_SECRET || "upload-secret-2025";
          const payload = jwt2.verify(token, secret);
          if (payload?.sub) {
            const user = await storage3.getUser(payload.sub);
            if (user && user.role === "employee") {
              req.user = user;
              return next();
            }
          }
        }
      } catch {
      }
      return res.status(401).json({ message: "Employee access required" });
    },
    upload.single("audio"),
    async (req, res) => {
      if (!req.isAuthenticated() || req.user?.role !== "employee") {
        return res.status(401).json({ message: "Employee access required" });
      }
      const cleanupPaths = /* @__PURE__ */ new Set();
      try {
        const file = req.file;
        if (!file) {
          return res.status(400).json({ message: "No audio file provided" });
        }
        const request = req;
        const userId = req.user.id;
        const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
        console.log(`[audio] upload: ${file.filename} (${file.size} bytes)`);
        const attendanceRecord = await storage3.getTodayAttendanceRecord(userId, today);
        if (!attendanceRecord) {
          return res.status(400).json({ message: "No attendance record found" });
        }
        const { key: dirKey, dir: userDir } = resolveRequestAudioDir(request);
        const rawPath = file.path ? path4.resolve(file.path) : path4.join(userDir, file.filename);
        cleanupPaths.add(rawPath);
        const masterName = `daily-${today}.m4a`;
        const masterPath = path4.join(userDir, masterName);
        const resolvedFfmpeg = async () => {
          if (process.env.FFMPEG_BIN && process.env.FFMPEG_BIN.trim()) return process.env.FFMPEG_BIN;
          try {
            const mod = await import("ffmpeg-static");
            if (mod?.default) return mod.default;
          } catch {
          }
          return "ffmpeg";
        };
        const runFfmpeg = async (args) => new Promise(async (resolve, reject) => {
          const bin = await resolvedFfmpeg();
          const p = spawn(bin, ["-y", ...args], { stdio: ["ignore", "pipe", "pipe"] });
          let stderr = "";
          p.stderr.on("data", (d) => {
            stderr += d.toString();
          });
          p.on("close", (code) => {
            if (code === 0) resolve();
            else reject(new Error(stderr || `ffmpeg exited ${code}`));
          });
        });
        let segmentInputPath = rawPath;
        const segmentExt = path4.extname(rawPath).toLowerCase();
        const mime = file.mimetype || "";
        if (mime.includes("webm") || segmentExt === ".webm") {
          const normalizedPath = path4.join(userDir, `segment-${Date.now()}.m4a`);
          cleanupPaths.add(normalizedPath);
          try {
            await runFfmpeg(["-f", "webm", "-i", segmentInputPath, "-c:a", "aac", "-b:a", "64k", "-ar", "48000", "-movflags", "+faststart", normalizedPath]);
            segmentInputPath = normalizedPath;
          } catch (remuxErr) {
            console.warn("webm remux failed; using raw segment:", remuxErr);
            cleanupPaths.delete(normalizedPath);
          }
        }
        try {
          const tempOutput = path4.join(userDir, `daily-${today}-${Date.now()}.m4a`);
          cleanupPaths.add(tempOutput);
          await runFfmpeg(["-i", segmentInputPath, "-acodec", "aac", "-b:a", "64k", "-ar", "48000", "-movflags", "+faststart", tempOutput]);
          const masterExists = fs4.existsSync(masterPath);
          if (masterExists) {
            const mergedPath = path4.join(userDir, `daily-${today}-merged-${Date.now()}.m4a`);
            const listPath = path4.join(userDir, `concat-${Date.now()}.txt`);
            const esc = (p) => p.replace(/\\/g, "/").replace(/'/g, "'\\''");
            const listContent = `file '${esc(masterPath)}'
file '${esc(tempOutput)}'
`;
            await fs4.promises.writeFile(listPath, listContent, "utf8");
            try {
              await runFfmpeg(["-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", mergedPath]);
              await fs4.promises.rm(masterPath, { force: true });
              await fs4.promises.rename(mergedPath, masterPath);
              cleanupPaths.delete(mergedPath);
            } finally {
              try {
                await fs4.promises.rm(listPath, { force: true });
              } catch {
              }
            }
          } else {
            await fs4.promises.rename(tempOutput, masterPath);
          }
          cleanupPaths.delete(tempOutput);
        } catch (ffmpegErr) {
          console.warn("[audio] ffmpeg failed, keeping raw segment:", ffmpegErr);
          const finalDirKey2 = dirKey || getUserAudioDirKey(req.user);
          const finalFileUrl2 = `/uploads/audio/${finalDirKey2}/${path4.basename(segmentInputPath)}`;
          const stat2 = fs4.statSync(segmentInputPath);
          const rawDuration2 = Number(req.body?.duration);
          const approxDuration2 = Number.isFinite(rawDuration2) && rawDuration2 > 0 ? Math.round(rawDuration2) : Math.max(1, Math.round(stat2.size / 8192));
          const recordPayload2 = {
            attendanceId: attendanceRecord.id,
            fileUrl: finalFileUrl2,
            fileName: path4.basename(segmentInputPath),
            fileSize: stat2.size,
            duration: approxDuration2,
            recordingDate: today
          };
          const existing2 = await storage3.getAudioRecordingByUserAndDate(userId, today);
          let savedRecording2;
          if (existing2) {
            const updatedPayload = { ...recordPayload2, duration: Math.max(1, (existing2.duration || 0) + approxDuration2) };
            savedRecording2 = await storage3.updateAudioRecording(existing2.id, updatedPayload);
          } else {
            savedRecording2 = await storage3.createAudioRecording({
              userId,
              ...recordPayload2,
              isActive: true,
              duration: approxDuration2
            });
          }
          await storage3.enforceAudioStorageLimit(30 * 1024 * 1024 * 1024);
          await storage3.deleteOldAudioRecordings(15);
          cleanupPaths.clear();
          return res.json({ message: "Audio uploaded (raw fallback)", recording: savedRecording2 });
        }
        if (segmentInputPath !== masterPath) {
          try {
            await fs4.promises.unlink(segmentInputPath);
          } catch {
          }
          cleanupPaths.delete(segmentInputPath);
        }
        if (rawPath !== masterPath) {
          try {
            await fs4.promises.unlink(rawPath);
          } catch {
          }
          cleanupPaths.delete(rawPath);
        }
        const stat = fs4.statSync(masterPath);
        const finalFileSize = stat.size;
        const rawDuration = Number(req.body?.duration);
        const approxDuration = Number.isFinite(rawDuration) && rawDuration > 0 ? Math.round(rawDuration) : Math.max(1, Math.round(finalFileSize / 8192));
        const finalDirKey = dirKey || getUserAudioDirKey(req.user);
        const finalFileUrl = `/uploads/audio/${finalDirKey}/${masterName}`;
        const recordPayload = {
          attendanceId: attendanceRecord.id,
          fileUrl: finalFileUrl,
          fileName: masterName,
          fileSize: finalFileSize,
          duration: approxDuration,
          recordingDate: today
        };
        const existing = await storage3.getAudioRecordingByUserAndDate(userId, today);
        let savedRecording;
        if (existing) {
          const previousPath = resolveFilePathFromUrl(existing.fileUrl);
          if (previousPath && previousPath !== masterPath) {
            try {
              await fs4.promises.rm(previousPath, { force: true });
            } catch {
            }
          }
          const updatedPayload = { ...recordPayload, duration: Math.max(1, (existing.duration || 0) + approxDuration) };
          savedRecording = await storage3.updateAudioRecording(existing.id, updatedPayload);
        } else {
          savedRecording = await storage3.createAudioRecording({
            userId,
            ...recordPayload,
            isActive: true,
            duration: approxDuration
          });
        }
        await storage3.enforceAudioStorageLimit(30 * 1024 * 1024 * 1024);
        await storage3.deleteOldAudioRecordings(15);
        console.log(`[audio] ready: ${masterName} (${finalFileSize} bytes) :: ${savedRecording?.id || ""}`);
        cleanupPaths.clear();
        res.json({ message: "Audio uploaded successfully", recording: savedRecording });
      } catch (error) {
        for (const candidate of cleanupPaths) {
          try {
            await fs4.promises.unlink(candidate);
          } catch {
          }
        }
        console.error("Audio upload error:", error);
        res.status(500).json({ message: "Failed to upload audio" });
      }
    }
  );
  app2.get("/uploads/audio/:userId/:filename", (req, res) => {
    const { userId, filename } = req.params;
    const baseDir = getAudioBaseDir();
    let filePath2 = path4.join(baseDir, userId, filename);
    if (!fs4.existsSync(filePath2)) {
      const legacyBase = path4.join(__dirname2, "uploads", "audio");
      const legacyPath = path4.join(legacyBase, userId, filename);
      if (legacyBase !== baseDir && fs4.existsSync(legacyPath)) {
        filePath2 = legacyPath;
      } else {
        return res.status(404).json({ message: "Audio file not found" });
      }
    }
    const stat = fs4.statSync(filePath2);
    const fileSize = stat.size;
    const range = req.headers.range;
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Accept-Ranges", "bytes");
    const ext = path4.extname(filePath2).toLowerCase();
    const contentType = ext === ".webm" ? "audio/webm" : ext === ".m4a" || ext === ".mp4" ? "audio/mp4" : ext === ".ogg" ? "audio/ogg" : "audio/*";
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      if (isNaN(start) || isNaN(end) || start > end || end >= fileSize) {
        return res.status(416).set({ "Content-Range": `bytes */${fileSize}` }).end();
      }
      const chunkSize = end - start + 1;
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": contentType
      });
      const stream = fs4.createReadStream(filePath2, { start, end });
      stream.pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Length": fileSize,
        "Content-Type": contentType
      });
      fs4.createReadStream(filePath2).pipe(res);
    }
  });
  app2.post("/api/admin/employees/quick", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      const { name, username, time, password } = req.body;
      const uname = (username || name || "").trim();
      if (!uname) return res.status(400).json({ message: "Provide name or username" });
      const toHHMM = (h, m) => {
        const hh = String(Math.max(0, Math.min(23, h))).padStart(2, "0");
        const mm = String(Math.max(0, Math.min(59, m))).padStart(2, "0");
        return `${hh}:${mm}`;
      };
      const parseTimeToken = (tok, fallbackAm) => {
        tok = tok.trim().toLowerCase();
        let ampm = void 0;
        if (tok.endsWith("am")) {
          ampm = "am";
          tok = tok.slice(0, -2);
        } else if (tok.endsWith("pm")) {
          ampm = "pm";
          tok = tok.slice(0, -2);
        }
        tok = tok.replace(/[^0-9:]/g, "");
        if (!tok) return null;
        let h = 0, m = 0;
        if (tok.includes(":")) {
          const [hs, ms] = tok.split(":");
          h = parseInt(hs || "0", 10);
          m = parseInt(ms || "0", 10) || 0;
        } else {
          h = parseInt(tok, 10);
          m = 0;
        }
        if (isNaN(h) || isNaN(m)) return null;
        if (ampm === "am") {
          if (h === 12) h = 0;
        } else if (ampm === "pm") {
          if (h < 12) h += 12;
        } else if (fallbackAm === true) {
          if (h === 12) h = 0;
        }
        return { h, m };
      };
      const parseTimeRange = (range) => {
        if (!range) return {};
        const sep = range.includes(" to ") ? " to " : range.includes("-") ? "-" : range.includes("\u2013") ? "\u2013" : " to ";
        const parts = range.split(sep);
        const left = (parts[0] || "").trim();
        const right = (parts[1] || "").trim();
        const endHasPm = /pm\b/i.test(right);
        const t1 = parseTimeToken(left, endHasPm ? true : void 0);
        const t2 = parseTimeToken(right);
        const out = {};
        if (t1) out.start = toHHMM(t1.h, t1.m);
        if (t2) out.end = toHHMM(t2.h, t2.m);
        return out;
      };
      const { start, end } = parseTimeRange(time);
      const pwd = password && String(password) || "123456";
      const existing = await storage3.getUserByUsername(uname);
      if (existing) return res.status(409).json({ message: "Username already exists" });
      const hashed = await hashPassword(pwd);
      const user = await storage3.createUser({
        username: uname,
        password: hashed,
        role: "employee",
        defaultStartTime: start,
        defaultEndTime: end
      });
      return res.status(201).json(user);
    } catch (error) {
      console.error("Quick create employee error:", error);
      return res.status(500).json({ message: "Failed to create employee" });
    }
  });
  app2.patch("/api/admin/employees/schedule", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      const { defaultStartTime, defaultEndTime, applyTo } = req.body;
      if (!defaultStartTime && !defaultEndTime) {
        return res.status(400).json({ message: "Provide defaultStartTime and/or defaultEndTime" });
      }
      const users3 = await storage3.getAllUsers();
      const updates = users3.map(async (u) => {
        const shouldUpdate = applyTo === "all" || applyTo === void 0 || !u.defaultStartTime && !u.defaultEndTime;
        if (!shouldUpdate) return null;
        const patch = {};
        if (defaultStartTime) patch.defaultStartTime = defaultStartTime;
        if (defaultEndTime) patch.defaultEndTime = defaultEndTime;
        if (Object.keys(patch).length === 0) return null;
        return storage3.updateUser(u.id, patch);
      });
      await Promise.all(updates);
      res.json({ ok: true });
    } catch (error) {
      console.error("Bulk schedule update error:", error);
      res.status(500).json({ message: "Failed to update schedules" });
    }
  });
  app2.get("/api/admin/audio/recordings", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      await storage3.deleteOldAudioRecordings(15);
      const recordings = await storage3.getAllAudioRecordings();
      res.json(recordings);
    } catch (error) {
      console.error("Audio recordings error:", error);
      res.status(500).json({ message: "Failed to fetch audio recordings" });
    }
  });
  app2.get("/api/admin/audio/active", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      const activeRecordings = await storage3.getActiveAudioRecordings();
      res.json(activeRecordings);
    } catch (error) {
      console.error("Active recordings error:", error);
      res.status(500).json({ message: "Failed to fetch active recordings" });
    }
  });
  app2.post("/api/admin/audio/stop/:id", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      const currentRecording = await storage3.getAudioRecordingById(req.params.id);
      let duration = 0;
      if (currentRecording?.createdAt) {
        duration = Math.floor((Date.now() - new Date(currentRecording.createdAt).getTime()) / 1e3);
      }
      const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      const recording = await storage3.updateAudioRecording(req.params.id, {
        isActive: false,
        duration,
        recordingDate: currentRecording?.recordingDate || today
      });
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: "audio_stop", recordingId: req.params.id }));
        }
      });
      res.json(recording);
    } catch (error) {
      console.error("Stop recording error:", error);
      res.status(500).json({ message: "Failed to stop recording" });
    }
  });
  app2.delete("/api/admin/audio/cleanup", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      await storage3.deleteOldAudioRecordings(15);
      res.json({ message: "Old recordings older than 15 days cleaned up" });
    } catch (error) {
      console.error("Cleanup error:", error);
      res.status(500).json({ message: "Failed to clean up old recordings" });
    }
  });
  app2.delete("/api/admin/audio/:id", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      const recording = await storage3.getAudioRecordingById(req.params.id);
      if (!recording) {
        return res.status(404).json({ message: "Recording not found" });
      }
      if (recording.fileName) {
        let filePath2 = resolveFilePathFromUrl(recording.fileUrl);
        if (!filePath2) {
          const user = await storage3.getUser(recording.userId).catch(() => void 0);
          const dirKey = getUserAudioDirKey(user ?? { id: recording.userId });
          filePath2 = path4.join(getAudioBaseDir(), dirKey, recording.fileName);
        }
        if (filePath2) {
          try {
            await fs4.promises.unlink(filePath2);
          } catch (err) {
            console.warn("File delete error:", err);
          }
        }
      }
      await storage3.deleteAudioRecording(req.params.id);
      res.json({ message: "Recording deleted" });
    } catch (error) {
      console.error("Delete recording error:", error);
      res.status(500).json({ message: "Failed to delete recording" });
    }
  });
  return;
}

// server/vite.ts
import express from "express";
import fs5 from "fs";
import path6 from "path";
import { createServer as createViteServer, createLogger } from "vite";

// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path5 from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
var vite_config_default = defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...process.env.NODE_ENV !== "production" && process.env.REPL_ID !== void 0 ? [
      await import("@replit/vite-plugin-cartographer").then(
        (m) => m.cartographer()
      )
    ] : []
  ],
  resolve: {
    alias: {
      "@": path5.resolve(import.meta.dirname, "client", "src"),
      "@shared": path5.resolve(import.meta.dirname, "shared"),
      "@assets": path5.resolve(import.meta.dirname, "attached_assets")
    }
  },
  root: path5.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path5.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1024,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "wouter"],
          ui: ["@tanstack/react-query", "lucide-react", "react-hook-form"]
        }
      }
    }
  },
  server: {
    // Allow opening through any host (ngrok, LAN, etc.) in dev
    // You can restrict this later to a list if needed
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/vite.ts
import { nanoid as nanoid2 } from "nanoid";
var viteLogger = createLogger();
function log(message, source = "express") {
  const formattedTime = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}
async function setupVite(app2, server, sessionMiddleware) {
  const hmrOptions = { server };
  const publicUrl = process.env.PUBLIC_URL;
  const inferredHost = publicUrl ? (() => {
    try {
      return new URL(publicUrl).hostname;
    } catch {
      return void 0;
    }
  })() : void 0;
  const hmrHost = process.env.HMR_HOST || inferredHost;
  if (hmrHost) {
    hmrOptions.host = hmrHost;
    hmrOptions.protocol = "wss";
    hmrOptions.clientPort = 443;
  }
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      }
    },
    server: {
      // Allow external hosts like ngrok to reach the dev server middleware
      allowedHosts: true,
      middlewareMode: true,
      hmr: hmrOptions
    },
    appType: "custom"
  });
  app2.use(sessionMiddleware);
  app2.use(vite.middlewares);
  app2.use("*", async (req, res, next) => {
    if (req.originalUrl.startsWith("/api") || req.originalUrl.startsWith("/uploads")) {
      return next();
    }
    if (!vite) {
      return next();
    }
    const url = req.originalUrl;
    try {
      const clientTemplate = path6.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html"
      );
      let template = await fs5.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid2()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
      return;
    }
  });
}
function serveStatic(app2) {
  const distPath = path6.resolve(import.meta.dirname, "public");
  if (!fs5.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app2.use(express.static(distPath));
  app2.use("*", (_req, res) => {
    res.sendFile(path6.resolve(distPath, "index.html"));
  });
}

// server/index.ts
import fs6 from "fs";
import path7 from "path";
import http from "http";
import https from "https";
var app = express2();
app.use(express2.json());
app.use(express2.urlencoded({ extended: false }));
app.set("trust proxy", 1);
var allowList = new Set([
  process.env.CORS_ORIGIN || "",
  "capacitor://localhost",
  "http://localhost",
  "https://localhost"
].filter(Boolean));
function isAllowedOrigin(origin) {
  if (!origin) return true;
  try {
    const o = new URL(origin);
    const host = o.hostname;
    if (allowList.has(origin)) return true;
    if (host.endsWith(".ngrok-free.app")) return true;
    if (host.endsWith(".loca.lt")) return true;
    if (host.endsWith(".trycloudflare.com")) return true;
    if (host.endsWith(".deno.dev")) return true;
    if (host.endsWith(".deno.net")) return true;
    if (/^(10\.|192\.168\.|172\.)/.test(host)) return true;
  } catch {
  }
  return false;
}
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (isAllowedOrigin(origin)) {
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  next();
});
app.options("*", (req, res) => {
  const origin = req.headers.origin;
  if (!isAllowedOrigin(origin)) return res.sendStatus(403);
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", req.headers["access-control-request-method"] || "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", req.headers["access-control-request-headers"] || "Content-Type, Authorization, X-Requested-With, X-Device-Id");
  return res.sendStatus(204);
});
app.use((req, res, next) => {
  const start = Date.now();
  const path8 = req.path;
  let capturedJsonResponse = void 0;
  const originalResJson = res.json;
  res.json = function(bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path8.startsWith("/api")) {
      let logLine = `${req.method} ${path8} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    }
  });
  next();
});
(async () => {
  let server;
  const certPath = process.env.TLS_CERT_FILE;
  const keyPath = process.env.TLS_KEY_FILE;
  if (certPath && keyPath) {
    try {
      const cert = fs6.readFileSync(path7.resolve(certPath));
      const key = fs6.readFileSync(path7.resolve(keyPath));
      server = https.createServer({ key, cert }, app);
      log(`HTTPS enabled (cert: ${certPath})`);
    } catch (e) {
      log(`failed to enable HTTPS, falling back to HTTP: ${e?.message || e}`);
      server = http.createServer(app);
    }
  } else {
    server = http.createServer(app);
  }
  const sessionMiddleware = setupAuth(app);
  const autoAdmin = (process.env.AUTO_ADMIN_DEV || "").toLowerCase() === "true";
  if (autoAdmin) {
    app.use((req, _res, next) => {
      req.isAuthenticated = () => true;
      if (!req.user) {
        req.user = {
          id: "admin-user",
          username: "admin",
          role: "admin"
        };
      } else {
        req.user.role = "admin";
      }
      next();
    });
  }
  const preferMemoryStore = (process.env.USE_MEMORY_STORE || "").toLowerCase() === "true";
  if (process.env.DATABASE_URL && !preferMemoryStore) {
    try {
      const { ensureDbReady: ensureDbReady2 } = await Promise.resolve().then(() => (init_db(), db_exports));
      await ensureDbReady2();
    } catch (err) {
      log(`database not ready at startup, continuing: ${err?.message || err}`);
    }
  }
  registerRoutes(app, server);
  if (app.get("env") === "development") {
    await setupVite(app, server, sessionMiddleware);
  } else {
    serveStatic(app);
  }
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });
  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(port, "0.0.0.0", () => {
    const protocol = server instanceof https.Server ? "https" : "http";
    log(`serving on ${protocol}://0.0.0.0:${port}`);
  });
})();
