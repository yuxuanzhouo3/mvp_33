/**
 * Update existing CloudBase users to set region field
 * This script sets region='cn' for all users in CloudBase
 * Run this with: node scripts/040_update_cloudbase_users_region.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });

const cloudbase = require('@cloudbase/node-sdk');

const envId = process.env.CLOUDBASE_ENV_ID;
const secretId = process.env.CLOUDBASE_SECRET_ID;
const secretKey = process.env.CLOUDBASE_SECRET_KEY;

if (!envId || !secretId || !secretKey) {
  console.error('❌ CloudBase environment variables not configured');
  console.error('Please set CLOUDBASE_ENV_ID, CLOUDBASE_SECRET_ID, and CLOUDBASE_SECRET_KEY in .env.local');
  process.exit(1);
}

async function updateUsersRegion() {
  try {
    // Initialize CloudBase
    const app = cloudbase.init({
      env: envId,
      secretId: secretId,
      secretKey: secretKey
    });

    const db = app.database();

    console.log('📝 Updating CloudBase users to set region="cn"...');

    // Get all users
    const result = await db.collection('users').get();
    
    if (!result.data || result.data.length === 0) {
      console.log('✅ No users found in CloudBase');
      return;
    }

    console.log(`📋 Found ${result.data.length} users`);

    let updatedCount = 0;
    let skippedCount = 0;

    // Update each user
    for (const user of result.data) {
      const docId = user._id;
      
      // Check if region is already set correctly
      if (user.region === 'cn') {
        skippedCount++;
        continue;
      }

      try {
        // Update user to set region='cn'
        await db.collection('users')
          .doc(docId)
          .update({
            region: 'cn',
            updated_at: new Date().toISOString()
          });
        
        updatedCount++;
        console.log(`  ✓ Updated user: ${user.email || user.id} (docId: ${docId})`);
      } catch (error) {
        console.error(`  ✗ Failed to update user ${user.email || user.id}:`, error.message);
      }
    }

    console.log('\n✅ Update complete!');
    console.log(`   Updated: ${updatedCount} users`);
    console.log(`   Skipped: ${skippedCount} users (already had region='cn')`);
    console.log(`   Total: ${result.data.length} users`);

  } catch (error) {
    console.error('❌ Error updating users:', error);
    process.exit(1);
  }
}

updateUsersRegion();




































































