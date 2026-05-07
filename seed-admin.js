require('dotenv').config();
const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

async function seed() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('Error: MONGODB_URI is not set in .env');
    process.exit(1);
  }

  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'changeme123';
  const dbName = process.env.MONGODB_DB || 'vermo-production';

  const client = new MongoClient(uri);
  await client.connect();

  const db = client.db(dbName);
  const hashed = await bcrypt.hash(password, 12);

  await db.collection('admin_users').updateOne(
    { username },
    {
      $set: { username, password: hashed, updatedAt: new Date() },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true }
  );

  console.log('');
  console.log('✅ Admin user created/updated successfully');
  console.log('──────────────────────────────────');
  console.log(`   Username : ${username}`);
  console.log(`   Password : ${password}`);
  console.log('──────────────────────────────────');
  console.log('Change your password after first login!');
  console.log('');

  await client.close();
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
