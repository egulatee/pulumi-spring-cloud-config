// Pulumi Dynamic Provider implementation
// Implements the create, read, update, diff lifecycle methods

import * as pulumi from '@pulumi/pulumi';
import { ConfigServerClient } from './client';
import { ConfigServerConfigArgs, ConfigServerResponse } from './types';

/**
 * Provider state stored by Pulumi
 */
export interface ConfigServerProviderState {
  configServerUrl: string;
  application: string;
  profile: string;
  label?: string;
  username?: string;
  password?: string;
  propertySources?: string[];
  timeout?: number;
  debug?: boolean;
  autoDetectSecrets?: boolean;
  enforceHttps?: boolean;
  config: ConfigServerResponse;
}

/**
 * Pulumi Dynamic Provider for Spring Cloud Config Server
 */
export class ConfigServerProvider implements pulumi.dynamic.ResourceProvider {
  async create(inputs: ConfigServerConfigArgs): Promise<pulumi.dynamic.CreateResult> {
    const client = new ConfigServerClient(
      inputs.configServerUrl as string,
      inputs.username as string | undefined,
      inputs.password as string | undefined,
      inputs.timeout as number | undefined
    );

    const config = await client.fetchConfig(
      inputs.application as string,
      inputs.profile as string,
      inputs.label as string | undefined
    );

    const state: ConfigServerProviderState = {
      configServerUrl: inputs.configServerUrl as string,
      application: inputs.application as string,
      profile: inputs.profile as string,
      label: inputs.label as string | undefined,
      username: inputs.username as string | undefined,
      password: inputs.password as string | undefined,
      propertySources: inputs.propertySources as string[] | undefined,
      timeout: inputs.timeout as number | undefined,
      debug: inputs.debug as boolean | undefined,
      autoDetectSecrets: inputs.autoDetectSecrets as boolean | undefined,
      enforceHttps: inputs.enforceHttps as boolean | undefined,
      config,
    };

    return {
      id: `${state.application}-${state.profile}`,
      outs: state,
    };
  }

  diff(
    _id: pulumi.ID,
    olds: ConfigServerProviderState,
    news: ConfigServerConfigArgs
  ): Promise<pulumi.dynamic.DiffResult> {
    // Smart diffing: Only refresh when inputs change
    const inputsChanged =
      olds.configServerUrl !== news.configServerUrl ||
      olds.application !== news.application ||
      olds.profile !== news.profile ||
      olds.label !== news.label ||
      olds.username !== news.username ||
      olds.password !== news.password ||
      JSON.stringify(olds.propertySources) !== JSON.stringify(news.propertySources);

    return Promise.resolve({
      changes: inputsChanged,
      replaces: [],
      stables: [],
    });
  }

  async update(
    _id: pulumi.ID,
    _olds: ConfigServerProviderState,
    news: ConfigServerConfigArgs
  ): Promise<pulumi.dynamic.UpdateResult> {
    // Update is essentially a re-create
    const result = await this.create(news);
    return {
      outs: result.outs as Record<string, unknown>,
    };
  }
}
