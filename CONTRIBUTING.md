# Contributing to @egulatee/pulumi-spring-cloud-config

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing to this project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Commit Guidelines](#commit-guidelines)
- [Testing](#testing)
- [Code Style](#code-style)
- [Pull Request Process](#pull-request-process)
- [Release Process](#release-process)

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). By participating, you are expected to uphold this code.

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- Git

### Fork and Clone

1. Fork the repository on GitHub
2. Clone your fork locally:

```bash
git clone https://github.com/YOUR_USERNAME/pulumi-spring-cloud-config.git
cd pulumi-spring-cloud-config
```

3. Add the upstream repository:

```bash
git remote add upstream https://github.com/egulatee/pulumi-spring-cloud-config.git
```

### Install Dependencies

```bash
npm install
```

### Build the Project

```bash
npm run build
```

## Development Workflow

### 1. Create a Branch

Always create a new branch for your work:

```bash
git checkout main
git pull upstream main
git checkout -b feature/your-feature-name
```

Branch naming convention:
- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation changes
- `refactor/` - Code refactoring
- `test/` - Test additions or updates
- `chore/` - Maintenance tasks

### 2. Make Changes

- Write code following our [Code Style](#code-style) guidelines
- Add tests for new functionality
- Update documentation as needed
- Ensure all tests pass

### 3. Run Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### 4. Lint and Format

```bash
# Run linter
npm run lint

# Fix linting issues automatically
npm run lint:fix

# Format code
npm run format

# Check formatting
npm run format:check
```

### 5. Build

```bash
npm run build
```

## Commit Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/) for commit messages. This enables automatic changelog generation and semantic versioning.

### Commit Message Format

```
<type>: <subject>

<body (optional)>

<footer (optional)>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, no logic changes)
- `refactor`: Code refactoring (no functional changes)
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Maintenance tasks (dependencies, config, etc.)
- `ci`: CI/CD changes
- `build`: Build system changes

### Examples

```
feat: add OAuth2 authentication support

Implement OAuth2 client credentials flow for config-server authentication.

Closes #42
```

```
fix: handle timeout errors gracefully

Add proper error handling for axios timeout errors to provide
better error messages to users.
```

```
docs: update README with smart diffing explanation

Add comprehensive documentation explaining how smart diffing works
and when configuration is fetched from the config-server.
```

### Commit Hooks

The project uses Husky to enforce commit message format:

- **pre-commit**: Runs linting and formatting checks
- **commit-msg**: Validates commit message format

If your commit message doesn't follow the convention, the commit will be rejected.

## Testing

### Test Structure

The test suite is organized by functional concern for better maintainability:

```
tests/
├── fixtures/                     # Shared mock data
│   └── config-server-responses.ts
├── helpers/                      # Reusable test utilities
│   └── index.ts
├── client/                       # Client tests split by feature
│   ├── basic.test.ts
│   ├── auth.test.ts
│   ├── retry.test.ts
│   └── edge-cases.test.ts
├── provider/                     # Provider tests split by feature
│   ├── lifecycle.test.ts
│   ├── filtering.test.ts
│   └── validation.test.ts
├── resource/                     # Resource tests split by feature
│   ├── basic.test.ts
│   ├── getProperty.test.ts
│   ├── security.test.ts
│   └── edge-cases.test.ts
└── integration/                  # End-to-end integration tests
    └── end-to-end.test.ts
```

**Test Coverage Requirements:**
- Overall coverage: >= 80% (lines, branches, functions, statements)
- Current coverage: ~90%+ (maintained across all metrics)
- All new features must include tests

### Using Test Fixtures

Fixtures provide consistent, reusable mock data. Always prefer using fixtures over inline data:

```typescript
import {
  smallConfigResponse,
  multiSourceResponse,
  responseWithSecrets,
  largeConfigResponse,
} from '../fixtures/config-server-responses';
import { mockNock } from '../helpers';

it('should handle multi-source configuration', async () => {
  // Use fixture instead of inline data
  mockNock('http://localhost:8888', '/my-app/dev', multiSourceResponse);

  const client = new ConfigServerClient('http://localhost:8888');
  const config = await client.fetchConfig('my-app', 'dev');

  expect(config.propertySources).toHaveLength(3);
});
```

**Available Fixtures:**
- `smallConfigResponse` - ~10 properties, quick tests
- `mediumConfigResponse` - ~100 properties, realistic scenarios
- `largeConfigResponse` - ~1,000 properties, performance tests
- `extraLargeConfigResponse` - ~10,000 properties, stress tests
- `vaultOnlyResponse` - Single Vault source
- `gitOnlyResponse` - Single Git source
- `multiSourceResponse` - Multiple sources (Vault + Git + File)
- `responseWithSecrets` - Contains all secret patterns
- `responseWithoutSecrets` - No secrets (public config)
- `mixedSecurityResponse` - Mix of secrets and public config

### Using Test Helpers

Helper functions reduce boilerplate and ensure consistent test setup:

```typescript
import {
  createMockClient,
  createMockConfigResponse,
  mockNock,
  mockNockNetworkError,
  waitForOutput,
  clearAllMocks,
} from '../helpers';

describe('My Test Suite', () => {
  afterEach(() => {
    clearAllMocks(); // Clean up HTTP mocks after each test
  });

  it('should create client with default options', () => {
    const client = createMockClient({
      url: 'http://localhost:8888',
      username: 'user',
      password: 'pass',
    });
    expect(client).toBeDefined();
  });

  it('should build custom responses', () => {
    const response = createMockConfigResponse({
      name: 'my-app',
      profiles: ['prod'],
      sources: [{
        name: 'vault:secret/my-app',
        source: { 'db.password': 'secret' }
      }]
    });
    expect(response.name).toBe('my-app');
  });

  it('should mock network errors', async () => {
    mockNockNetworkError('http://localhost:8888', '/my-app/dev', 'ECONNREFUSED');

    const client = createMockClient();
    await expect(
      client.fetchConfig('my-app', 'dev')
    ).rejects.toThrow('ECONNREFUSED');
  });
});
```

### Testing Pulumi Outputs

Pulumi Outputs are asynchronous and require special handling. Use the `waitForOutput` helper:

```typescript
import * as pulumi from '@pulumi/pulumi';
import { ConfigServerConfig } from '../src/resource';
import { waitForOutput } from './helpers';

it('should retrieve properties from Pulumi Output', async () => {
  const resource = new ConfigServerConfig('test', {
    configServerUrl: 'http://localhost:8888',
    application: 'my-app',
    profile: 'dev',
  });

  // ❌ WRONG: Can't access Output values directly
  // expect(resource.properties['key']).toBe('value');

  // ✅ CORRECT: Use waitForOutput to unwrap
  const properties = await waitForOutput(resource.properties);
  expect(properties['spring.application.name']).toBe('my-app');

  // Can also use with secret outputs
  const secrets = await waitForOutput(resource.getAllSecrets());
  expect(secrets['database.password']).toBeDefined();
});
```

### Security Testing Patterns

Always test that sensitive data is handled correctly:

```typescript
import {
  expectNoCredentialsInError,
  filterSecrets,
  isSecretKey,
} from '../helpers';

it('should sanitize credentials from error messages', async () => {
  mockNockNetworkError(
    'http://user:password@localhost:8888',
    '/my-app/dev',
    'ECONNREFUSED'
  );

  const client = new ConfigServerClient(
    'http://user:password@localhost:8888'
  );

  try {
    await client.fetchConfig('my-app', 'dev');
  } catch (error) {
    // Verify credentials are replaced with ***:***
    expectNoCredentialsInError(
      error as Error,
      'http://user:password@localhost:8888'
    );
  }
});

it('should detect secret properties', () => {
  const properties = {
    'server.port': '8080',
    'database.password': 'secret',
    'api.key': 'key123',
  };

  const secrets = filterSecrets(properties);

  // Should only include secret keys
  expect(secrets).toEqual({
    'database.password': 'secret',
    'api.key': 'key123',
  });

  // server.port should not be included
  expect(secrets['server.port']).toBeUndefined();
});

it('should identify secret patterns', () => {
  expect(isSecretKey('database.password')).toBe(true);
  expect(isSecretKey('oauth.secret')).toBe(true);
  expect(isSecretKey('auth.token')).toBe(true);
  expect(isSecretKey('encryption.key')).toBe(true);
  expect(isSecretKey('api_key')).toBe(true);

  expect(isSecretKey('server.port')).toBe(false);
  expect(isSecretKey('app.name')).toBe(false);
});
```

### Writing Integration Tests

Integration tests verify all components work together. Place them in `tests/integration/`:

```typescript
import { ConfigServerConfig } from '../../src/resource';
import { ConfigServerProvider } from '../../src/provider';
import { waitForOutput } from '../helpers';
import { multiSourceResponse } from '../fixtures/config-server-responses';

it('should complete full create → update → read flow', async () => {
  const provider = new ConfigServerProvider();

  // CREATE
  const createResult = await provider.create({
    configServerUrl: 'http://localhost:8888',
    application: 'my-app',
    profile: 'dev',
  });

  expect(createResult.id).toBeDefined();
  expect(createResult.outs.properties).toBeDefined();

  // UPDATE
  const updateResult = await provider.update(
    createResult.id,
    createResult.outs,
    {
      configServerUrl: 'http://localhost:8888',
      application: 'my-app',
      profile: 'prod', // Changed profile
    }
  );

  expect(updateResult.outs.profile).toBe('prod');
});
```

### Running Tests

```bash
# Run all tests with coverage
npm test

# Run specific test file
npm test -- tests/client/basic.test.ts

# Run tests matching pattern
npm test -- --testNamePattern="should fetch"

# Run only integration tests
npm test -- tests/integration/

# Run with verbose output
npm test -- --verbose

# Watch mode for development
npm test -- --watch

# Generate coverage report
npm run test:coverage
```

## Code Style

### TypeScript

- Use TypeScript strict mode
- Provide explicit return types for functions
- Use interfaces for object shapes
- Avoid `any` type (use `unknown` if necessary)
- Use optional chaining (`?.`) and nullish coalescing (`??`)

### Formatting

- 2 spaces for indentation
- Single quotes for strings
- Semicolons required
- Trailing commas in multiline structures
- Line length: 100 characters

These rules are enforced by ESLint and Prettier.

### Documentation

- Add JSDoc comments for all public APIs
- Include examples in JSDoc comments
- Document complex logic with inline comments
- Keep comments up-to-date with code changes

Example:

```typescript
/**
 * Fetch configuration from Spring Cloud Config Server
 *
 * @param application - The application name (e.g., "my-service")
 * @param profile - The profile (e.g., "prod")
 * @param label - The label/branch (optional)
 * @returns Configuration response from the server
 *
 * @example
 * ```typescript
 * const config = await client.fetchConfig('my-app', 'prod');
 * ```
 */
async fetchConfig(
  application: string,
  profile: string,
  label?: string
): Promise<ConfigServerResponse> {
  // Implementation
}
```

## Pull Request Process

### Before Submitting

1. Ensure all tests pass: `npm test`
2. Ensure code is linted: `npm run lint`
3. Ensure code is formatted: `npm run format:check`
4. Ensure build succeeds: `npm run build`
5. Update documentation if needed
6. Add tests for new functionality

### Creating a Pull Request

1. Push your branch to your fork:

```bash
git push origin feature/your-feature-name
```

2. Go to GitHub and create a pull request from your fork to the main repository

3. Fill out the pull request template:
   - Clear title describing the change
   - Detailed description of what and why
   - Link to related issues
   - Screenshots if applicable
   - Checklist completion

### Pull Request Template

```markdown
## Description

Brief description of the changes.

## Related Issues

Closes #<issue-number>

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing

Describe the tests you added or ran.

## Checklist

- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex logic
- [ ] Documentation updated
- [ ] Tests added/updated
- [ ] All tests pass
- [ ] Linting passes
- [ ] Build succeeds
```

### Review Process

1. Maintainers will review your pull request
2. Address any feedback or requested changes
3. Once approved, a maintainer will merge your PR
4. Your changes will be included in the next release

### After Merge

1. Delete your feature branch:

```bash
git branch -d feature/your-feature-name
git push origin --delete feature/your-feature-name
```

2. Update your main branch:

```bash
git checkout main
git pull upstream main
```

## Development Tips

### Running Local Tests Against Real Config Server

```bash
# Start Spring Cloud Config Server with Docker
docker run -d -p 8888:8888 \
  -e SPRING_PROFILES_ACTIVE=native \
  -e SPRING_CLOUD_CONFIG_SERVER_NATIVE_SEARCH_LOCATIONS=file:///config \
  hyness/spring-cloud-config-server

# Run integration tests
npm run test:integration
```

### Debugging

Enable debug logging:

```typescript
const config = new ConfigServerConfig('config', {
  debug: true, // Enable verbose logging
  // ...
});
```

### Troubleshooting Build Issues

```bash
# Clean and rebuild
npm run clean
rm -rf node_modules package-lock.json
npm install
npm run build
```

## Release Process

This project uses automated releases via [semantic-release](https://github.com/semantic-release/semantic-release). Version numbers follow [Semantic Versioning](https://semver.org/) and are formatted as `MAJOR.MINOR.PATCH`:

- **MAJOR**: Breaking changes (incompatible API changes)
- **MINOR**: New features (backwards-compatible)
- **PATCH**: Bug fixes (backwards-compatible)

### Automated Release Workflow

Releases are fully automated through GitHub Actions and conventional commits:

1. **Commit with Conventional Format**
   ```bash
   # Your commit message determines the release type
   git commit -m "feat: add new configuration option"  # → Minor version bump
   git commit -m "fix: resolve timeout issue"          # → Patch version bump
   git commit -m "feat!: remove deprecated method"     # → Major version bump
   ```

2. **Push to Main Branch**
   ```bash
   git push origin main
   # Or merge a pull request to main
   ```

3. **Automatic Release Steps** (handled by CI/CD)
   - Analyze commit messages since last release
   - Determine next version number based on conventional commits
   - Generate/update CHANGELOG.md automatically
   - Create GitHub release with release notes
   - Publish package to NPM registry
   - Create git tag for the release

### Commit Types and Version Bumps

| Commit Type | Example | Version Bump |
|-------------|---------|--------------|
| `fix:` | `fix: handle null values` | Patch (0.0.X) |
| `feat:` | `feat: add OAuth support` | Minor (0.X.0) |
| `BREAKING CHANGE:` or `feat!:` | `feat!: remove deprecated API` | Major (X.0.0) |
| `docs:`, `chore:`, `style:`, etc. | `docs: update README` | None (no release) |

### Breaking Changes

To trigger a major version bump, use one of these formats:

**Option 1: Breaking change footer**
```bash
git commit -m "feat: redesign configuration API

BREAKING CHANGE: ConfigServerConfig constructor now requires options object instead of positional parameters"
```

**Option 2: Exclamation mark**
```bash
git commit -m "feat!: remove support for legacy authentication"
```

### Viewing Releases

- **NPM Package**: https://www.npmjs.com/package/@egulatee/pulumi-spring-cloud-config
- **GitHub Releases**: https://github.com/egulatee/pulumi-spring-cloud-config/releases
- **CHANGELOG**: View [CHANGELOG.md](./CHANGELOG.md) for complete release history

### Release Verification

After automatic release completes:

1. **Check NPM**:
   ```bash
   npm view @egulatee/pulumi-spring-cloud-config version
   npm install @egulatee/pulumi-spring-cloud-config@latest
   ```

2. **Verify GitHub Release**:
   - Visit: https://github.com/egulatee/pulumi-spring-cloud-config/releases
   - Confirm release notes are accurate
   - Verify tag was created

3. **Test Installation**:
   ```bash
   mkdir test-install && cd test-install
   npm init -y
   npm install @egulatee/pulumi-spring-cloud-config@latest
   ```

### Troubleshooting Releases

**Release Failed**:
- Check GitHub Actions logs: https://github.com/egulatee/pulumi-spring-cloud-config/actions
- Verify commit messages follow conventional format
- Ensure NPM_TOKEN secret is configured and valid
- Confirm all CI tests passed before release

**Wrong Version Bumped**:
- Review commit messages - they determine the version bump
- Use `fix:` for patches, `feat:` for minor, `feat!:` or `BREAKING CHANGE:` for major
- Cannot revert published NPM versions - publish a new corrected version

### Manual Release (Emergency Only)

Automated releases should always be preferred. For emergencies only:

1. **Update Version Manually**:
   ```bash
   npm version [major|minor|patch]
   ```

2. **Create Git Tag**:
   ```bash
   git tag v1.2.3
   git push origin v1.2.3
   ```

3. **Publish to NPM**:
   ```bash
   npm publish
   ```

4. **Create GitHub Release**:
   - Go to: https://github.com/egulatee/pulumi-spring-cloud-config/releases/new
   - Select the tag
   - Add release notes manually
   - Publish release

### Rollback Procedures

If critical issues are discovered after release:

**For Minor Issues**: Publish a patch release immediately
```bash
# Fix the issue, commit, and push to main
git commit -m "fix: resolve critical issue from v1.2.0"
git push origin main
# Automated release will create v1.2.1
```

**For Critical Issues**: Deprecate the problematic version
```bash
npm deprecate @egulatee/pulumi-spring-cloud-config@1.2.0 \
  "Critical bug detected. Please upgrade to 1.2.1 or later."
```

**For Complete Failures** (within 72 hours only):
```bash
# Last resort - unpublish the version
npm unpublish @egulatee/pulumi-spring-cloud-config@1.2.0
```

**Note**: NPM allows unpublishing only within 72 hours of publication. After that, deprecation is the only option.

### Version Numbering Guidelines

**PATCH (X.Y.Z+1)** - Bug fixes and non-breaking changes:
- Bug fixes
- Documentation updates
- Dependency updates (non-breaking)
- Performance improvements (non-breaking)
- Code refactoring (no behavior changes)

**MINOR (X.Y+1.0)** - New features, backwards-compatible:
- New features
- New configuration options (with backwards-compatible defaults)
- Deprecation warnings (feature still works)
- Internal refactoring with new capabilities

**MAJOR (X+1.0.0)** - Breaking changes:
- Breaking API changes
- Removed deprecated features
- Changed default behaviors
- Minimum Node.js or Pulumi version changes
- Required configuration changes

### Pre-release Versions

For testing before official release:

```bash
# Commit with conventional format
git commit -m "feat: experimental feature"

# Push to a pre-release branch (e.g., beta, alpha)
git push origin beta

# Semantic-release can be configured to publish pre-releases from specific branches
# Example: beta branch → 1.2.0-beta.1
```

### Release Monitoring

Monitor release health:

1. **GitHub Actions**: Watch release workflow status
2. **NPM Downloads**: Track at https://npm-stat.com/charts.html?package=@egulatee/pulumi-spring-cloud-config
3. **GitHub Issues**: Monitor for bug reports after releases
4. **Dependabot**: Review security alerts promptly

### Best Practices

- ✅ **Always use conventional commits** - They drive the release process
- ✅ **Let automation handle releases** - Don't manually bump versions
- ✅ **Test thoroughly before merging to main** - Main branch triggers releases
- ✅ **Review CHANGELOG after release** - Ensure it accurately reflects changes
- ✅ **Monitor first 48 hours after release** - Watch for issues
- ❌ **Don't commit directly to main** - Use pull requests for review
- ❌ **Don't manually edit CHANGELOG** - It's auto-generated
- ❌ **Don't force-push to main** - It can break the release process

## Questions or Need Help?

- Check existing [Issues](https://github.com/egulatee/pulumi-spring-cloud-config/issues)
- Create a new issue with the `question` label
- Reach out to maintainers

## License

By contributing, you agree that your contributions will be licensed under the Apache-2.0 License.

Thank you for contributing!
