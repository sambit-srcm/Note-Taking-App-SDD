import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';

const origin = 'http://127.0.0.1:5173';

describe('cors', () => {
  const app = createApp({ webOrigin: origin });

  it('allows the configured web origin', async () => {
    const response = await request(app).get('/api/health').set('Origin', origin);
    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe(origin);
  });

  it('answers a preflight without a body', async () => {
    const response = await request(app).options('/api/auth/login').set('Origin', origin);
    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-methods']).toContain('POST');
  });

  it('does not allow a different origin', async () => {
    const response = await request(app).get('/api/health').set('Origin', 'http://evil.example');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
