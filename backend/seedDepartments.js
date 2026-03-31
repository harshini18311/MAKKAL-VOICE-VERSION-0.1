/**
 * Seed Department Accounts
 * Run once: node seedDepartments.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/complaints';

const departments = [
  { name: 'Water Department',              email: 'water@makkalvoice',           department: 'Water',               departmentCode: 'WTR' },
  { name: 'Road Department',               email: 'road@makkalvoice',            department: 'Road',                departmentCode: 'ROD' },
  { name: 'Electricity Department',        email: 'electricity@makkalvoice',     department: 'Electricity',         departmentCode: 'ELC' },
  { name: 'Sanitation Department',         email: 'sanitation@makkalvoice',      department: 'Sanitation',          departmentCode: 'SAN' },
  { name: 'Traffic Department',            email: 'traffic@makkalvoice',         department: 'Traffic',             departmentCode: 'TRF' },
  { name: 'Public Safety Department',      email: 'publicsafety@makkalvoice',    department: 'Public Safety',       departmentCode: 'PUB' },
  { name: 'Infrastructure Department',     email: 'infrastructure@makkalvoice',  department: 'Infrastructure',      departmentCode: 'INF' },
  { name: 'Government Services Department',email: 'govservices@makkalvoice',     department: 'Government Services', departmentCode: 'GOV' },
  { name: 'Rural Development Department',  email: 'rural@makkalvoice',           department: 'Rural specific',      departmentCode: 'RUR' },
  { name: 'General Department',            email: 'other@makkalvoice',           department: 'Other',               departmentCode: 'GEN' }
];

const PASSWORD = 'makkalvoice@123';

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  let created = 0;
  let skipped = 0;

  for (const dept of departments) {
    const existing = await User.findOne({ email: dept.email });
    if (existing) {
      console.log(`⏭️  Skipping ${dept.email} (already exists)`);
      skipped++;
      continue;
    }

    await User.create({
      name: dept.name,
      email: dept.email,
      password: PASSWORD,
      role: 'department',
      department: dept.department,
      departmentCode: dept.departmentCode,
      phoneVerified: true,
      trustScore: 100
    });

    console.log(`✅ Created: ${dept.email} (${dept.department})`);
    created++;
  }

  console.log(`\n══════════════════════════════════`);
  console.log(`  Seeding complete!`);
  console.log(`  Created: ${created}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Password for all: ${PASSWORD}`);
  console.log(`══════════════════════════════════\n`);

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
