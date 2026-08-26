'use strict';

const request = require('supertest');
const { createApp } = require('../src/app');

const app = createApp();

describe('HTTP 接口', () => {
  test('GET /health 返回 ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.version).toBe('string');
  });

  test('GET /api/greet?name=Qoder 返回问候语', async () => {
    const res = await request(app).get('/api/greet').query({ name: 'Qoder' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Hello, Qoder!' });
  });

  test('GET /api/greet 不带参数走默认值', async () => {
    const res = await request(app).get('/api/greet');
    expect(res.body).toEqual({ message: 'Hello, World!' });
  });

  test('未知路径返回 404', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
  });
});
