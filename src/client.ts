// HTTP client for Spring Cloud Config Server
// Handles authentication, retries, and error handling

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { ConfigServerResponse } from './types';

/**
 * Client for interacting with Spring Cloud Config Server
 */
export class ConfigServerClient {
  private readonly axios: AxiosInstance;

  constructor(configServerUrl: string, username?: string, password?: string, timeout = 10000) {
    const config: AxiosRequestConfig = {
      baseURL: configServerUrl,
      timeout,
      headers: {
        Accept: 'application/json',
      },
    };

    if (username && password) {
      config.auth = {
        username,
        password,
      };
    }

    this.axios = axios.create(config);
  }

  /**
   * Fetch configuration from the config server
   */
  async fetchConfig(
    application: string,
    profile: string,
    label?: string
  ): Promise<ConfigServerResponse> {
    const url = label ? `/${application}/${profile}/${label}` : `/${application}/${profile}`;

    const response = await this.axios.get<ConfigServerResponse>(url);
    return response.data;
  }
}
