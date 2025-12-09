
import 'dotenv/config';
import { db } from './server/db.js';
import { attendanceRecords, audioRecordings, users } from './shared/schema.js';
import { sql, eq, and } from 'drizzle-orm';
import readline from 'readline';

const today = '2025-08-25';

async function clearAttendance() {
  try {
    const usersWithMultipleEntries = await db
      .select({
        userId: attendanceRecords.userId,
        username: users.username,
        count: sql`count(${attendanceRecords.id})`,
      })
      .from(attendanceRecords)
      .leftJoin(users, eq(users.id, attendanceRecords.userId))
      .where(eq(attendanceRecords.date, today))
      .groupBy(attendanceRecords.userId, users.username)
      .having(sql`count(${attendanceRecords.id}) > 1`);

    if (usersWithMultipleEntries.length === 0) {
      console.log("No users with multiple attendance entries for today.");
      process.exit(0);
    }

    console.log("Users with multiple attendance entries for today:");
    usersWithMultipleEntries.forEach((user, index) => {
      console.log(`${index + 1}. ${user.username} (User ID: ${user.userId}) - ${user.count} entries`);
    });

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question("Enter the number of the user whose attendance you want to clear (or type 'all' to clear for all listed users, or 'exit' to cancel): ", async (answer) => {
      if (answer.toLowerCase() === 'exit') {
        console.log("Operation cancelled.");
        rl.close();
        process.exit(0);
      }
      
      let usersToClear = [];
      if (answer.toLowerCase() === 'all') {
        usersToClear = usersWithMultipleEntries.map(u => u.userId);
      } else {
        const userIndex = parseInt(answer) - 1;
        if (userIndex >= 0 && userIndex < usersWithMultipleEntries.length) {
          usersToClear.push(usersWithMultipleEntries[userIndex].userId);
        } else {
          console.log("Invalid selection.");
          rl.close();
          process.exit(1);
        }
      }

      for (const userId of usersToClear) {
        await db.delete(audioRecordings).where(and(eq(audioRecordings.userId, userId), eq(audioRecordings.recordingDate, today)));
        await db.delete(attendanceRecords).where(and(eq(attendanceRecords.userId, userId), eq(attendanceRecords.date, today)));
        const user = usersWithMultipleEntries.find(u => u.userId === userId);
        console.log(`Cleared attendance for ${user.username} (User ID: ${userId})`);
      }

      rl.close();
      process.exit(0);
    });

  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

clearAttendance();
