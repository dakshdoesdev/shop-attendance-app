import { users, attendanceRecords, audioRecordings, type User, type InsertUser, type AttendanceRecord, type InsertAttendanceRecord, type AudioRecording, type InsertAudioRecording, type MonthlyWorkHoursResponse, type EmployeeWorkHours, type DailyWorkHours } from "@shared/schema";
import { db, pool } from "./db";
import { eq, desc, and, sql } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";
import fs from "fs";
import path from "path";
import { getAudioBaseDir, getUserAudioDirKey, resolveFilePathFromUrl } from "./audio-paths";
import type { IStorage } from "./storage";

const PostgresSessionStore = connectPg(session);

export class DatabaseStorage implements IStorage {
  public sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({ 
      pool, 
      createTableIfMissing: true 
    });
  }

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async createAttendanceRecord(record: InsertAttendanceRecord): Promise<AttendanceRecord> {
    const [attendanceRecord] = await db
      .insert(attendanceRecords)
      .values(record)
      .returning();
    return attendanceRecord;
  }

  async updateAttendanceRecord(id: string, record: Partial<AttendanceRecord>): Promise<AttendanceRecord | undefined> {
    const [updatedRecord] = await db
      .update(attendanceRecords)
      .set(record)
      .where(eq(attendanceRecords.id, id))
      .returning();
    return updatedRecord || undefined;
  }

  async getAttendanceRecordsByUserId(userId: string): Promise<AttendanceRecord[]> {
    return await db
      .select()
      .from(attendanceRecords)
      .where(eq(attendanceRecords.userId, userId))
      .orderBy(desc(attendanceRecords.checkInTime));
  }

  async getTodayAttendanceRecord(userId: string, date: string): Promise<AttendanceRecord | undefined> {
    const [record] = await db
      .select()
      .from(attendanceRecords)
      .where(and(
        eq(attendanceRecords.userId, userId),
        eq(attendanceRecords.date, date)
      ))
      .orderBy(desc(attendanceRecords.checkInTime))
      .limit(1);
    return record || undefined;
  }

  async getAllTodayAttendance(date: string): Promise<(AttendanceRecord & { user: User })[]> {
    return await db
      .select({
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
        user: users,
      })
      .from(attendanceRecords)
      .innerJoin(users, eq(attendanceRecords.userId, users.id))
      .where(eq(attendanceRecords.date, date))
      .orderBy(desc(attendanceRecords.checkInTime));
  }

  async createAudioRecording(recording: InsertAudioRecording): Promise<AudioRecording> {
    const [audioRecording] = await db
      .insert(audioRecordings)
      .values(recording)
      .returning();
    return audioRecording;
  }

  async updateAudioRecording(id: string, recording: Partial<AudioRecording>): Promise<AudioRecording | undefined> {
    const [updatedRecording] = await db
      .update(audioRecordings)
      .set(recording)
      .where(eq(audioRecordings.id, id))
      .returning();
    return updatedRecording || undefined;
  }

  async getAudioRecordingById(id: string): Promise<AudioRecording | undefined> {
    const [recording] = await db
      .select()
      .from(audioRecordings)
      .where(eq(audioRecordings.id, id));
    return recording || undefined;
  }

  async getActiveAudioRecordingByAttendance(attendanceId: string): Promise<AudioRecording | undefined> {
    const [recording] = await db
      .select()
      .from(audioRecordings)
      .where(and(eq(audioRecordings.attendanceId, attendanceId), eq(audioRecordings.isActive, true)));
    return recording || undefined;
  }

  async getAudioRecordingByUserAndDate(userId: string, date: string): Promise<AudioRecording | undefined> {
    const [recording] = await db
      .select()
      .from(audioRecordings)
      .where(and(eq(audioRecordings.userId, userId), eq(audioRecordings.recordingDate, date)))
      .orderBy(desc(audioRecordings.createdAt));
    return recording || undefined;
  }

  async getTotalAudioStorage(): Promise<number> {
    const [result] = await db
      .select({ total: sql<number>`coalesce(sum(${audioRecordings.fileSize}), 0)` })
      .from(audioRecordings);
    return result?.total || 0;
  }

  async getOldestAudioRecording(): Promise<AudioRecording | undefined> {
    const [recording] = await db
      .select()
      .from(audioRecordings)
      .orderBy(audioRecordings.createdAt)
      .limit(1);
    return recording || undefined;
  }

  async enforceAudioStorageLimit(maxBytes: number): Promise<void> {
    let total = await this.getTotalAudioStorage();
    const baseDir = getAudioBaseDir();
    while (total > maxBytes) {
      const oldest = await this.getOldestAudioRecording();
      if (!oldest) break;

      if (oldest.fileName) {
        let filePath = resolveFilePathFromUrl(oldest.fileUrl);
        if (!filePath) {
          try {
            const user = await this.getUser(oldest.userId);
            const dirKey = getUserAudioDirKey(user ?? { id: oldest.userId });
            filePath = path.join(baseDir, dirKey, oldest.fileName);
          } catch {}
        }
        if (filePath) {
          try {
            await fs.promises.unlink(filePath);
          } catch (err) {
            console.warn('File delete error:', err);
          }
        }
      }

      await this.deleteAudioRecording(oldest.id);
      total -= oldest.fileSize || 0;
    }
  }

  async getAudioRecordingsByUserId(userId: string): Promise<AudioRecording[]> {
    return await db
      .select()
      .from(audioRecordings)
      .where(eq(audioRecordings.userId, userId))
      .orderBy(desc(audioRecordings.createdAt));
  }

  async getAllAudioRecordings(): Promise<(AudioRecording & { user: User })[]> {
    return await db
      .select({
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
        user: users,
      })
      .from(audioRecordings)
      .innerJoin(users, eq(audioRecordings.userId, users.id))
      .orderBy(desc(audioRecordings.createdAt));
  }

  async getActiveAudioRecordings(): Promise<(AudioRecording & { user: User })[]> {
    return await db
      .select({
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
        user: users,
      })
      .from(audioRecordings)
      .innerJoin(users, eq(audioRecordings.userId, users.id))
      .where(eq(audioRecordings.isActive, true));
  }

  async deleteAudioRecording(id: string): Promise<void> {
    await db.delete(audioRecordings).where(eq(audioRecordings.id, id));
  }

  async deleteOldAudioRecordings(daysOld: number): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    await db
      .delete(audioRecordings)
      .where(sql`${audioRecordings.createdAt} < ${cutoffDate}`);
  }

  async getAllUsers(): Promise<User[]> {
    return await db
      .select()
      .from(users)
      .where(eq(users.role, "employee"))
      .orderBy(users.username);
  }

  async updateUser(id: string, user: Partial<User>): Promise<User | undefined> {
    const [updatedUser] = await db
      .update(users)
      .set(user)
      .where(eq(users.id, id))
      .returning();
    return updatedUser || undefined;
  }

  async deleteUser(id: string): Promise<void> {
    const fileCandidates: string[] = [];
    const dirCandidates: string[] = [];

    await db.transaction(async (tx) => {
      const user = await tx.query.users.findFirst({ where: eq(users.id, id) });
      if (!user) return;

      dirCandidates.push(path.join(getAudioBaseDir(), getUserAudioDirKey(user as any)));

      const audioRows = await tx
        .select({ fileUrl: audioRecordings.fileUrl, fileName: audioRecordings.fileName })
        .from(audioRecordings)
        .where(eq(audioRecordings.userId, id));

      for (const row of audioRows) {
        const resolved = resolveFilePathFromUrl(row.fileUrl);
        if (resolved) fileCandidates.push(resolved);
        else if (row.fileName) {
          fileCandidates.push(path.join(getAudioBaseDir(), getUserAudioDirKey(user as any), row.fileName));
        }
      }

      await tx.delete(audioRecordings).where(eq(audioRecordings.userId, id));
      await tx.delete(attendanceRecords).where(eq(attendanceRecords.userId, id));
      await tx.delete(users).where(eq(users.id, id));
    });

    const uniqueFiles = Array.from(new Set(fileCandidates));
    for (const filePath of uniqueFiles) {
      try { await fs.promises.rm(filePath, { force: true }); } catch {}
    }

    for (const dirPath of Array.from(new Set(dirCandidates))) {
      try { await fs.promises.rm(dirPath, { recursive: true, force: true }); } catch {}
    }
  }

  async getMonthlyWorkHours(month: string): Promise<MonthlyWorkHoursResponse> {
    // Get all employees
    const allUsers = await db
      .select()
      .from(users)
      .where(eq(users.role, "employee"))
      .orderBy(users.username);

    // Get attendance records for the specified month
    const monthStart = `${month}-01`;
    const monthEnd = `${month}-31`; // This will work for all months as SQL will handle invalid dates
    
    const attendanceData = await db
      .select({
        userId: attendanceRecords.userId,
        date: attendanceRecords.date,
        checkInTime: attendanceRecords.checkInTime,
        checkOutTime: attendanceRecords.checkOutTime,
        hoursWorked: attendanceRecords.hoursWorked,
        username: users.username,
        employeeId: users.employeeId,
        department: users.department,
      })
      .from(attendanceRecords)
      .innerJoin(users, eq(attendanceRecords.userId, users.id))
      .where(
        and(
          sql`${attendanceRecords.date} >= ${monthStart}`,
          sql`${attendanceRecords.date} <= ${monthEnd}`
        )
      )
      .orderBy(users.username, attendanceRecords.date);

    // Generate all days in the month
    const year = parseInt(month.split('-')[0]);
    const monthNum = parseInt(month.split('-')[1]);
    const daysInMonth = new Date(year, monthNum, 0).getDate();
    const allDaysInMonth: string[] = [];
    
    for (let day = 1; day <= daysInMonth; day++) {
      const dayStr = day.toString().padStart(2, '0');
      allDaysInMonth.push(`${month}-${dayStr}`);
    }

    // Group attendance data by user
    const userAttendanceMap = new Map<string, typeof attendanceData>();
    attendanceData.forEach(record => {
      if (!userAttendanceMap.has(record.userId)) {
        userAttendanceMap.set(record.userId, []);
      }
      userAttendanceMap.get(record.userId)!.push(record);
    });

    // Build response for each employee
    const employees: EmployeeWorkHours[] = allUsers.map(user => {
      const userAttendance = userAttendanceMap.get(user.id) || [];
      const attendanceByDate = new Map(userAttendance.map(a => [a.date, a]));
      
      const dailyHours: DailyWorkHours[] = allDaysInMonth.map(date => {
        const attendance = attendanceByDate.get(date);
        
        if (!attendance) {
          return {
            date,
            hoursWorked: 0,
            checkInTime: null,
            checkOutTime: null,
            status: 'absent' as const,
          };
        }

        const hoursWorked = attendance.hoursWorked ? parseFloat(attendance.hoursWorked) : 0;
        const status: DailyWorkHours['status'] = attendance.checkOutTime ? 'complete' : 'incomplete';
        
        return {
          date,
          hoursWorked,
          checkInTime: attendance.checkInTime ? attendance.checkInTime.toISOString() : null,
          checkOutTime: attendance.checkOutTime ? attendance.checkOutTime.toISOString() : null,
          status,
        };
      });

      const totalHours = dailyHours.reduce((sum, day) => sum + day.hoursWorked, 0);
      const totalDays = dailyHours.filter(day => day.status !== 'absent').length;

      return {
        userId: user.id,
        username: user.username,
        employeeId: user.employeeId || '',
        department: user.department || '',
        dailyHours,
        totalHours: Math.round(totalHours * 100) / 100, // Round to 2 decimal places
        totalDays,
      };
    });

    return {
      month,
      employees,
    };
  }
}

export const storage = new DatabaseStorage();
