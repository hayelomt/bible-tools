import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';

export interface TestApp {
  app: INestApplication;
  /** The app's own Prisma client, connected to lamp_test, for arranging and checking rows. */
  prisma: PrismaService;
  /** The HTTP server to hand to supertest's `request()`. */
  server: ReturnType<INestApplication['getHttpServer']>;
}

/** Boots the real AppModule (real Postgres, no mocks) with the same setup as `main.ts`. */
export async function createTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();
  return { app, prisma: app.get(PrismaService), server: app.getHttpServer() };
}
