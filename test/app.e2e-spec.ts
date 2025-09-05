import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/heating (GET)', () => {
    return request(app.getHttpServer())
      .get('/heating')
      .expect(200);
  });

  it('/temperature-sensors (GET)', () => {
    return request(app.getHttpServer())
      .get('/temperature-sensors')
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
  });
});
