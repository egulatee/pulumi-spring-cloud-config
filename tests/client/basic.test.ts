/**
 * Basic functionality tests for ConfigServerClient.
 *
 * Tests core HTTP operations, URL construction, and response parsing.
 */

import { ConfigServerClient } from '../../src/client';
import { mockNock, clearAllMocks } from '../helpers';
import {
  smallConfigResponse,
  mediumConfigResponse,
  multiSourceResponse,
  emptyResponse,
} from '../fixtures/config-server-responses';

describe('ConfigServerClient - Basic Functionality', () => {
  const baseUrl = 'http://localhost:8888';

  beforeEach(() => {
    clearAllMocks();
  });

  afterEach(() => {
    clearAllMocks();
  });

  describe('Client Instantiation', () => {
    it('should create client instance with minimal config (just URL)', () => {
      const client = new ConfigServerClient(baseUrl);
      expect(client).toBeDefined();
      expect(client).toBeInstanceOf(ConfigServerClient);
    });

    it('should create client instance with all options', () => {
      const client = new ConfigServerClient(baseUrl, 'user', 'pass', 15000, true);
      expect(client).toBeDefined();
      expect(client).toBeInstanceOf(ConfigServerClient);
    });

    it('should create client with authentication', () => {
      const client = new ConfigServerClient(baseUrl, 'admin', 'secret123');
      expect(client).toBeDefined();
    });

    it('should create client with custom timeout', () => {
      const client = new ConfigServerClient(baseUrl, undefined, undefined, 30000);
      expect(client).toBeDefined();
    });

    it('should create client with debug enabled', () => {
      const client = new ConfigServerClient(baseUrl, undefined, undefined, 10000, true);
      expect(client).toBeDefined();
    });
  });

  describe('URL Construction', () => {
    it('should construct URL correctly: /{application}/{profile}', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod';
      mockNock(baseUrl, path, smallConfigResponse);

      const config = await client.fetchConfig('my-app', 'prod');
      expect(config).toBeDefined();
      expect(config.name).toBe('test-application');
    });

    it('should construct URL correctly with label: /{application}/{profile}/{label}', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod/main';
      mockNock(baseUrl, path, smallConfigResponse);

      const config = await client.fetchConfig('my-app', 'prod', 'main');
      expect(config).toBeDefined();
      expect(config.name).toBe('test-application');
    });

    it('should handle application name with special characters', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app-service/prod';
      mockNock(baseUrl, path, smallConfigResponse);

      const config = await client.fetchConfig('my-app-service', 'prod');
      expect(config).toBeDefined();
    });

    it('should handle profile with special characters (dash, underscore)', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod-east_us';
      mockNock(baseUrl, path, smallConfigResponse);

      const config = await client.fetchConfig('my-app', 'prod-east_us');
      expect(config).toBeDefined();
    });

    it('should handle multiple profiles correctly', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod,east';
      const multiProfileResponse = {
        ...smallConfigResponse,
        profiles: ['prod', 'east'],
      };
      mockNock(baseUrl, path, multiProfileResponse);

      const config = await client.fetchConfig('my-app', 'prod,east');
      expect(config.profiles).toEqual(['prod', 'east']);
    });

    it('should handle label with special characters', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod/v1.0.0';
      mockNock(baseUrl, path, smallConfigResponse);

      const config = await client.fetchConfig('my-app', 'prod', 'v1.0.0');
      expect(config).toBeDefined();
    });
  });

  describe('Response Parsing', () => {
    it('should fetch and parse configuration successfully', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod';
      mockNock(baseUrl, path, smallConfigResponse);

      const config = await client.fetchConfig('my-app', 'prod');

      expect(config).toBeDefined();
      expect(config.name).toBe('test-application');
      expect(config.profiles).toEqual(['dev']);
      expect(config.propertySources).toBeDefined();
      expect(config.propertySources.length).toBeGreaterThan(0);
    });

    it('should parse response name, profiles, and propertySources correctly', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/order-service/prod';
      mockNock(baseUrl, path, smallConfigResponse);

      const config = await client.fetchConfig('order-service', 'prod');

      expect(config.name).toBe('test-application');
      expect(Array.isArray(config.profiles)).toBe(true);
      expect(Array.isArray(config.propertySources)).toBe(true);
    });

    it('should handle response with empty propertySources array', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod';
      mockNock(baseUrl, path, emptyResponse);

      const config = await client.fetchConfig('my-app', 'prod');

      expect(config.propertySources).toEqual([]);
      expect(config.propertySources.length).toBe(0);
    });

    it('should handle response with single property source', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod';
      mockNock(baseUrl, path, smallConfigResponse);

      const config = await client.fetchConfig('my-app', 'prod');

      expect(config.propertySources.length).toBe(1);
      expect(config.propertySources[0]).toHaveProperty('name');
      expect(config.propertySources[0]).toHaveProperty('source');
    });

    it('should handle response with multiple property sources', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod';
      mockNock(baseUrl, path, multiSourceResponse);

      const config = await client.fetchConfig('my-app', 'prod');

      expect(config.propertySources.length).toBeGreaterThan(1);
      config.propertySources.forEach((source) => {
        expect(source).toHaveProperty('name');
        expect(source).toHaveProperty('source');
      });
    });

    it('should handle property source with complex nested objects', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod';
      const complexResponse = {
        ...smallConfigResponse,
        propertySources: [
          {
            name: 'test-source',
            source: {
              'nested.object.property': 'value',
              'deep.nested.config.setting': 'configured',
            },
          },
        ],
      };
      mockNock(baseUrl, path, complexResponse);

      const config = await client.fetchConfig('my-app', 'prod');

      expect(config.propertySources[0].source['nested.object.property']).toBe('value');
      expect(config.propertySources[0].source['deep.nested.config.setting']).toBe('configured');
    });

    it('should handle property source with arrays in values', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod';
      const arrayResponse = {
        ...smallConfigResponse,
        propertySources: [
          {
            name: 'test-source',
            source: {
              'allowed.origins': ['http://localhost:3000', 'https://example.com'],
              'feature.flags': [true, false, true],
            },
          },
        ],
      };
      mockNock(baseUrl, path, arrayResponse);

      const config = await client.fetchConfig('my-app', 'prod');

      expect(Array.isArray(config.propertySources[0].source['allowed.origins'])).toBe(true);
      expect(Array.isArray(config.propertySources[0].source['feature.flags'])).toBe(true);
    });
  });

  describe('Large Configuration Handling', () => {
    it('should handle medium-sized config (~100 properties)', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod';
      mockNock(baseUrl, path, mediumConfigResponse);

      const config = await client.fetchConfig('my-app', 'prod');

      expect(config).toBeDefined();
      expect(config.propertySources).toBeDefined();
      expect(config.propertySources.length).toBeGreaterThan(0);
    });
  });

  describe('fetchConfigWithRetry - Basic Success', () => {
    it('should fetch configuration successfully on first attempt', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod';
      mockNock(baseUrl, path, smallConfigResponse);

      const config = await client.fetchConfigWithRetry('my-app', 'prod');

      expect(config).toBeDefined();
      expect(config.name).toBe('test-application');
    });

    it('should fetch configuration with label successfully', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod/main';
      mockNock(baseUrl, path, smallConfigResponse);

      const config = await client.fetchConfigWithRetry('my-app', 'prod', 'main');

      expect(config).toBeDefined();
    });

    it('should fetch configuration with custom retry options', async () => {
      const client = new ConfigServerClient(baseUrl);
      const path = '/my-app/prod';
      mockNock(baseUrl, path, smallConfigResponse);

      const config = await client.fetchConfigWithRetry('my-app', 'prod', undefined, {
        maxRetries: 5,
        retryDelay: 500,
        backoffMultiplier: 3,
      });

      expect(config).toBeDefined();
    });
  });
});
