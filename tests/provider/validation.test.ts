/**
 * Input validation and security tests for ConfigServerProvider.
 *
 * Tests input validation, HTTPS warnings, and security enforcement.
 * Focuses on required fields, URL validation, and HTTPS policy.
 */

import * as pulumi from '@pulumi/pulumi';
import { ConfigServerProvider } from '../../src/provider';
import { ConfigServerClient } from '../../src/client';
import { smallConfigResponse } from '../fixtures/config-server-responses';

// Mock the client module
jest.mock('../../src/client');

describe('ConfigServerProvider - Validation', () => {
  let provider: ConfigServerProvider;
  let mockFetchConfigWithRetry: jest.Mock;
  let mockWarn: jest.SpyInstance;

  beforeEach(() => {
    provider = new ConfigServerProvider();
    mockFetchConfigWithRetry = jest.fn();

    (ConfigServerClient as jest.Mock).mockImplementation(() => ({
      fetchConfigWithRetry: mockFetchConfigWithRetry,
    }));

    // Mock Pulumi logging
    mockWarn = jest.spyOn(pulumi.log, 'warn').mockImplementation();

    // Default success response
    mockFetchConfigWithRetry.mockResolvedValue(smallConfigResponse);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockWarn.mockRestore();
  });

  describe('Input Validation', () => {
    it('should validate required field: url', async () => {
      const inputs = {
        configServerUrl: '',
        application: 'test-app',
        profile: 'dev',
      };

      await expect(provider.create(inputs)).rejects.toThrow('configServerUrl is required');
    });

    it('should validate required field: application', async () => {
      const inputs = {
        configServerUrl: 'http://localhost:8888',
        application: '',
        profile: 'dev',
      };

      await expect(provider.create(inputs)).rejects.toThrow('application is required');
    });

    it('should validate required field: profile', async () => {
      const inputs = {
        configServerUrl: 'http://localhost:8888',
        application: 'test-app',
        profile: '',
      };

      await expect(provider.create(inputs)).rejects.toThrow('profile is required');
    });

    it('should handle optional fields (label, username, password)', async () => {
      const inputs = {
        configServerUrl: 'http://localhost:8888',
        application: 'test-app',
        profile: 'dev',
        // label, username, password omitted
      };

      const result = await provider.create(inputs);

      expect(result.outs.label).toBeUndefined();
      expect(result.outs.username).toBeUndefined();
      expect(result.outs.password).toBeUndefined();
    });

    it('should handle invalid URL format', async () => {
      const inputs = {
        configServerUrl: 'not-a-valid-url',
        application: 'test-app',
        profile: 'dev',
      };

      await expect(provider.create(inputs)).rejects.toThrow(
        'Invalid configServerUrl: not-a-valid-url'
      );
    });

    it('should handle empty string inputs for required fields', async () => {
      const inputs = {
        configServerUrl: '',
        application: '',
        profile: '',
      };

      await expect(provider.create(inputs)).rejects.toThrow('configServerUrl is required');
    });
  });

  describe('HTTPS Validation', () => {
    it('should trigger warning for HTTP URL (non-localhost)', async () => {
      const inputs = {
        configServerUrl: 'http://config-server.example.com:8888',
        application: 'test-app',
        profile: 'dev',
      };

      await provider.create(inputs);

      expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('[Security Warning]'));
      expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('HTTPS'));
    });

    it('should not trigger warning for HTTPS URL', async () => {
      const inputs = {
        configServerUrl: 'https://config-server.example.com:8888',
        application: 'test-app',
        profile: 'dev',
      };

      await provider.create(inputs);

      expect(mockWarn).not.toHaveBeenCalled();
    });

    it('should not trigger warning for HTTP localhost', async () => {
      const inputs = {
        configServerUrl: 'http://localhost:8888',
        application: 'test-app',
        profile: 'dev',
      };

      await provider.create(inputs);

      expect(mockWarn).not.toHaveBeenCalled();
    });

    it('should not trigger warning for HTTP 127.0.0.1', async () => {
      const inputs = {
        configServerUrl: 'http://127.0.0.1:8888',
        application: 'test-app',
        profile: 'dev',
      };

      await provider.create(inputs);

      expect(mockWarn).not.toHaveBeenCalled();
    });

    it('should throw error when enforceHttps: true with HTTP URL', async () => {
      const inputs = {
        configServerUrl: 'http://config-server.example.com:8888',
        application: 'test-app',
        profile: 'dev',
        enforceHttps: true,
      };

      await expect(provider.create(inputs)).rejects.toThrow('HTTPS is strongly recommended');
      await expect(provider.create(inputs)).rejects.toThrow(
        'Set enforceHttps: false to allow HTTP'
      );
    });

    it('should allow HTTP URL when enforceHttps: false (but warn)', async () => {
      const inputs = {
        configServerUrl: 'http://config-server.example.com:8888',
        application: 'test-app',
        profile: 'dev',
        enforceHttps: false,
      };

      const result = await provider.create(inputs);

      expect(result).toBeDefined();
      expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('[Security Warning]'));
    });
  });
});
