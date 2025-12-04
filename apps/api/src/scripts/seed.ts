/**
 * Database Seed Script
 * 
 * Creates sample data for development and testing.
 * 
 * Run with: npx tsx src/scripts/seed.ts
 */

import prisma from '../utils/prisma.js';

async function main() {
  console.log('🌱 Seeding database...\n');

  // Create a dev user
  const user = await prisma.user.upsert({
    where: { email: 'dev@runic.io' },
    update: {},
    create: {
      email: 'dev@runic.io',
    },
  });
  console.log(`✅ Created user: ${user.email} (${user.id})`);

  // Create sample agents
  const agent1 = await prisma.agent.upsert({
    where: { id: 'agent-sniper-1' },
    update: {},
    create: {
      id: 'agent-sniper-1',
      name: 'Sniper Bot Alpha',
      description: 'High-speed token sniper for new launches',
      ownerUserId: user.id,
      walletAddress: 'Snip3rB0tA1pha11111111111111111111111111111',
      capabilities: ['sniper', 'dex-trading', 'token-analysis'],
      reputationScore: 4.2,
      isActive: true,
    },
  });
  console.log(`✅ Created agent: ${agent1.name} (${agent1.id})`);

  const agent2 = await prisma.agent.upsert({
    where: { id: 'agent-indexer-1' },
    update: {},
    create: {
      id: 'agent-indexer-1',
      name: 'Chain Indexer Pro',
      description: 'Real-time blockchain data indexing and analytics',
      ownerUserId: user.id,
      walletAddress: 'Ind3x3rPr011111111111111111111111111111111',
      capabilities: ['indexer', 'data-fetch', 'analytics'],
      reputationScore: 3.8,
      isActive: true,
    },
  });
  console.log(`✅ Created agent: ${agent2.name} (${agent2.id})`);

  // Create sample tasks
  const task1 = await prisma.task.upsert({
    where: { id: 'task-sample-1' },
    update: {},
    create: {
      id: 'task-sample-1',
      title: 'Monitor New Token Launches',
      description: 'Monitor Raydium for new token launches and report token addresses with initial liquidity > 10 SOL',
      createdByUserId: user.id,
      paymentTokenSymbol: 'SOL',
      budgetLamports: BigInt('500000000'), // 0.5 SOL
      status: 'OPEN',
      requiredCapabilities: ['sniper', 'token-analysis'],
      deadline: new Date(Date.now() + 3600000), // 1 hour
    },
  });
  console.log(`✅ Created task: ${task1.title} (${task1.id})`);

  const task2 = await prisma.task.upsert({
    where: { id: 'task-sample-2' },
    update: {},
    create: {
      id: 'task-sample-2',
      title: 'Index Recent NFT Sales',
      description: 'Fetch and index all NFT sales on Magic Eden from the last 24 hours, return as JSON',
      createdByUserId: user.id,
      paymentTokenSymbol: 'SOL',
      budgetLamports: BigInt('250000000'), // 0.25 SOL
      status: 'OPEN',
      requiredCapabilities: ['indexer', 'data-fetch'],
      deadline: new Date(Date.now() + 7200000), // 2 hours
    },
  });
  console.log(`✅ Created task: ${task2.title} (${task2.id})`);

  const task3 = await prisma.task.upsert({
    where: { id: 'task-sample-3' },
    update: {},
    create: {
      id: 'task-sample-3',
      title: 'Execute Token Swap',
      description: 'Swap 1 SOL to USDC using Jupiter aggregator with max 0.5% slippage',
      createdByUserId: user.id,
      paymentTokenSymbol: 'SOL',
      budgetLamports: BigInt('100000000'), // 0.1 SOL
      status: 'IN_AUCTION',
      requiredCapabilities: ['dex-trading'],
      deadline: new Date(Date.now() + 1800000), // 30 minutes
    },
  });
  console.log(`✅ Created task: ${task3.title} (${task3.id})`);

  // Create a sample offer on task3
  const offer = await prisma.offer.upsert({
    where: { id: 'offer-sample-1' },
    update: {},
    create: {
      id: 'offer-sample-1',
      taskId: task3.id,
      agentId: agent1.id,
      priceLamports: BigInt('80000000'), // 0.08 SOL
      etaSeconds: 15,
      status: 'PENDING',
      score: 85.5,
    },
  });
  console.log(`✅ Created offer: ${offer.id} for task ${task3.id}`);

  console.log('\n🎉 Seed completed!');
  console.log('\nYou can now:');
  console.log('1. Start the API: pnpm dev');
  console.log('2. Login with: POST /api/auth/dev-login { "email": "dev@runic.io" }');
  console.log('3. Use the returned token to access other endpoints');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });






