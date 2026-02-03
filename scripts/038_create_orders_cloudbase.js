/**
 * Create orders collection in CloudBase
 * Run this script to set up the orders collection for payment system
 */

const cloudbase = require('@cloudbase/node-sdk');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });

const envId = process.env.CLOUDBASE_ENV_ID;
const secretId = process.env.CLOUDBASE_SECRET_ID;
const secretKey = process.env.CLOUDBASE_SECRET_KEY;

if (!envId || !secretId || !secretKey) {
  console.error('❌ CloudBase environment variables not configured');
  console.error('Please set CLOUDBASE_ENV_ID, CLOUDBASE_SECRET_ID, and CLOUDBASE_SECRET_KEY in .env.local');
  process.exit(1);
}

async function createOrdersCollection() {
  try {
    // Initialize CloudBase
    const app = cloudbase.init({
      env: envId,
      secretId: secretId,
      secretKey: secretKey
    });

    const db = app.database();

    console.log('📦 Creating orders collection in CloudBase...');

    // Create a sample document to ensure collection exists
    const sampleOrder = {
      order_no: 'TEMP_ORDER_' + Date.now(),
      user_id: 'temp_user_id',
      amount: 0.01,
      currency: 'CNY',
      payment_method: 'wechat',
      payment_status: 'pending',
      status: 'pending',
      region: 'cn',
      description: 'Temporary order for collection creation',
      created_at: new Date(),
      updated_at: new Date()
    };

    // Try to add a document (this will create the collection if it doesn't exist)
    try {
      const result = await db.collection('orders').add(sampleOrder);
      console.log('✅ Orders collection created successfully');
      console.log('   Collection ID:', result.id);
      
      // Delete the temporary document
      await db.collection('orders').doc(result.id).remove();
      console.log('   Temporary document removed');
    } catch (error) {
      if (error.message && error.message.includes('collection')) {
        console.log('⚠️  Collection might already exist, trying to query...');
        const queryResult = await db.collection('orders').limit(1).get();
        if (queryResult.data) {
          console.log('✅ Orders collection already exists');
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    }

    // Also ensure users collection has subscription fields
    console.log('\n📝 Checking users collection for subscription fields...');
    try {
      const userSample = await db.collection('users').limit(1).get();
      if (userSample.data && userSample.data.length > 0) {
        console.log('✅ Users collection exists');
        console.log('   Note: Subscription fields (subscription_type, subscription_expires_at, region, country)');
        console.log('   will be added automatically when updating user records.');
      } else {
        console.log('⚠️  Users collection is empty, but it should exist');
      }
    } catch (error) {
      console.log('⚠️  Could not verify users collection:', error.message);
    }

    console.log('\n✅ CloudBase setup completed!');
    console.log('\n📋 Collection structure:');
    console.log('   - orders: Payment orders collection');
    console.log('     Fields: order_no, user_id, amount, currency, payment_method,');
    console.log('              payment_status, status, region, description,');
    console.log('              payment_provider_order_id, payment_provider_response,');
    console.log('              payment_data, callback_data, ip_address,');
    console.log('              created_at, updated_at, paid_at');
    console.log('\n   - users: User collection (should have subscription fields)');
    console.log('     Fields: subscription_type, subscription_expires_at, region, country');

  } catch (error) {
    console.error('❌ Error creating orders collection:', error);
    process.exit(1);
  }
}

// Run the setup
createOrdersCollection();







































































