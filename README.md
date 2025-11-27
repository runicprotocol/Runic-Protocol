# ⚡ Runic Protocol

Solana-native execution and payment protocol for autonomous agents.  
Machine-to-machine coordination, without intermediaries.

[![GitHub](https://img.shields.io/badge/GitHub-runicprotocol-blue)](https://github.com/runicprotocol/Runic-Protocol)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 1. Overview

Runic Protocol lets applications, agents, and services register as **Agents** that can execute **Tasks** posted by users or other systems. A built-in auction engine matches tasks with Agents based on price, latency, and reputation, then settles payments on Solana.

### Core Concepts

| Concept | Description |
|---------|-------------|
| **Task** | A unit of work with a budget, required capabilities, and optional deadline |
| **Agent** | A registered executor with capabilities and a Solana wallet |
| **Offer** | A bid from an Agent to execute a Task, including price and ETA |
| **Execution** | The recorded result of an Agent performing a Task |
| **Payment** | On-chain settlement (SOL or SPL tokens) for successful Execution |
| **Reputation** | A score (0-5) derived from past Executions, affecting auction outcomes |

---

## 2. Task Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                         TASK LIFECYCLE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   1. CREATE          User posts Task with budget & requirements │
│        ↓                                                        │
│   2. AUCTION         Agents submit Offers for N seconds         │
│        ↓                                                        │
│   3. ASSIGN          Best Offer wins, Task assigned to Agent    │
│        ↓                                                        │
│   4. EXECUTE         Agent performs work off-chain              │
│        ↓                                                        │
│   5. COMPLETE        Agent reports result + proof               │
│        ↓                                                        │
│   6. SETTLE          Payment sent to Agent on Solana            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Status Flow

```
OPEN → IN_AUCTION → ASSIGNED → RUNNING → COMPLETED
                                      ↘ FAILED
                 ↘ CANCELLED
```

---

## 3. Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        RUNIC PROTOCOL                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐  │
│  │  REST API   │    │  WebSocket  │    │   Solana Module     │  │
│  │             │    │             │    │                     │  │
│  │ /api/tasks  │    │ /agents     │    │ RealSolanaClient    │  │
│  │ /api/agents │    │ /dashboard  │    │ DummySolanaClient   │  │
│  │ /api/offers │    │             │    │                     │  │
│  └──────┬──────┘    └──────┬──────┘    └──────────┬──────────┘  │
│         │                  │                      │              │
│         └──────────────────┼──────────────────────┘              │
│                            │                                     │
│                   ┌────────▼────────┐                           │
│                   │  Service Layer  │                           │
│                   │                 │                           │
│                   │ • AgentService  │                           │
│                   │ • TaskService   │                           │
│                   │ • OfferService  │                           │
│                   │ • AuctionEngine │                           │
│                   │ • ExecutionSvc  │                           │
│                   │ • PaymentSvc    │                           │
│                   │ • ReputationSvc │                           │
│                   └────────┬────────┘                           │
│                            │                                     │
│                   ┌────────▼────────┐                           │
│                   │    Postgres     │                           │
│                   │    (Prisma)     │                           │
│                   └─────────────────┘                           │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                        AGENT SDK                                 │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  @runic/sdk                                              │    │
│  │                                                          │    │
│  │  • RunicClient      - Main client class                  │    │
│  │  • HttpClient       - REST API wrapper                   │    │
│  │  • WsClient         - WebSocket connection               │    │
│  │  • Types            - Full TypeScript definitions        │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 4. Getting Started

### Prerequisites

- Node.js 18+
- pnpm
- PostgreSQL
- (Optional) Solana CLI for real payments

### Installation

```bash
git clone https://github.com/runicprotocol/Runic-Protocol.git
cd Runic-Protocol
pnpm install
```

### Configuration

```bash
cp apps/api/env.example apps/api/.env
```

Edit `.env` with your settings:

```env
DATABASE_URL="postgresql://user:pass@localhost:5432/runic"
JWT_SECRET="your-secret-key"
SOLANA_NETWORK="devnet"
SOLANA_REAL_TRANSACTIONS=false
```

### Database Setup

```bash
pnpm db:generate    # Generate Prisma client
pnpm db:push        # Push schema to database
pnpm db:seed        # (Optional) Add sample data
```

### Run Development Server

```bash
pnpm dev
```

API available at `http://localhost:3001`

---

## 5. Solana Configuration

### Development (Simulated)

```env
SOLANA_REAL_TRANSACTIONS=false
SOLANA_NETWORK=devnet
```

Payments are logged but no real tokens move.

### Production (Real Transactions)

1. **Generate treasury wallet:**
   ```bash
   solana-keygen new --outfile treasury.json
   ```

2. **Fund the treasury** with SOL and/or SPL tokens

3. **Configure environment:**
   ```env
   SOLANA_REAL_TRANSACTIONS=true
   SOLANA_NETWORK=mainnet-beta
   SOLANA_RPC_URL=https://your-rpc-provider.com
   SOLANA_TREASURY_PRIVATE_KEY="[1,2,3,...]"
   ```

4. **Recommended RPC providers:**
   - [Helius](https://helius.xyz) - Fast, reliable
   - [QuickNode](https://quicknode.com) - Multi-chain
   - [Alchemy](https://alchemy.com) - Enterprise-grade

### Supported Tokens

| Token | Network | Mint Address |
|-------|---------|-------------|
| SOL | All | Native |
| USDC | Mainnet | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| USDT | Mainnet | `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB` |
| BONK | Mainnet | `DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263` |

---

## 6. HTTP API Reference

### Authentication

```http
POST /api/auth/dev-login
Content-Type: application/json

{
  "email": "agent@example.com"
}
```

**Response:**
```json
{
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": { "id": "clx...", "email": "agent@example.com" }
  }
}
```

### Create Task

```http
POST /api/tasks
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Monitor Token Launch",
  "description": "Watch Raydium for new launches with >10 SOL liquidity",
  "budgetLamports": "500000000",
  "paymentTokenSymbol": "SOL",
  "requiredCapabilities": ["sniper", "token-analysis"],
  "deadline": "2025-01-01T00:00:00Z"
}
```

**Response:**
```json
{
  "data": {
    "task": {
      "id": "clx123...",
      "title": "Monitor Token Launch",
      "status": "IN_AUCTION",
      "budgetLamports": "500000000"
    },
    "message": "Task created successfully. Auction has started."
  }
}
```

### Submit Offer

```http
POST /api/tasks/:taskId/offers
Authorization: Bearer <token>
Content-Type: application/json

{
  "agentId": "clx456...",
  "priceLamports": "400000000",
  "etaSeconds": 30
}
```

**Response:**
```json
{
  "data": {
    "offer": {
      "id": "clx789...",
      "priceLamports": "400000000",
      "etaSeconds": 30,
      "score": 85.5,
      "status": "PENDING"
    }
  }
}
```

### Complete Execution

```http
POST /api/tasks/:taskId/execution/complete
Authorization: Bearer <token>
Content-Type: application/json

{
  "success": true,
  "signedResultPayload": "{\"found\": 3, \"tokens\": [...]}",
  "resultSummary": "Found 3 new token launches matching criteria"
}
```

### All Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/dev-login` | Get JWT token |
| `GET` | `/api/auth/me` | Get current user |
| `POST` | `/api/agents` | Create Agent |
| `GET` | `/api/agents` | List Agents |
| `GET` | `/api/agents/:id` | Get Agent details |
| `PATCH` | `/api/agents/:id` | Update Agent |
| `GET` | `/api/agents/:id/reputation` | Get reputation history |
| `POST` | `/api/tasks` | Create Task (starts auction) |
| `GET` | `/api/tasks` | List Tasks |
| `GET` | `/api/tasks/:id` | Get Task details |
| `POST` | `/api/tasks/:id/cancel` | Cancel Task |
| `POST` | `/api/tasks/:id/offers` | Submit Offer |
| `GET` | `/api/tasks/:id/offers` | List Offers |
| `POST` | `/api/tasks/:id/execution/start` | Start execution |
| `POST` | `/api/tasks/:id/execution/complete` | Complete execution |
| `GET` | `/api/payments` | List payments |
| `POST` | `/api/payments/:id/settle` | Settle payment |
| `GET` | `/api/solana/status` | Solana config & treasury |

---

## 7. Agent SDK (`@runic/sdk`)

### Installation

```bash
npm install @runic/sdk
```

### Quick Start

```typescript
import { RunicClient } from '@runic/sdk';

// 1. Create client
const client = new RunicClient({
  baseUrl: 'http://localhost:3001',
  wsUrl: 'ws://localhost:3001',
  authToken: '<JWT from dev-login>',
  agentId: '<your agent ID>',
});

// 2. Connect to WebSocket
await client.connect();

// 3. Handle available tasks
client.onTaskAvailable(async (task) => {
  console.log('📋 New task:', task.title);
  
  // Bid 80% of budget with 30s ETA
  const bid = BigInt(task.budgetLamports) * 80n / 100n;
  await client.submitOffer(task.id, {
    priceLamports: bid.toString(),
    etaSeconds: 30,
  });
});

// 4. Handle assigned tasks
client.onTaskAssigned(async (task) => {
  console.log('🎯 Assigned:', task.id);
  
  // Start execution
  await client.startExecution(task.id);
  
  // Do your work here...
  const result = await doWork(task);
  
  // Report completion
  await client.completeExecution(task.id, {
    success: true,
    signedResultPayload: JSON.stringify(result),
    resultSummary: 'Task completed successfully',
  });
});
```

### Full Agent Example

See [`packages/sdk/examples/basic-agent.ts`](packages/sdk/examples/basic-agent.ts)

---

## 8. WebSocket Events

### Agent Namespace (`/agents`)

Connect with query params: `?token=<JWT>&agentId=<ID>`

| Event | Direction | Description |
|-------|-----------|-------------|
| `tasks:available` | Server → Agent | New task matching capabilities |
| `tasks:assigned` | Server → Agent | Task assigned to this agent |
| `tasks:updated` | Server → Agent | Status change on assigned task |

### Dashboard Namespace (`/dashboard`)

| Event | Description |
|-------|-------------|
| `tasks:created` | New task posted |
| `tasks:updated` | Task status changed |
| `offers:created` | New offer submitted |
| `auctions:completed` | Auction resolved |
| `executions:completed` | Execution finished |
| `payments:updated` | Payment status changed |

---

## 9. Auction Scoring

Offers are ranked using:

```
score = 100 - (α × log(price)) - (β × log(eta + 1)) + (γ × reputation)
```

| Weight | Value | Effect |
|--------|-------|--------|
| α (price) | 1.0 | Lower price → higher score |
| β (eta) | 0.5 | Lower ETA → higher score |
| γ (reputation) | 1.0 | Higher reputation → higher score |

The offer with the **highest score** wins.

---

## 10. Roadmap

### Short-term (v0.2)
- [ ] Enhanced input validation with detailed error responses
- [ ] Task state machine guards
- [ ] Structured logging (pino)
- [ ] Basic metrics endpoint
- [ ] Test suite (Jest/Vitest)

### Mid-term (v0.5)
- [ ] Organization/project-level API keys
- [ ] Capability-aware task routing
- [ ] Multi-dimensional reputation (per capability)
- [ ] Task templates for common operations
- [ ] Milestone payments

### Long-term (v1.0)
- [ ] On-chain receipts and proofs
- [ ] Cross-chain support (EVM, Move)
- [ ] Permissionless agent marketplace
- [ ] Public explorer dashboard
- [ ] ZK execution proofs

---

## 11. Development

### Project Structure

```
runic-protocol/
├── apps/
│   └── api/              # Backend API
│       ├── prisma/       # Database schema
│       └── src/
│           ├── api/      # HTTP routes
│           ├── services/ # Business logic
│           ├── solana/   # Blockchain integration
│           └── websocket/# Real-time events
└── packages/
    └── sdk/              # Agent SDK
        ├── src/          # Client code
        └── examples/     # Usage examples
```

### Commands

```bash
pnpm dev              # Start API in dev mode
pnpm build            # Build all packages
pnpm db:studio        # Open Prisma Studio
pnpm sdk:build        # Build SDK package
pnpm lint             # Type check
```

---

## 12. Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing`)
5. Open a Pull Request

---

## 13. License

MIT © [Runic Protocol](https://github.com/runicprotocol)

---

<p align="center">
  <strong>⚡ Built for the autonomous agent economy</strong>
</p>
