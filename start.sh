#!/bin/bash
# flowycash startup — ensures DB is running, seeds if empty, starts app

set -e

echo "🔄 Starting Prisma dev database..."
npx prisma dev &
PRISMA_PID=$!

# Wait for DB to be ready
echo "⏳ Waiting for database on port 51214..."
for i in {1..30}; do
  if lsof -i :51214 >/dev/null 2>&1; then
    echo "✅ Database is ready"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "❌ Database failed to start after 30 seconds"
    exit 1
  fi
  sleep 1
done

# Check if data exists, seed if empty
echo "🔍 Checking for data..."
COUNT=$(npx tsx -e "
import 'dotenv/config';
import { PrismaClient } from './src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
const adapter = new PrismaPg(process.env.DIRECT_DATABASE_URL || 'postgres://postgres:postgres@localhost:51214/template1?sslmode=disable');
const prisma = new PrismaClient({ adapter });
prisma.transaction.count().then(c => { console.log(c); prisma.\$disconnect(); });
" 2>/dev/null)

if [ "$COUNT" = "0" ] || [ -z "$COUNT" ]; then
  echo "📦 No data found — running seed..."
  npx tsx prisma/seed.ts
  echo "✅ Seed complete"
else
  echo "✅ Found $COUNT transactions"
fi

# Auto-backup before starting
echo "💾 Creating auto-backup..."
mkdir -p backups
curl -s http://localhost:51213 >/dev/null 2>&1 || true
npx tsx -e "
import 'dotenv/config';
import { PrismaClient } from './src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import fs from 'fs';
const adapter = new PrismaPg(process.env.DIRECT_DATABASE_URL || 'postgres://postgres:postgres@localhost:51214/template1?sslmode=disable');
const prisma = new PrismaClient({ adapter });
async function backup() {
  const [transactions, overrides, balanceResets, settings] = await Promise.all([
    prisma.transaction.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.override.findMany(),
    prisma.balanceReset.findMany(),
    prisma.settings.findFirst({ where: { id: 'default' } }),
  ]);
  const data = { exportedAt: new Date().toISOString(), version: 1, settings: { startingBalance: settings?.startingBalance ?? 0 }, transactions, overrides, balanceResets };
  const file = 'backups/auto-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  console.log('Backed up to ' + file);
  await prisma.\$disconnect();
}
backup();
" 2>/dev/null
echo "✅ Backup saved to backups/"

# Start Next.js
echo "🚀 Starting flowycash on http://localhost:3000"
npm run dev

# Cleanup on exit
trap "kill $PRISMA_PID 2>/dev/null" EXIT
