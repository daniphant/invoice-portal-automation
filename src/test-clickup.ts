import axios from 'axios';
import dotenv from 'dotenv';
import { resolve } from 'path';

// Load env
dotenv.config({ path: resolve(__dirname, '../.env') });

const CLICKUP_API = 'https://api.clickup.com/api/v2';
const token = process.env.CLICKUP_API_TOKEN;
const teamId = process.env.CLICKUP_TEAM_ID;

async function testClickUp() {
  console.log('🧪 Testing ClickUp API...\n');
  
  try {
    // Test 1: Get authorized user
    console.log('1. Getting authorized user...');
    const userRes = await axios.get(`${CLICKUP_API}/user`, {
      headers: { Authorization: token }
    });
    console.log(`   ✅ User: ${userRes.data.user.username} (${userRes.data.user.email})\n`);
    
    // Test 2: Get tasks assigned to user (My Work view)
    console.log('2. Getting your tasks (My Work)...');
    const userId = userRes.data.user.id;
    const tasksRes = await axios.get(`${CLICKUP_API}/team/${teamId}/task`, {
      headers: { Authorization: token },
      params: {
        assignees: [userId],
        include_closed: false
      }
    });
    
    const myTasks = tasksRes.data.tasks || [];
    
    console.log(`   ✅ Found ${myTasks.length} task(s) assigned to you\n`);
    
    if (myTasks.length > 0) {
      console.log('   Your tasks:');
      myTasks.forEach((task: any, i: number) => {
        console.log(`   ${i + 1}. ${task.name} [${task.status.status}]`);
      });
    } else {
      console.log('   ℹ️ No tasks assigned to you found');
    }
    
    console.log('\n🎉 ClickUp API is working!');
    
  } catch (error: any) {
    console.error('❌ Error:', error.response?.data || error.message);
    process.exit(1);
  }
}

testClickUp();
