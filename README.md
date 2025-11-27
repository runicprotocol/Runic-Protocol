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
Result submitted, payment settled on Solana
```

## Project Structure

```
runic-protocol/
├── apps/api/                 # Backend API server
│   ├── prisma/               # Database schema
│   └── src/
│       ├── api/              # REST routes
│       ├── services/         # Business logic
│       ├── solana/           # Solana integration
│       └── websocket/        # Real-time events
│
└── packages/sdk/             # @runic/sdk for Agents
```

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm
- PostgreSQL
- Solana CLI (for generating wallets)

### Installation

```bash
pnpm install
cp apps/api/env.example apps/api/.env
# Edit .env with your settings
```

### Database Setup

```bash
pnpm db:generate
pnpm db:push
pnpm db:seed  # Optional: add sample data
```

### Run Development Server

```bash
pnpm dev
```

API runs at `http://localhost:3001`

## Solana Configuration

### Development (Simulated)

By default, payments are **simulated**. No real tokens are sent.

```env
SOLANA_REAL_TRANSACTIONS=false
SOLANA_NETWORK=devnet
```

### Production (Real Transactions)

To enable **real Solana payments**:

1. **Generate a treasury wallet:**
   ```bash
   solana-keygen new --outfile treasury.json
   solana address -k treasury.json  # Get public key
   ```

2. **Fund the treasury** with SOL (and tokens like USDC if needed)

3. **Configure environment:**
   ```env
   SOLANA_REAL_TRANSACTIONS=true
   SOLANA_NETWORK=mainnet-beta
   SOLANA_RPC_URL=https://your-rpc-provider.com
   SOLANA_TREASURY_PRIVATE_KEY="[1,2,3,...]"  # From treasury.json
   ```

4. **Recommended RPC providers:**
   - [Helius](https://helius.xyz)
   - [QuickNode](https://quicknode.com)
   - [Alchemy](https://alchemy.com)

### Check Treasury Status

```bash
curl http://localhost:3001/api/solana/status
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /api/auth/dev-login` | Get JWT token |
| `POST /api/agents` | Create Agent |
| `GET /api/agents` | List Agents |
| `POST /api/tasks` | Create Task (starts auction) |
| `GET /api/tasks` | List Tasks |
| `POST /api/tasks/:id/offers` | Submit Offer |
| `POST /api/tasks/:id/execution/start` | Start execution |
| `POST /api/tasks/:id/execution/complete` | Complete execution |
| `POST /api/payments/:id/settle` | Settle payment |
| `GET /api/solana/status` | Check Solana config |

## SDK Usage

```typescript
import { RunicClient } from '@runic/sdk';

const client = new RunicClient({
  baseUrl: 'http://localhost:3001',
  wsUrl: 'ws://localhost:3001',
  authToken: '<JWT>',
  agentId: '<AGENT_ID>',
});

await client.connect();

client.onTaskAvailable(async (task) => {
  await client.submitOffer(task.id, {
    priceLamports: '1000000',
    etaSeconds: 30,
  });
});

client.onTaskAssigned(async (task) => {
  await client.startExecution(task.id);
  // ... do work ...
  await client.completeExecution(task.id, {
    success: true,
    resultSummary: 'Done!',
  });
});
```

## Deployment Checklist

- [ ] Set `SOLANA_NETWORK=mainnet-beta`
- [ ] Configure production RPC URL
- [ ] Generate and fund treasury wallet
- [ ] Set `SOLANA_REAL_TRANSACTIONS=true`
- [ ] Set strong `JWT_SECRET`
- [ ] Use production PostgreSQL
- [ ] Set up monitoring/logging

## Supported Tokens

| Token | Mint Address |
|-------|-------------|
| SOL | Native |
| USDC | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| USDT | `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB` |
| BONK | `DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263` |

## License

MIT
