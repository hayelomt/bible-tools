import { ConflictException, Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pkg from '../package.json' with { type: 'json' };
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { Public } from '../src/auth/auth.decorators.js';
import { ApiException, ErrorCode } from '../src/common/errors.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

@Public()
@Controller('boom')
class BoomController {
  @Get('crash')
  crash(): never {
    throw new Error('secret internals');
  }

  @Get('conflict')
  conflict(): never {
    throw new ApiException(409, 'TAG_EXISTS', 'Tag already exists', { name: 'grace' });
  }

  @Get('builtin')
  builtin(): never {
    throw new ConflictException('Email taken', { errorCode: 'EMAIL_TAKEN' });
  }
}

describe('API app', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [BoomController],
    })
      // Unit tests have no database; the integration suite runs the real one (test/*.int.test.ts).
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: async () => [] })
      .compile();
    // No logger: the crash test would print its expected stack trace.
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health returns the version', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', version: pkg.version });
  });

  it('an unknown route returns the error shape with NOT_FOUND', async () => {
    const res = await request(app.getHttpServer()).get('/api/nope').expect(404);
    expect(res.body).toMatchObject({ statusCode: 404, errorCode: ErrorCode.NOT_FOUND });
    expect(res.body.message).toEqual(expect.any(String));
  });

  it('an ApiException keeps its code and details', async () => {
    const res = await request(app.getHttpServer()).get('/api/boom/conflict').expect(409);
    expect(res.body).toEqual({
      statusCode: 409,
      errorCode: 'TAG_EXISTS',
      message: 'Tag already exists',
      details: { name: 'grace' },
    });
  });

  it('a built-in exception keeps the errorCode option', async () => {
    const res = await request(app.getHttpServer()).get('/api/boom/builtin').expect(409);
    expect(res.body).toEqual({ statusCode: 409, errorCode: 'EMAIL_TAKEN', message: 'Email taken' });
  });

  it('an unexpected error returns INTERNAL_ERROR without leaking its message', async () => {
    const res = await request(app.getHttpServer()).get('/api/boom/crash').expect(500);
    expect(res.body).toEqual({
      statusCode: 500,
      errorCode: ErrorCode.INTERNAL_ERROR,
      message: 'Internal server error',
    });
  });

  it('echoes or creates an x-request-id', async () => {
    const echoed = await request(app.getHttpServer()).get('/api/health').set('x-request-id', 'abc');
    expect(echoed.headers['x-request-id']).toBe('abc');
    const created = await request(app.getHttpServer()).get('/api/health');
    expect(created.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});
