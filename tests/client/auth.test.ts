/**
 * Authentication tests for ConfigServerClient.
 *
 * Tests Basic Authentication, credential handling, and security measures.
 */

import nock from 'nock';
import { ConfigServerClient, ConfigServerError } from '../../src/client';
import { mockNock, clearAllMocks } from '../helpers';
import { smallConfigResponse } from '../fixtures/config-server-responses';

describe('ConfigServerClient - Authentication', () => {
  const baseUrl = 'http://localhost:8888';

  beforeEach(() => {
    clearAllMocks();
  });

  afterEach(() => {
    clearAllMocks();
  });

  describe('Basic Auth', () => {
    it('should send Basic Auth with valid credentials (username + password)', async () => {
      const client = new ConfigServerClient(baseUrl, 'testuser', 'testpass');
      const path = '/my-app/prod';

      // Mock with auth expectation
      nock(baseUrl)
        .get(path)
        .basicAuth({ user: 'testuser', pass: 'testpass' })
        .reply(200, smallConfigResponse);

      const config = await client.fetchConfig('my-app', 'prod');
      expect(config).toBeDefined();
      expect(config.name).toBe('test-application');
    });

    it('should format Basic Auth header correctly (Base64 encoded)', async () => {
      const client = new ConfigServerClient(baseUrl, 'admin', 'secret123');
      const path = '/my-app/prod';

      let receivedAuthHeader = '';
      nock(baseUrl)
        .get(path)
        .matchHeader('authorization', (val) => {
          receivedAuthHeader = val;
          // Basic Auth format: "Basic <base64(username:password)>"
          return val.startsWith('Basic ');
        })
        .reply(200, smallConfigResponse);

      await client.fetchConfig('my-app', 'prod');

      expect(receivedAuthHeader).toMatch(/^Basic [A-Za-z0-9+/=]+$/);
      // Decode and verify (admin:secret123 -> YWRtaW46c2VjcmV0MTIz)
      const expectedAuth = 'Basic ' + Buffer.from('admin:secret123').toString('base64');
      expect(receivedAuthHeader).toBe(expectedAuth);
    });

    it('should make anonymous request when no credentials provided', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod';

      nock(baseUrl)
        .get(path)
        .matchHeader('authorization', (val) => {
          // Should not have authorization header
          return val === undefined;
        })
        .reply(200, smallConfigResponse);

      const config = await client.fetchConfig('my-app', 'prod');
      expect(config).toBeDefined();
    });

    it('should not send Authorization header when no credentials', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod';

      let hasAuthHeader = false;
      nock(baseUrl)
        .get(path)
        .matchHeader('authorization', (val) => {
          hasAuthHeader = val !== undefined;
          return true; // Accept the request anyway
        })
        .reply(200, smallConfigResponse);

      await client.fetchConfig('my-app', 'prod');
      expect(hasAuthHeader).toBe(false);
    });

    it('should handle credentials with special characters', async () => {
      const username = 'user@example.com';
      const password = 'p@ssw0rd!#$';
      const client = new ConfigServerClient(baseUrl, username, password);
      const path = '/my-app/prod';

      nock(baseUrl)
        .get(path)
        .basicAuth({ user: username, pass: password })
        .reply(200, smallConfigResponse);

      const config = await client.fetchConfig('my-app', 'prod');
      expect(config).toBeDefined();
    });

    it('should handle empty password', async () => {
      const client = new ConfigServerClient(baseUrl, 'user', '');
      const path = '/my-app/prod';

      // Don't check exact auth format, just verify it doesn't crash
      mockNock(baseUrl, path, smallConfigResponse);

      const config = await client.fetchConfig('my-app', 'prod');
      expect(config).toBeDefined();
    });
  });

  describe('Authentication Errors', () => {
    it('should handle 401 Unauthorized (invalid credentials)', async () => {
      const client = new ConfigServerClient(baseUrl, 'wronguser', 'wrongpass');
      const path = '/my-app/prod';

      mockNock(baseUrl, path, { error: 'Unauthorized' }, 401);

      try {
        await client.fetchConfig('my-app', 'prod');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigServerError);
        expect((error as Error).message).toContain('Authentication failed');
      }
    });

    it('should handle 403 Forbidden (insufficient permissions)', async () => {
      const client = new ConfigServerClient(baseUrl, 'limiteduser', 'pass');
      const path = '/my-app/prod';

      mockNock(baseUrl, path, { error: 'Forbidden' }, 403);

      try {
        await client.fetchConfig('my-app', 'prod');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigServerError);
        expect((error as Error).message).toContain('Access forbidden');
      }
    });
  });

  describe('Credential Sanitization in Errors', () => {
    it('should sanitize URL in error messages when credentials in URL', async () => {
      // Test URL sanitization when credentials are embedded in URL
      const urlWithCreds = 'http://testuser:testpass@localhost:8888';
      const client = new ConfigServerClient(urlWithCreds);
      const path = '/my-app/prod';

      mockNock(urlWithCreds, path, { error: 'Server Error' }, 500);

      try {
        await client.fetchConfig('my-app', 'prod');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigServerError);
        const configError = error as ConfigServerError;
        // Credentials should not appear in error message or URL property
        expect(configError.message).not.toContain('testuser');
        expect(configError.message).not.toContain('testpass');
        // URL property should have sanitized credentials
        expect(configError.url).toContain('***:***');
        expect(configError.url).not.toContain('testuser');
        expect(configError.url).not.toContain('testpass');
      }
    });

    it('should not leak credentials when provided as separate parameters', async () => {
      const username = 'sensitive-user';
      const password = 'sensitive-password';
      const client = new ConfigServerClient(baseUrl, username, password);
      const path = '/my-app/prod';

      mockNock(baseUrl, path, { error: 'Not Found' }, 404);

      try {
        await client.fetchConfig('my-app', 'prod');
        fail('Should have thrown an error');
      } catch (error) {
        const errorMessage = (error as Error).message;
        // Error messages should not contain the username or password
        expect(errorMessage).not.toContain(username);
        expect(errorMessage).not.toContain(password);
      }
    });

    it('should handle errors without leaking sensitive data', async () => {
      const password = 'super-secret-password-123';
      const client = new ConfigServerClient(baseUrl, 'admin', password);
      const path = '/my-app/prod';

      mockNock(baseUrl, path, { error: 'Server Error' }, 500);

      try {
        await client.fetchConfig('my-app', 'prod');
        fail('Should have thrown an error');
      } catch (error) {
        const errorMessage = (error as Error).message;
        expect(errorMessage).not.toContain(password);
      }
    });

    it('should sanitize credentials in 401 errors', async () => {
      const urlWithCreds = 'http://user1:pass1@localhost:8888';
      const client = new ConfigServerClient(urlWithCreds);
      const path = '/my-app/prod';

      mockNock(urlWithCreds, path, { error: 'Unauthorized' }, 401);

      try {
        await client.fetchConfig('my-app', 'prod');
        fail('Should have thrown an error');
      } catch (error) {
        const configError = error as ConfigServerError;
        // Credentials should not leak in message or URL property
        expect(configError.message).not.toContain('user1');
        expect(configError.message).not.toContain('pass1');
        expect(configError.url).toContain('***:***');
        expect(configError.url).not.toContain('user1');
        expect(configError.url).not.toContain('pass1');
      }
    });

    it('should sanitize credentials in network errors', async () => {
      const urlWithCreds = 'http://user2:pass2@localhost:8888';
      const client = new ConfigServerClient(urlWithCreds);
      const path = '/my-app/prod';

      const networkError = new Error('Connection refused');
      (networkError as NodeJS.ErrnoException).code = 'ECONNREFUSED';
      nock(urlWithCreds).get(path).replyWithError(networkError);

      try {
        await client.fetchConfig('my-app', 'prod');
        fail('Should have thrown an error');
      } catch (error) {
        const configError = error as ConfigServerError;
        // Network error messages include the base URL, should be sanitized
        expect(configError.message).toContain('***:***');
        expect(configError.message).not.toContain('user2');
        expect(configError.message).not.toContain('pass2');
      }
    });
  });

  describe('ConfigServerError Properties', () => {
    it('should include statusCode in error for HTTP errors', async () => {
      const client = new ConfigServerClient(baseUrl, 'user', 'pass');
      const path = '/my-app/prod';

      mockNock(baseUrl, path, { error: 'Unauthorized' }, 401);

      try {
        await client.fetchConfig('my-app', 'prod');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigServerError);
        expect((error as ConfigServerError).statusCode).toBe(401);
      }
    });

    it('should include application and profile in error context', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/order-service/production';

      mockNock(baseUrl, path, { error: 'Not Found' }, 404);

      try {
        await client.fetchConfig('order-service', 'production');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigServerError);
        expect((error as ConfigServerError).application).toBe('order-service');
        expect((error as ConfigServerError).profile).toBe('production');
      }
    });

    it('should include sanitized URL in error context', async () => {
      const urlWithCreds = 'http://admin:secret@localhost:8888';
      const client = new ConfigServerClient(urlWithCreds);
      const path = '/my-app/prod';

      mockNock(urlWithCreds, path, { error: 'Error' }, 500);

      try {
        await client.fetchConfig('my-app', 'prod');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigServerError);
        const errorUrl = (error as ConfigServerError).url;
        expect(errorUrl).toBeDefined();
        expect(errorUrl).toContain('***:***');
        expect(errorUrl).not.toContain('admin');
        expect(errorUrl).not.toContain('secret');
      }
    });
  });
});
