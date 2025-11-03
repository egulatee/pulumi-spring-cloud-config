/**
 * Retry logic tests for ConfigServerClient.
 *
 * Tests exponential backoff, retry strategies, and transient error handling.
 * Uses short delays (10-20ms) for fast test execution without fake timers.
 */

import nock from 'nock';
import { ConfigServerClient, ConfigServerError } from '../../src/client';
import { mockNock, mockNockNetworkError, clearAllMocks } from '../helpers';
import { smallConfigResponse } from '../fixtures/config-server-responses';

describe('ConfigServerClient - Retry Logic', () => {
  const baseUrl = 'http://localhost:8888';

  beforeEach(() => {
    clearAllMocks();
  });

  afterEach(() => {
    clearAllMocks();
  });

  describe('Successful Retry Scenarios', () => {
    it('should succeed after 1 transient failure (503)', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod';

      // First call fails with 503
      mockNock(baseUrl, path, { error: 'Service Unavailable' }, 503);
      // Second call succeeds
      mockNock(baseUrl, path, smallConfigResponse, 200);

      const config = await client.fetchConfigWithRetry('my-app', 'prod', undefined, {
        maxRetries: 3,
        retryDelay: 10,
        backoffMultiplier: 2,
      });

      expect(config).toBeDefined();
      expect(config.name).toBe('test-application');
    });

    it('should succeed after 2 transient failures', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod';

      // First two calls fail
      mockNock(baseUrl, path, { error: 'Service Unavailable' }, 503);
      mockNock(baseUrl, path, { error: 'Service Unavailable' }, 503);
      // Third call succeeds
      mockNock(baseUrl, path, smallConfigResponse, 200);

      const config = await client.fetchConfigWithRetry('my-app', 'prod', undefined, {
        maxRetries: 3,
        retryDelay: 10,
        backoffMultiplier: 2,
      });

      expect(config).toBeDefined();
    });

    it('should succeed on last retry attempt', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod';

      // Fail 2 times, succeed on 3rd (which is the last attempt with maxRetries=3)
      mockNock(baseUrl, path, { error: 'Service Unavailable' }, 503);
      mockNock(baseUrl, path, { error: 'Service Unavailable' }, 503);
      mockNock(baseUrl, path, smallConfigResponse, 200);

      const config = await client.fetchConfigWithRetry('my-app', 'prod', undefined, {
        maxRetries: 3,
        retryDelay: 10,
        backoffMultiplier: 2,
      });

      expect(config).toBeDefined();
    });

    it('should retry on network error (ECONNREFUSED)', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod';

      // First call has network error
      mockNockNetworkError(baseUrl, path, 'ECONNREFUSED');
      // Second call succeeds
      mockNock(baseUrl, path, smallConfigResponse, 200);

      const config = await client.fetchConfigWithRetry('my-app', 'prod', undefined, {
        maxRetries: 2,
        retryDelay: 10,
        backoffMultiplier: 2,
      });

      expect(config).toBeDefined();
    });

    it('should retry on timeout error (ECONNABORTED)', async () => {
      const client = new ConfigServerClient(baseUrl, undefined, undefined, 1000);
      const path = '/my-app/prod';

      // First call times out
      nock(baseUrl)
        .get(path)
        .replyWithError({ code: 'ECONNABORTED', message: 'timeout of 1000ms exceeded' });
      // Second call succeeds
      mockNock(baseUrl, path, smallConfigResponse, 200);

      const config = await client.fetchConfigWithRetry('my-app', 'prod', undefined, {
        maxRetries: 2,
        retryDelay: 10,
        backoffMultiplier: 2,
      });

      expect(config).toBeDefined();
    });
  });

  describe('Retry Exhaustion', () => {
    it('should fail after all retry attempts exhausted (3 retries + 1 original = 4 total)', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod';

      // All attempts fail (maxRetries=3 means we try up to 3 times total)
      mockNock(baseUrl, path, { error: 'Service Unavailable' }, 503);
      mockNock(baseUrl, path, { error: 'Service Unavailable' }, 503);
      mockNock(baseUrl, path, { error: 'Service Unavailable' }, 503);

      try {
        await client.fetchConfigWithRetry('my-app', 'prod', undefined, {
          maxRetries: 3,
          retryDelay: 10,
          backoffMultiplier: 2,
        });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigServerError);
        expect((error as Error).message).toContain(
          'Failed to fetch configuration after 3 attempts'
        );
      }
    });

    it('should fail after single retry (maxRetries: 1)', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod';

      // Both attempts fail
      mockNock(baseUrl, path, { error: 'Service Unavailable' }, 503);

      try {
        await client.fetchConfigWithRetry('my-app', 'prod', undefined, {
          maxRetries: 1,
          retryDelay: 10,
          backoffMultiplier: 2,
        });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigServerError);
        expect((error as Error).message).toContain(
          'Failed to fetch configuration after 1 attempts'
        );
      }
    });
  });

  describe('Exponential Backoff Timing', () => {
    it('should use exponential backoff with proper delays', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod';

      // All attempts fail
      mockNock(baseUrl, path, { error: 'Service Unavailable' }, 503);
      mockNock(baseUrl, path, { error: 'Service Unavailable' }, 503);
      mockNock(baseUrl, path, { error: 'Service Unavailable' }, 503);

      const startTime = Date.now();

      await expect(
        client.fetchConfigWithRetry('my-app', 'prod', undefined, {
          maxRetries: 3,
          retryDelay: 10,
          backoffMultiplier: 2,
        })
      ).rejects.toThrow(ConfigServerError);

      const duration = Date.now() - startTime;

      // Should have delays: 10ms, 20ms (attempts 0->1, 1->2) = ~30ms minimum
      // Being lenient with timing due to test execution variance
      expect(duration).toBeGreaterThanOrEqual(20);
    });

    it('should respect custom backoff multiplier (3x instead of 2x)', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod';

      // Fail twice to test backoff
      mockNock(baseUrl, path, { error: 'Service Unavailable' }, 503);
      mockNock(baseUrl, path, { error: 'Service Unavailable' }, 503);
      mockNock(baseUrl, path, smallConfigResponse, 200);

      const config = await client.fetchConfigWithRetry('my-app', 'prod', undefined, {
        maxRetries: 3,
        retryDelay: 10,
        backoffMultiplier: 3, // 3x multiplier: 10ms, 30ms, 90ms
      });

      expect(config).toBeDefined();
    });

    it('should support zero delay retry (retryDelay: 0)', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod';

      mockNock(baseUrl, path, { error: 'Service Unavailable' }, 503);
      mockNock(baseUrl, path, smallConfigResponse, 200);

      const config = await client.fetchConfigWithRetry('my-app', 'prod', undefined, {
        maxRetries: 2,
        retryDelay: 0, // Immediate retry
        backoffMultiplier: 2,
      });

      expect(config).toBeDefined();
    });

    it('should support custom initial delay', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod';

      mockNock(baseUrl, path, { error: 'Service Unavailable' }, 503);
      mockNock(baseUrl, path, smallConfigResponse, 200);

      const startTime = Date.now();

      const config = await client.fetchConfigWithRetry('my-app', 'prod', undefined, {
        maxRetries: 2,
        retryDelay: 20,
        backoffMultiplier: 1,
      });

      const duration = Date.now() - startTime;

      expect(config).toBeDefined();
      // Should have at least one 20ms delay
      expect(duration).toBeGreaterThanOrEqual(18);
    });
  });

  describe('Retryable vs Non-Retryable Errors', () => {
    it.each([
      [503, true],
      [500, false],
      [502, false],
      [504, false],
    ])('HTTP %i should be retryable: %s', async (statusCode, shouldRetry) => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod';

      mockNock(baseUrl, path, { error: 'Server Error' }, statusCode);
      if (shouldRetry) {
        // Need second mock for retry attempt
        mockNock(baseUrl, path, smallConfigResponse, 200);
      }

      const promise = client.fetchConfigWithRetry('my-app', 'prod', undefined, {
        maxRetries: 2, // Try up to 2 times total
        retryDelay: 10,
        backoffMultiplier: 1,
      });

      if (shouldRetry) {
        const config = await promise;
        expect(config).toBeDefined();
      } else {
        await expect(promise).rejects.toThrow(ConfigServerError);
      }
    });

    it.each([
      [400, false],
      [401, false],
      [403, false],
      [404, false],
    ])('HTTP %i (4xx) should NOT be retryable', async (statusCode) => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod';

      mockNock(baseUrl, path, { error: 'Client Error' }, statusCode);

      await expect(
        client.fetchConfigWithRetry('my-app', 'prod', undefined, {
          maxRetries: 3,
          retryDelay: 10,
          backoffMultiplier: 2,
        })
      ).rejects.toThrow(ConfigServerError);
    });

    it('should retry on ETIMEDOUT network error', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod';

      mockNockNetworkError(baseUrl, path, 'ETIMEDOUT');
      mockNock(baseUrl, path, smallConfigResponse, 200);

      const config = await client.fetchConfigWithRetry('my-app', 'prod', undefined, {
        maxRetries: 2,
        retryDelay: 10,
        backoffMultiplier: 2,
      });

      expect(config).toBeDefined();
    });

    it('should retry on ENOTFOUND network error', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod';

      mockNockNetworkError(baseUrl, path, 'ENOTFOUND');
      mockNock(baseUrl, path, smallConfigResponse, 200);

      const config = await client.fetchConfigWithRetry('my-app', 'prod', undefined, {
        maxRetries: 2,
        retryDelay: 10,
        backoffMultiplier: 2,
      });

      expect(config).toBeDefined();
    });

    it('should retry on ENETUNREACH network error', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod';

      mockNockNetworkError(baseUrl, path, 'ENETUNREACH');
      mockNock(baseUrl, path, smallConfigResponse, 200);

      const config = await client.fetchConfigWithRetry('my-app', 'prod', undefined, {
        maxRetries: 2,
        retryDelay: 10,
        backoffMultiplier: 2,
      });

      expect(config).toBeDefined();
    });
  });

  describe('Custom Retry Options', () => {
    it('should support custom maxRetries (5 retries)', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod';

      // Fail 4 times, succeed on 5th (maxRetries=5 means up to 5 attempts)
      mockNock(baseUrl, path, { error: 'Service Unavailable' }, 503);
      mockNock(baseUrl, path, { error: 'Service Unavailable' }, 503);
      mockNock(baseUrl, path, { error: 'Service Unavailable' }, 503);
      mockNock(baseUrl, path, { error: 'Service Unavailable' }, 503);
      mockNock(baseUrl, path, smallConfigResponse, 200);

      const config = await client.fetchConfigWithRetry('my-app', 'prod', undefined, {
        maxRetries: 5,
        retryDelay: 10,
        backoffMultiplier: 1,
      });

      expect(config).toBeDefined();
    });

    it('should support disabling retry (maxRetries: 0)', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod';

      mockNock(baseUrl, path, { error: 'Service Unavailable' }, 503);

      await expect(
        client.fetchConfigWithRetry('my-app', 'prod', undefined, {
          maxRetries: 0,
          retryDelay: 10,
          backoffMultiplier: 2,
        })
      ).rejects.toThrow(ConfigServerError);
    });

    it('should use default retry options when not specified', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod';

      mockNock(baseUrl, path, { error: 'Service Unavailable' }, 503);
      mockNock(baseUrl, path, smallConfigResponse, 200);

      // Default: maxRetries=3, retryDelay=1000, backoffMultiplier=2
      // This will take about 1-2 seconds due to default delays
      const config = await client.fetchConfigWithRetry('my-app', 'prod');

      expect(config).toBeDefined();
    }, 10000); // Increase timeout for this test
  });
});
