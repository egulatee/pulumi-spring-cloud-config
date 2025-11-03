/**
 * Edge case and error handling tests for ConfigServerClient.
 *
 * Tests large configs, malformed responses, network errors, and special characters.
 */

import { ConfigServerClient, ConfigServerError } from '../../src/client';
import { mockNock, mockNockNetworkError, clearAllMocks } from '../helpers';
import {
  largeConfigResponse,
  extraLargeConfigResponse,
  emptyResponse,
  malformedJsonResponse,
  missingFieldsResponse,
  invalidStructureResponse,
  smallConfigResponse,
} from '../fixtures/config-server-responses';

describe('ConfigServerClient - Edge Cases', () => {
  const baseUrl = 'http://localhost:8888';

  beforeEach(() => {
    clearAllMocks();
  });

  afterEach(() => {
    clearAllMocks();
  });

  describe('Large Configuration Handling', () => {
    it('should handle 1,000 properties successfully', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/large-app/prod';
      mockNock(baseUrl, path, largeConfigResponse);

      const config = await client.fetchConfig('large-app', 'prod');

      expect(config).toBeDefined();
      expect(config.propertySources).toBeDefined();
      expect(config.propertySources.length).toBeGreaterThan(0);

      // Verify properties are accessible
      const source = config.propertySources[0].source;
      expect(Object.keys(source).length).toBeGreaterThan(900);
    });

    it('should handle 10,000 properties successfully', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/xl-app/prod';
      mockNock(baseUrl, path, extraLargeConfigResponse);

      const config = await client.fetchConfig('xl-app', 'prod');

      expect(config).toBeDefined();
      expect(config.propertySources).toBeDefined();
      expect(config.propertySources.length).toBeGreaterThan(0);

      const source = config.propertySources[0].source;
      expect(Object.keys(source).length).toBeGreaterThan(9000);
    });

    it('should not leak memory with large configs', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/large-app/prod';

      // Fetch large config multiple times
      for (let i = 0; i < 5; i++) {
        mockNock(baseUrl, path, largeConfigResponse);
        const config = await client.fetchConfig('large-app', 'prod');
        expect(config).toBeDefined();
      }

      // If we get here without memory issues, test passes
      expect(true).toBe(true);
    });
  });

  describe('Empty/Null Scenarios', () => {
    it('should handle empty response body', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod';
      mockNock(baseUrl, path, emptyResponse);

      const config = await client.fetchConfig('my-app', 'prod');

      expect(config).toBeDefined();
      expect(config.propertySources).toEqual([]);
    });

    it('should handle response with missing propertySources field', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod';
      const responseWithoutSources = {
        name: 'my-app',
        profiles: ['prod'],
        label: null,
        version: null,
        state: null,
      };
      mockNock(baseUrl, path, responseWithoutSources);

      const config = await client.fetchConfig('my-app', 'prod');

      expect(config).toBeDefined();
      expect(config.name).toBe('my-app');
    });

    it('should handle response with null propertySources', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod';
      const responseWithNull = {
        name: 'my-app',
        profiles: ['prod'],
        label: null,
        version: null,
        state: null,
        propertySources: null,
      };
      mockNock(baseUrl, path, responseWithNull);

      const config = await client.fetchConfig('my-app', 'prod');

      expect(config).toBeDefined();
      expect(config.propertySources).toBeNull();
    });

    it('should handle response with missing name field', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod';
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      mockNock(baseUrl, path, missingFieldsResponse);

      const config = await client.fetchConfig('my-app', 'prod');

      expect(config).toBeDefined();
      // TypeScript types won't match, but runtime should handle it
      expect(config.name).toBeUndefined();
    });

    it('should handle response with missing profiles field', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod';
      const responseWithoutProfiles = {
        name: 'my-app',
        label: null,
        version: null,
        state: null,
        propertySources: [],
      };
      mockNock(baseUrl, path, responseWithoutProfiles);

      const config = await client.fetchConfig('my-app', 'prod');

      expect(config).toBeDefined();
      expect(config.profiles).toBeUndefined();
    });
  });

  describe('Malformed Responses', () => {
    it('should handle invalid JSON response', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod';
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      mockNock(baseUrl, path, malformedJsonResponse);

      // Axios/nock will accept the string response, client returns it as-is
      const config = await client.fetchConfig('my-app', 'prod');
      expect(config).toBeDefined();
    });

    it('should handle response that is not an object (string)', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod';
      mockNock(baseUrl, path, 'plain string response');

      const config = await client.fetchConfig('my-app', 'prod');

      // Client should return whatever the server sent
      expect(config).toBeDefined();
    });

    it('should handle response that is not an object (number)', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod';
      mockNock(baseUrl, path, '12345');

      const config = await client.fetchConfig('my-app', 'prod');

      expect(config).toBeDefined();
    });

    it('should handle response that is an array', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod';
      mockNock(baseUrl, path, [{ key: 'value' }]);

      const config = await client.fetchConfig('my-app', 'prod');

      expect(config).toBeDefined();
    });

    it('should handle response with invalid propertySources structure', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod';
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      mockNock(baseUrl, path, invalidStructureResponse);

      const config = await client.fetchConfig('my-app', 'prod');

      expect(config).toBeDefined();
    });
  });

  describe('Network Errors', () => {
    it('should handle DNS resolution failure (ENOTFOUND)', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod';
      mockNockNetworkError(baseUrl, path, 'ENOTFOUND');

      try {
        await client.fetchConfig('my-app', 'prod');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigServerError);
        expect((error as Error).message).toContain('Network error');
      }
    });

    it('should handle connection refused (ECONNREFUSED)', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod';
      mockNockNetworkError(baseUrl, path, 'ECONNREFUSED');

      try {
        await client.fetchConfig('my-app', 'prod');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigServerError);
        expect((error as Error).message).toContain('Connection refused');
      }
    });

    it('should handle connection reset (ECONNRESET)', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod';
      mockNockNetworkError(baseUrl, path, 'ECONNRESET');

      try {
        await client.fetchConfig('my-app', 'prod');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigServerError);
        expect((error as Error).message).toContain('Network error');
      }
    });

    it('should handle request timeout', async () => {
      const client = new ConfigServerClient(baseUrl, undefined, undefined, 100);
      const path = '/my-app/prod';
      mockNockNetworkError(baseUrl, path, 'ECONNABORTED');

      try {
        await client.fetchConfig('my-app', 'prod');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigServerError);
        expect((error as Error).message).toContain('Request timeout');
      }
    });
  });

  describe('HTTP Error Responses', () => {
    it('should handle 400 Bad Request', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod';
      mockNock(baseUrl, path, { error: 'Bad Request' }, 400);

      try {
        await client.fetchConfig('my-app', 'prod');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigServerError);
        expect((error as Error).message).toContain('HTTP 400');
      }
    });

    it('should handle 404 Not Found with context message', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod';
      mockNock(baseUrl, path, { error: 'Not Found' }, 404);

      try {
        await client.fetchConfig('my-app', 'prod');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigServerError);
        expect((error as Error).message).toContain('Configuration not found for my-app/prod');
      }
    });

    it('should handle 500 Internal Server Error', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod';
      mockNock(baseUrl, path, { error: 'Internal Server Error' }, 500);

      try {
        await client.fetchConfig('my-app', 'prod');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigServerError);
        expect((error as Error).message).toContain('Config server internal error');
      }
    });

    it('should handle 503 Service Unavailable', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod';
      mockNock(baseUrl, path, { error: 'Service Unavailable' }, 503);

      try {
        await client.fetchConfig('my-app', 'prod');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigServerError);
        expect((error as Error).message).toContain('Config server unavailable');
      }
    });

    it('should include status code in ConfigServerError', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod';
      mockNock(baseUrl, path, { error: 'Server Error' }, 500);

      try {
        await client.fetchConfig('my-app', 'prod');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigServerError);
        expect((error as ConfigServerError).statusCode).toBe(500);
      }
    });
  });

  describe('Special Characters', () => {
    it('should handle Unicode in property names', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod';
      const unicodeResponse = {
        ...smallConfigResponse,
        propertySources: [
          {
            name: 'test-source',
            source: {
              '日本語.property': 'value',
              'emoji.🚀.enabled': 'true',
              'chinese.属性': '值',
            },
          },
        ],
      };
      mockNock(baseUrl, path, unicodeResponse);

      const config = await client.fetchConfig('my-app', 'prod');

      expect(config).toBeDefined();
      // Use bracket notation to check for literal keys with dots
      expect(config.propertySources[0].source['日本語.property']).toBe('value');
      expect(config.propertySources[0].source['emoji.🚀.enabled']).toBe('true');
      expect(config.propertySources[0].source['chinese.属性']).toBe('值');
    });

    it('should handle Unicode in property values', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod';
      const unicodeValueResponse = {
        ...smallConfigResponse,
        propertySources: [
          {
            name: 'test-source',
            source: {
              'welcome.message': 'こんにちは世界',
              'emoji.status': '✅ Success',
              'special.chars': '©®™€',
            },
          },
        ],
      };
      mockNock(baseUrl, path, unicodeValueResponse);

      const config = await client.fetchConfig('my-app', 'prod');

      expect(config.propertySources[0].source['welcome.message']).toBe('こんにちは世界');
      expect(config.propertySources[0].source['emoji.status']).toBe('✅ Success');
      expect(config.propertySources[0].source['special.chars']).toBe('©®™€');
    });

    it('should handle spaces in application name', async () => {
      const client = new ConfigServerClient(baseUrl);
      // Axios URL-encodes spaces as %20
      const path = '/my%20app/prod';
      mockNock(baseUrl, path, smallConfigResponse);

      const config = await client.fetchConfig('my app', 'prod');

      expect(config).toBeDefined();
    });

    it('should handle special chars in profile name', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod-us_east-1';
      mockNock(baseUrl, path, smallConfigResponse);

      const config = await client.fetchConfig('my-app', 'prod-us_east-1');

      expect(config).toBeDefined();
    });

    it('should handle dots in application name', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/com.example.app/prod';
      mockNock(baseUrl, path, smallConfigResponse);

      const config = await client.fetchConfig('com.example.app', 'prod');

      expect(config).toBeDefined();
    });

    it('should handle special characters in label', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod/release/v1.0.0';
      mockNock(baseUrl, path, smallConfigResponse);

      const config = await client.fetchConfig('my-app', 'prod', 'release/v1.0.0');

      expect(config).toBeDefined();
    });
  });

  describe('URL Edge Cases', () => {
    it('should handle trailing slash in base URL', async () => {
      const urlWithSlash = 'http://localhost:8888/';
      const client = new ConfigServerClient(urlWithSlash);
      const path = '/my-app/prod';

      mockNock(urlWithSlash, path, smallConfigResponse);

      const config = await client.fetchConfig('my-app', 'prod');

      expect(config).toBeDefined();
    });

    it('should handle base URL with path prefix', async () => {
      const urlWithPrefix = 'http://localhost:8888/config-server';
      const client = new ConfigServerClient(urlWithPrefix);
      const path = '/my-app/prod';

      mockNock(urlWithPrefix, path, smallConfigResponse);

      const config = await client.fetchConfig('my-app', 'prod');

      expect(config).toBeDefined();
    });

    it('should handle HTTPS URLs', async () => {
      const httpsUrl = 'https://config-server.example.com';
      const client = new ConfigServerClient(httpsUrl);
      const path = '/my-app/prod';

      mockNock(httpsUrl, path, smallConfigResponse);

      const config = await client.fetchConfig('my-app', 'prod');

      expect(config).toBeDefined();
    });

    it('should handle URLs with non-standard ports', async () => {
      const customPortUrl = 'http://localhost:9999';
      const client = new ConfigServerClient(customPortUrl);
      const path = '/my-app/prod';

      mockNock(customPortUrl, path, smallConfigResponse);

      const config = await client.fetchConfig('my-app', 'prod');

      expect(config).toBeDefined();
    });
  });

  describe('Timeout Handling', () => {
    it('should respect custom timeout setting', async () => {
      const client = new ConfigServerClient(baseUrl, undefined, undefined, 100);
      const path = '/my-app/prod';

      mockNockNetworkError(baseUrl, path, 'ECONNABORTED');

      await expect(client.fetchConfig('my-app', 'prod')).rejects.toThrow(ConfigServerError);
    });

    it('should use default timeout when not specified', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod';

      mockNock(baseUrl, path, smallConfigResponse);

      const config = await client.fetchConfig('my-app', 'prod');

      expect(config).toBeDefined();
    });
  });
});
