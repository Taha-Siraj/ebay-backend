/**
 * Basic Products API Tests
 * Run with: npm test
 */

const request = require('supertest');
const app = require('../src/app');
const { connectDB, disconnectDB } = require('../src/config/database');

describe('Products API', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await connectDB();
  });

  afterAll(async () => {
    await disconnectDB();
  });
  let testUser = {
    name: 'Product Test User',
    email: `producttest${Date.now()}@example.com`,
    password: 'test123456'
  };

  beforeAll(async () => {
    // Register and login
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send(testUser);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password
      });

    authToken = loginRes.body.token;
  });

  describe('GET /api/products', () => {
    it('should get products list for authenticated user', async () => {
      const res = await request(app)
        .get('/api/products')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should reject request without token', async () => {
      const res = await request(app)
        .get('/api/products')
        .expect(401);

      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/products', () => {
    it('should reject invalid eBay URL', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          ebayUrl: 'not-a-valid-url'
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should reject non-eBay URL', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          ebayUrl: 'https://www.amazon.com/product/123'
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    // Note: Actual product creation test would require mocking the eBay adapter
    // or having a valid eBay URL, which is skipped here
  });
});

