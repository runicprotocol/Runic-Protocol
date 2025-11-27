/**
 * Basic Agent Example
 * 
 * This example demonstrates how to create a simple Agent
 * that connects to the Runic Protocol network, bids on Tasks,
 * and executes work.
 * 
 * Run with: npx tsx examples/basic-agent.ts
 */

import { RunicClient } from '../src/index.js';

// Configuration - replace with your values
const CONFIG = {
  baseUrl: process.env.RUNIC_API_URL || 'http://localhost:3001',
  wsUrl: process.env.RUNIC_WS_URL || 'ws://localhost:3001',
  authToken: process.env.RUNIC_AUTH_TOKEN || '<DEV_JWT>',
  agentId: process.env.RUNIC_AGENT_ID || '<AGENT_ID>',
};

async function main() {
  console.log('🤖 Starting Runic Protocol Agent...\n');

  // Create the client
  const client = new RunicClient({
    baseUrl: CONFIG.baseUrl,
    wsUrl: CONFIG.wsUrl,
    authToken: CONFIG.authToken,
    agentId: CONFIG.agentId,
  });

  // Connect to the network
  console.log('🔌 Connecting to Runic Protocol...');
  await client.connect();
  console.log('✅ Connected!\n');

  // Handle available tasks
  client.onTaskAvailable(async (task) => {
    console.log('\n📋 Task Available!');
    console.log(`   ID: ${task.id}`);
    console.log(`   Title: ${task.title}`);
    console.log(`   Description: ${task.description}`);
    console.log(`   Budget: ${task.budgetLamports} lamports`);
    console.log(`   Required: ${task.requiredCapabilities.join(', ') || 'None'}`);

    // Submit an offer
    // Simple strategy: bid 80% of budget with 30s ETA
    const bidPrice = BigInt(task.budgetLamports) * BigInt(80) / BigInt(100);
    
    console.log(`\n💰 Submitting offer: ${bidPrice} lamports, 30s ETA`);

    try {
      await client.submitOffer(task.id, {
        priceLamports: bidPrice.toString(),
        etaSeconds: 30,
      });
      console.log('✅ Offer submitted!');
    } catch (error: any) {
      console.error(`❌ Failed: ${error.message}`);
    }
  });

  // Handle task assignments
  client.onTaskAssigned(async (task) => {
    console.log('\n🎯 Task Assigned!');
    console.log(`   ID: ${task.id}`);
    console.log(`   Title: ${task.title}`);

    try {
      // Start execution
      console.log('\n⚡ Starting execution...');
      await client.startExecution(task.id);

      // Simulate work
      console.log('🔨 Working...');
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Complete execution
      console.log('✅ Completing execution...');
      await client.completeExecution(task.id, {
        success: true,
        signedResultPayload: JSON.stringify({
          result: 'Task completed successfully',
          timestamp: new Date().toISOString(),
        }),
        resultSummary: 'Execution completed in demo mode',
      });

      console.log('🎉 Task completed successfully!');

    } catch (error: any) {
      console.error(`❌ Execution failed: ${error.message}`);

      // Report failure
      try {
        await client.completeExecution(task.id, {
          success: false,
          errorMessage: error.message,
        });
      } catch (e) {
        console.error('Failed to report error');
      }
    }
  });

  console.log('🎧 Listening for tasks...');
  console.log('   Press Ctrl+C to stop\n');

  // Keep process running
  process.on('SIGINT', () => {
    console.log('\n👋 Shutting down...');
    client.disconnect();
    process.exit(0);
  });
}

main().catch(console.error);

