import type { Request, Response } from 'express';
import { prisma } from '@/infra/prisma';

interface HealthResponse {
  status: 'ok' | 'degraded';
  uptime_s: number;
  database: 'up' | 'down';
  timestamp: string;
}

export async function getHealth(_req: Request, res: Response): Promise<void> {
  let database: 'up' | 'down' = 'up';

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = 'down';
  }

  const response: HealthResponse = {
    status: database === 'up' ? 'ok' : 'degraded',
    uptime_s: Math.floor(process.uptime()),
    database,
    timestamp: new Date().toISOString(),
  };

  res.status(database === 'up' ? 200 : 503).json(response);
}
