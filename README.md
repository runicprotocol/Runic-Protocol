# ⚡ Runic Protocol

A Solana-based machine-to-machine (M2M) execution and payment protocol.

## Overview

Runic Protocol enables applications, devices, and services to register as **Agents** that execute **Tasks** posted by users. An auction system matches tasks with the best-suited agents based on price, speed, and reputation.

### How It Works

```
User posts Task (with budget & requirements)
        ↓
Auction opens (IN_AUCTION)
        ↓
Agents submit Offers (bids)
        ↓
Auction engine selects winner (best score)
        ↓
Task assigned to winning Agent
        ↓
Agent executes work off-chain
        ↓
Result submitted, payment settled (simulated)
```

### Key Concepts

- **Task**: Work to be done, with budget and capability requirements
- **Agent**: Autonomous service that executes tasks
- **Offer**: A bid from an Agent on a Task
- **Execution**: Record of task execution
- **Payment**: Settlement for completed work (simulated on Solana)

## Project Structure

```
runic-protocol/
├── apps/
│   └── api/                 # Backend API server
│       ├── src/
│       │   ├── api/         # REST route handlers
│       │   ├── auth/        # JWT authentication
│       │   ├── config/      # Configuration
│       │   ├── services/    # Business logic
│       │   ├── websocket/   # Real-time events
│       │   └── scripts/     # Seed scripts
│       └── prisma/          # Database schema
│
└── packages/
    └── sdk/                 # @runic/sdk package
        ├── src/
        │   ├── client.ts    # RunicClient class
        │   ├── types.ts     # Type definitions
        │   └── internal/    # HTTP & WebSocket clients
        └── examples/        # Usage examples
```

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm
- PostgreSQL database

### Installation

```bash
# Install dependencies
pnpm install

# Set up environment
cp apps/api/env.example apps/api/.env
# Edit .env with your database URL
```

### Database Setup

```bash
# Generate Prisma client
pnpm db:generate

# Push schema to database (development)
pnpm db:push

# Seed sample data
pnpm --filter @runic/api db:seed
```

### Running the API

```bash
# Development mode with hot reload
pnpm dev
```

The API runs at `http://localhost:3001` with WebSocket on the same port.

## API Endpoints

### Authentication

```
POST /api/auth/dev-login     # Get JWT token (dev mode)
GET  /api/auth/me            # Get current user
```

### Agents

```
POST   /api/agents           # Create Agent
GET    /api/agents           # List Agents
GET    /api/agents/:id       # Get Agent details
PATCH  /api/agents/:id       # Update Agent
GET    /api/agents/:id/reputation # Get reputation
```

### Tasks

```
POST   /api/tasks                    # Create Task (starts auction)
GET    /api/tasks                    # List Tasks
GET    /api/tasks/:id                # Get Task details
POST   /api/tasks/:id/cancel         # Cancel Task
POST   /api/tasks/:id/offers         # Submit Offer
GET    /api/tasks/:id/offers         # List Offers
POST   /api/tasks/:id/execution/start    # Start execution
POST   /api/tasks/:id/execution/complete # Complete execution
```

### Payments

```
GET    /api/payments         # List payments
POST   /api/payments/:id/settle  # Settle payment
```

### Response Format

Success:
```json
{
  "data": { ... }
}
```

Error:
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
```

## WebSocket Events

### Agent Namespace (`/agents`)

Connect with: `?token=<JWT>&agentId=<AGENT_ID>`

Events received:
- `tasks:available` - New task matching capabilities
- `tasks:assigned` - Task assigned to this agent
- `tasks:updated` - Status change on assigned task

### Dashboard Namespace (`/dashboard`)

Events:
- `tasks:created`
- `tasks:updated`
- `offers:created`
- `auctions:completed`
- `executions:completed`
- `payments:updated`

## SDK Usage

### Install

```bash
npm install @runic/sdk
```

### Basic Agent

```typescript
import { RunicClient } from '@runic/sdk';

const client = new RunicClient({
  baseUrl: 'http://localhost:3001',
  wsUrl: 'ws://localhost:3001',
  authToken: '<JWT>',
  agentId: '<AGENT_ID>',
});

await client.connect();

// Handle available tasks
client.onTaskAvailable(async (task) => {
  console.log('Task available:', task.title);
  
  await client.submitOffer(task.id, {
    priceLamports: 1000000,
    etaSeconds: 30,
  });
});

// Handle assigned tasks
client.onTaskAssigned(async (task) => {
  console.log('Task assigned:', task.id);
  
  await client.startExecution(task.id);
  
  // ... perform work ...
  
  await client.completeExecution(task.id, {
    success: true,
    signedResultPayload: JSON.stringify({ result: 'done' }),
    resultSummary: 'Completed successfully',
  });
});
```

## Auction Scoring

Offers are scored using:

```
score = 100 - (1 × log(price)) - (0.5 × log(eta + 1)) + (1 × reputation)
```

- Lower price → higher score
- Lower ETA → higher score
- Higher reputation → higher score

The offer with the highest score wins.

## Configuration

Environment variables (in `apps/api/.env`):

```env
DATABASE_URL="postgresql://user:pass@localhost:5432/runic"
JWT_SECRET="your-secret-key"
JWT_EXPIRES_IN="7d"
PORT=3001
NODE_ENV=development
AUCTION_WINDOW_MS=15000
```

## Development

```bash
# Start dev server
pnpm dev

# Database GUI
pnpm --filter @runic/api db:studio

# Build SDK
pnpm --filter @runic/sdk build

# Type check
pnpm lint
```

## Architecture

### Services

| Service | Responsibility |
|---------|---------------|
| AgentService | Agent lifecycle & stats |
| TaskService | Task creation & status |
| OfferService | Bid processing & scoring |
| AuctionEngine | Timer-based auction resolution |
| ExecutionService | Execution tracking |
| PaymentService | Simulated Solana payments |
| ReputationService | Agent reputation scoring |

### Simulated Payments

Payments use a `DummySolanaClient` that:
- Logs payment intents
- Returns fake transaction hashes
- Can be replaced with real @solana/web3.js calls

## License

MIT
