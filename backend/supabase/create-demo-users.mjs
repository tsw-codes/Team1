/**
 * Creates demo auth users in Supabase.
 * Run once after setting up the project:
 *
 *   SUPABASE_SERVICE_ROLE_KEY=your_key node backend/supabase/create-demo-users.mjs
 *
 * Get the service_role key from: Supabase Dashboard → Settings → API
 */

const SUPABASE_URL = 'https://utxzjalyxcgbqheciyzh.supabase.co'
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY.')
  console.error('Get it from: Supabase Dashboard → Settings → API → service_role key')
  console.error('')
  console.error('Run with:')
  console.error('  SUPABASE_SERVICE_ROLE_KEY=your_key node backend/supabase/create-demo-users.mjs')
  process.exit(1)
}

const users = [
  { email: 'admin@coolsys.com', password: 'admin123', username: 'admin', name: 'Admin User',           role: 'admin' },
  { email: 'pm@coolsys.com',    password: 'pm123',    username: 'pm',    name: 'Project Manager',      role: 'projectManager' },
  { email: 'wm@coolsys.com',    password: 'wm123',    username: 'wm',    name: 'Warehouse Manager',    role: 'warehouseManager' },
  { email: 'la@coolsys.com',    password: 'la123',    username: 'la',    name: 'Logistics Associate',  role: 'logisticsAssociate' },
  { email: 'lf@coolsys.com',    password: 'lf123',    username: 'lf',    name: 'Logistics Foreman',    role: 'logisticsForeman' },
  { email: 'viewer@coolsys.com', password: 'viewer123', username: 'viewer', name: 'Demo Viewer',         role: 'readonly' },
]

async function createUsers() {
  for (const user of users) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        email: user.email,
        password: user.password,
        email_confirm: true,
        user_metadata: {
          username: user.username,
          name: user.name,
          role: user.role,
        },
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      console.error(`✗ ${user.username} (${user.email}): ${data.msg || data.message || JSON.stringify(data)}`)
    } else {
      console.log(`✓ ${user.username} (${user.email}) — role: ${user.role}`)
    }
  }

  console.log('\nDone. Profiles are auto-created by the handle_new_user trigger.')
}

createUsers()
