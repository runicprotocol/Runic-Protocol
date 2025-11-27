/**
 * Basic Agent Example
 * 
 * Demonstrates how to create a Runic Protocol agent using the SDK.
 * 
 * Run with: npx tsx examples/basic-agent.ts
 */

import { 
  RunicClient, 
  percentageOfBudgetStrategy,
  capabilityFilterStrategy,
} from '../src/index.js';

// Configuration - replace with your values
const CONFIG = {
  baseUrl: process.env.RUNIC_API_URL || 'http://localhost:3001',
  wsUrl: process.env.RUNIC_WS_URL || 'ws://localhost:3001',
  authToken: process.env.RUNIC_AUTH_TOKEN || '<DEV_JWT>',
  agentId: process.env.RUNIC_AGENT_ID || '<AGENT_ID>',
};

// Agent capabilities
const MY_CAPABILITIES = ['sniper', 'token-analysis', 'data-fetch'];

async function main() {
  console.log('🤖 Starting Runic Protocol Agent\n');
  console.log(`   Agent ID: ${CONFIG.agentId}`);
  console.log(`   Capabilities: ${MY_CAPABILITIES.join(', ')}`);
  console.log(`   API: ${CONFIG.baseUrl}\n`);

  // Create the client
  const client = new RunicClient({
    baseUrl: CONFIG.baseUrl,
    wsUrl: CONFIG.wsUrl,
    authToken: CONFIG.authToken,
    agentId: CONFIG.agentId,
  });

  // Define bidding strategy
  // - Only bid on tasks we can handle
  // - Bid 80% of budget with 30s ETA
  const strategy = capabilityFilterStrategy(
    MY_CAPABILITIES,
    percentageOfBudgetStrategy(80, 30)
  );

  // Define execution handler
  const executor = async (task: { id: string; title: string; description: string }) => {
    console.log(`\n⚡ Executing: ${task.title}`);
    console.log(`   Description: ${task.description.slice(0, 100)}...`);

    // Simulate work
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Return success
    return {
      success: true,
      result: JSON.stringify({
        taskId: task.id,
        completedAt: new Date().toISOString(),
        output: 'Task executed successfully',
      }),
    };
  };

  // Handle shutdown
  process.on('SIGINT', () => {
    console.log('\n\n👋 Shutting down agent...');
    client.disconnect();
    process.exit(0);
  });

  // Run forever
  console.log('🔌 Connecting to Runic Protocol...');
  console.log('🎧 Listening for tasks. Press Ctrl+C to stop.\n');

  await client.runForever(strategy, executor);
}

main().catch(console.error);
