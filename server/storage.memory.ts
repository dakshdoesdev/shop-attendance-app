import { users as UsersTable, attendanceRecords as AttendanceTable, audioRecordings as AudioTable, type User, type InsertUser, type AttendanceRecord, type InsertAttendanceRecord, type AudioRecording, type InsertAudioRecording, type MonthlyWorkHoursResponse, type EmployeeWorkHours, type DailyWorkHours } from "@shared/schema";
import session from "express-session";
import createMemoryStoreFactory from "memorystore";
import { nanoid } from "nanoid";
import type { IStorage } from "./storage";

const MemoryStoreFactory = createMemoryStoreFactory(session);

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

// In-memory collections
const users: Mutable<User>[] = [];
const attendance: Mutable<AttendanceRecord>[] = [];
const audio: Mutable<AudioRecording>[] = [];

function todayStr(d = new Date()): string {
  return d.toISOString().split('T')[0];
}

function parseNumOr(value: any, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export class MemoryStorage implements IStorage {
  public sessionStore: session.Store;

  constructor() {
    this.sessionStore = new (MemoryStoreFactory as any)({ checkPeriod: 60 * 60 * 1000 });
    // Do not seed a plain-text 'test' user here. The auth layer will
    // create a properly hashed 'test' user on startup via createTestEmployee().
  }

  async getUser(id: string): Promise<User | undefined> {
    return users.find(u => u.id === id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return users.find(u => u.username === username);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const user: Mutable<User> = {
      id: nanoid(),
      username: insertUser.username,
      password: insertUser.password,
      role: (insertUser as any).role || 'employee',
      employeeId: (insertUser as any).employeeId || null,
      department: (insertUser as any).department || null,
      joinDate: new Date(),
      isActive: true,
      isLoggedIn: false,
      createdAt: new Date(),
    } as any;
    users.push(user);
    return user;
  }

  async createAttendanceRecord(record: InsertAttendanceRecord): Promise<AttendanceRecord> {
    const rec: Mutable<AttendanceRecord> = {
      id: nanoid(),
      userId: record.userId,
      checkInTime: record.checkInTime,
      checkOutTime: (record as any).checkOutTime ?? null,
      hoursWorked: (record as any).hoursWorked ?? null,
      isLate: !!(record as any).isLate,
      isEarlyLeave: !!(record as any).isEarlyLeave,
      audioFileUrl: (record as any).audioFileUrl ?? null,
      date: (record as any).date || todayStr(),
      createdAt: new Date(),
    } as any;
    attendance.push(rec);
    return rec;
  }

  async updateAttendanceRecord(id: string, record: Partial<AttendanceRecord>): Promise<AttendanceRecord | undefined> {
    const idx = attendance.findIndex(a => a.id === id);
    if (idx === -1) return undefined;
    attendance[idx] = { ...attendance[idx], ...record } as any;
    return attendance[idx];
  }

  async getAttendanceRecordsByUserId(userId: string): Promise<AttendanceRecord[]> {
    return attendance.filter(a => a.userId === userId).sort((a, b) => (b.checkInTime?.getTime?.() || 0) - (a.checkInTime?.getTime?.() || 0));
  }

  async getTodayAttendanceRecord(userId: string, date: string): Promise<AttendanceRecord | undefined> {
    return attendance
      .filter(a => a.userId === userId && a.date === date)
      .sort((a, b) => (b.checkInTime?.getTime?.() || 0) - (a.checkInTime?.getTime?.() || 0))[0];
  }

  async getAllTodayAttendance(date: string): Promise<(AttendanceRecord & { user: User })[]> {
    const recs = attendance.filter(a => a.date === date);
    return recs
      .map(r => ({ ...r, user: users.find(u => u.id === r.userId)! }))
      .sort((a, b) => (b.checkInTime?.getTime?.() || 0) - (a.checkInTime?.getTime?.() || 0));
  }

  async createAudioRecording(recording: InsertAudioRecording): Promise<AudioRecording> {
    const rec: Mutable<AudioRecording> = {
      id: nanoid(),
      userId: recording.userId,
      attendanceId: (recording as any).attendanceId || null,
      fileUrl: (recording as any).fileUrl || null,
      fileName: (recording as any).fileName || null,
      fileSize: parseNumOr((recording as any).fileSize, 0),
      duration: parseNumOr((recording as any).duration, 0),
      recordingDate: (recording as any).recordingDate || todayStr(),
      isActive: !!(recording as any).isActive,
      createdAt: new Date(),
    } as any;
    audio.push(rec);
    return rec;
  }

  async updateAudioRecording(id: string, recording: Partial<AudioRecording>): Promise<AudioRecording | undefined> {
    const idx = audio.findIndex(r => r.id === id);
    if (idx === -1) return undefined;
    audio[idx] = { ...audio[idx], ...recording } as any;
    return audio[idx];
  }

  async getAudioRecordingById(id: string): Promise<AudioRecording | undefined> {
    return audio.find(r => r.id === id);
  }

  async getActiveAudioRecordingByAttendance(attendanceId: string): Promise<AudioRecording | undefined> {
    return audio.find(r => r.attendanceId === attendanceId && r.isActive);
  }

  async getAudioRecordingByUserAndDate(userId: string, date: string): Promise<AudioRecording | undefined> {
    return audio
      .filter(r => r.userId === userId && r.recordingDate === date)
      .sort((a, b) => (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0))[0];
  }

  async getTotalAudioStorage(): Promise<number> {
    return audio.reduce((sum, r) => sum + (r.fileSize || 0), 0);
  }

  async getOldestAudioRecording(): Promise<AudioRecording | undefined> {
    return [...audio].sort((a, b) => (a.createdAt?.getTime?.() || 0) - (b.createdAt?.getTime?.() || 0))[0];
  }

  async enforceAudioStorageLimit(maxBytes: number): Promise<void> {
    let total = await this.getTotalAudioStorage();
    while (total > maxBytes) {
      const oldest = await this.getOldestAudioRecording();
      if (!oldest) break;
      await this.deleteAudioRecording(oldest.id);
      total -= oldest.fileSize || 0;
    }
  }

  async getAudioRecordingsByUserId(userId: string): Promise<AudioRecording[]> {
    return audio.filter(r => r.userId === userId).sort((a, b) => (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0));
  }

  async getAllAudioRecordings(): Promise<(AudioRecording & { user: User })[]> {
    return audio.map(r => ({ ...r, user: users.find(u => u.id === r.userId)! }));
  }

  async getActiveAudioRecordings(): Promise<(AudioRecording & { user: User })[]> {
    return audio.filter(r => r.isActive).map(r => ({ ...r, user: users.find(u => u.id === r.userId)! }));
  }

  async deleteAudioRecording(id: string): Promise<void> {
    const idx = audio.findIndex(r => r.id === id);
    if (idx !== -1) audio.splice(idx, 1);
  }

  async deleteOldAudioRecordings(daysOld: number): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysOld);
    for (let i = audio.length - 1; i >= 0; i--) {
      const r = audio[i];
      if ((r.createdAt as any) < cutoff) audio.splice(i, 1);
    }
  }

  async getAllUsers(): Promise<User[]> {
    return users.filter(u => u.role === 'employee').sort((a, b) => a.username.localeCompare(b.username));
  }

  async updateUser(id: string, user: Partial<User>): Promise<User | undefined> {
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) return undefined;
    users[idx] = { ...users[idx], ...user } as any;
    return users[idx];
  }

  async deleteUser(id: string): Promise<void> {
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
    const idx = users.findIndex(u => u.id === id);
    if (idx !== -1) users.splice(idx, 1);
  }

  async getMonthlyWorkHours(month: string): Promise<MonthlyWorkHoursResponse> {
    const year = parseInt(month.split('-')[0]);
    const monthNum = parseInt(month.split('-')[1]);
    const daysInMonth = new Date(year, monthNum, 0).getDate();
    const allDaysInMonth: string[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dayStr = day.toString().padStart(2, '0');
      allDaysInMonth.push(`${month}-${dayStr}`);
    }

    const employees = users
      .filter(u => u.role === 'employee')
      .map<EmployeeWorkHours>((u) => {
        const dailyHours: DailyWorkHours[] = allDaysInMonth.map(date => {
          const rec = attendance.find(a => a.userId === u.id && a.date === date);
          const hoursWorked = rec?.hoursWorked ? parseFloat(rec.hoursWorked as any) : 0;
          const status: DailyWorkHours['status'] = rec ? (rec.checkOutTime ? 'complete' : 'incomplete') : 'absent';
          return {
            date,
            hoursWorked,
            checkInTime: rec?.checkInTime ? (rec.checkInTime as any).toISOString?.() ?? null : null,
            checkOutTime: rec?.checkOutTime ? (rec.checkOutTime as any).toISOString?.() ?? null : null,
            status,
          };
        });
        const totalHours = dailyHours.reduce((s, d) => s + d.hoursWorked, 0);
        const totalDays = dailyHours.filter(d => d.status !== 'absent').length;
        return {
          userId: u.id,
          username: u.username,
          employeeId: (u.employeeId as any) || '',
          department: (u.department as any) || '',
          dailyHours,
          totalHours: Math.round(totalHours * 100) / 100,
          totalDays,
        };
      });

    return { month, employees };
  }
}

export const storage: IStorage = new MemoryStorage();
