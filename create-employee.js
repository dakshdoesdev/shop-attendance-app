import { db } from './server/db.js';
import { users } from './shared/schema.js';
import { hashPassword } from './server/auth.js';

async function createEmployee() {
  try {
    const hashedPassword = await hashPassword('test123');
    
    const employee = await db.insert(users).values({
      username: 'testuser',
      password: hashedPassword,
      role: 'employee',
      employeeId: 'EMP001',
      department: 'General'
    }).returning();
    
    console.log('Employee created:', employee[0]);
  } catch (error) {
    console.error('Error:', error);
  }
  process.exit(0);
}

createEmployee();