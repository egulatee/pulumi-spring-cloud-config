## 1.1.0 (2025-11-04)

* fix: add value sanitization to prevent protobuf serialization errors (#54) ([2b7f29d](https://github.com/egulatee/pulumi-spring-cloud-config/commit/2b7f29d)), closes [#54](https://github.com/egulatee/pulumi-spring-cloud-config/issues/54) [#44](https://github.com/egulatee/pulumi-spring-cloud-config/issues/44) [#44](https://github.com/egulatee/pulumi-spring-cloud-config/issues/44) [#44](https://github.com/egulatee/pulumi-spring-cloud-config/issues/44) [#44](https://github.com/egulatee/pulumi-spring-cloud-config/issues/44)
* test: add protobuf serialization tests for issue #44 (#53) ([07887cf](https://github.com/egulatee/pulumi-spring-cloud-config/commit/07887cf)), closes [#44](https://github.com/egulatee/pulumi-spring-cloud-config/issues/44) [#53](https://github.com/egulatee/pulumi-spring-cloud-config/issues/53) [#44](https://github.com/egulatee/pulumi-spring-cloud-config/issues/44) [#44](https://github.com/egulatee/pulumi-spring-cloud-config/issues/44) [#44](https://github.com/egulatee/pulumi-spring-cloud-config/issues/44) [#44](https://github.com/egulatee/pulumi-spring-cloud-config/issues/44)


### BREAKING CHANGE

* Non-primitive values are now converted to strings

Implements value sanitization to fix issue #44. All non-primitive values
from Spring Cloud Config Server are now converted to serializable primitives
before being stored in Pulumi state.

Changes:
- Add sanitizeValue() function to convert non-primitives to primitives
- Date objects → ISO 8601 strings
- Buffer objects → Base64 strings
- RegExp → String representation
- Error → Error message
- Functions → '[Function]' marker
- Arrays → JSON strings
- Complex objects → JSON strings
- NaN/Infinity → null

Testing:
- Add comprehensive value-sanitization.test.ts with 15 test cases
- All conversion scenarios covered
- Protobuf compatibility verified

## <small>1.0.1 (2025-11-04)</small>

* fix: add diagnostic logging for serialization troubleshooting (#52) ([a00fab9](https://github.com/egulatee/pulumi-spring-cloud-config/commit/a00fab9)), closes [#52](https://github.com/egulatee/pulumi-spring-cloud-config/issues/52) [#44](https://github.com/egulatee/pulumi-spring-cloud-config/issues/44) [#44](https://github.com/egulatee/pulumi-spring-cloud-config/issues/44)
* chore(deps-dev): Bump @commitlint/config-conventional (#10) ([eb4ed1b](https://github.com/egulatee/pulumi-spring-cloud-config/commit/eb4ed1b)), closes [#10](https://github.com/egulatee/pulumi-spring-cloud-config/issues/10)
* chore(deps-dev): Bump jest and @types/jest (#13) ([5afdf1d](https://github.com/egulatee/pulumi-spring-cloud-config/commit/5afdf1d)), closes [#13](https://github.com/egulatee/pulumi-spring-cloud-config/issues/13)
* docs: replace static version badge with dynamic npm badge (#51) ([ea15cd4](https://github.com/egulatee/pulumi-spring-cloud-config/commit/ea15cd4)), closes [#51](https://github.com/egulatee/pulumi-spring-cloud-config/issues/51) [#50](https://github.com/egulatee/pulumi-spring-cloud-config/issues/50)

## 1.0.0 (2025-11-03)

* fix: commit package-lock.json for CI caching and reproducibility ([00746c5](https://github.com/egulatee/pulumi-spring-cloud-config/commit/00746c5)), closes [#8](https://github.com/egulatee/pulumi-spring-cloud-config/issues/8)
* fix: correct CI workflow configuration for semantic-release ([3c5eb6f](https://github.com/egulatee/pulumi-spring-cloud-config/commit/3c5eb6f)), closes [#46](https://github.com/egulatee/pulumi-spring-cloud-config/issues/46)
* fix: correct client retry logic and comprehensive test fixes ([e99eea6](https://github.com/egulatee/pulumi-spring-cloud-config/commit/e99eea6))
* fix: disable Husky hooks in CI to allow semantic-release commits (#49) ([c486c74](https://github.com/egulatee/pulumi-spring-cloud-config/commit/c486c74)), closes [#49](https://github.com/egulatee/pulumi-spring-cloud-config/issues/49)
* fix: make diff method return Promise to match Pulumi interface ([4f0c50e](https://github.com/egulatee/pulumi-spring-cloud-config/commit/4f0c50e))
* fix: resolve Jest teardown race condition in getSourceProperties ([0ca2c97](https://github.com/egulatee/pulumi-spring-cloud-config/commit/0ca2c97)), closes [#45](https://github.com/egulatee/pulumi-spring-cloud-config/issues/45)
* fix: resolve Pulumi serialization error with flat state structure ([922fdc1](https://github.com/egulatee/pulumi-spring-cloud-config/commit/922fdc1)), closes [#44](https://github.com/egulatee/pulumi-spring-cloud-config/issues/44)
* fix: resolve TypeScript compilation error in getSourceProperties method ([dfc0bc4](https://github.com/egulatee/pulumi-spring-cloud-config/commit/dfc0bc4))
* Initial commit ([7ccafbf](https://github.com/egulatee/pulumi-spring-cloud-config/commit/7ccafbf))
* Merge pull request #11 from egulatee/dependabot/npm_and_yarn/types/node-24.10.0 ([97f292b](https://github.com/egulatee/pulumi-spring-cloud-config/commit/97f292b)), closes [#11](https://github.com/egulatee/pulumi-spring-cloud-config/issues/11)
* Merge pull request #14 from egulatee/dependabot/npm_and_yarn/nock-14.0.10 ([37150aa](https://github.com/egulatee/pulumi-spring-cloud-config/commit/37150aa)), closes [#14](https://github.com/egulatee/pulumi-spring-cloud-config/issues/14)
* Merge pull request #15 from egulatee/dependabot/npm_and_yarn/commitlint/cli-20.1.0 ([84f534c](https://github.com/egulatee/pulumi-spring-cloud-config/commit/84f534c)), closes [#15](https://github.com/egulatee/pulumi-spring-cloud-config/issues/15)
* Merge pull request #16 from egulatee/feature/core-provider-implementation-issue3 ([56f4908](https://github.com/egulatee/pulumi-spring-cloud-config/commit/56f4908)), closes [#16](https://github.com/egulatee/pulumi-spring-cloud-config/issues/16)
* Merge pull request #24 from egulatee/feature/test-infrastructure-issue17 ([1af0a2c](https://github.com/egulatee/pulumi-spring-cloud-config/commit/1af0a2c)), closes [#24](https://github.com/egulatee/pulumi-spring-cloud-config/issues/24)
* Merge pull request #35 from egulatee/feature/client-tests-issue18 ([e762a54](https://github.com/egulatee/pulumi-spring-cloud-config/commit/e762a54)), closes [#35](https://github.com/egulatee/pulumi-spring-cloud-config/issues/35)
* Merge pull request #36 from egulatee/feature/provider-tests-issue19 ([cca8523](https://github.com/egulatee/pulumi-spring-cloud-config/commit/cca8523)), closes [#36](https://github.com/egulatee/pulumi-spring-cloud-config/issues/36)
* Merge pull request #37 from egulatee/feature/resource-tests-issue20 ([7523c8b](https://github.com/egulatee/pulumi-spring-cloud-config/commit/7523c8b)), closes [#37](https://github.com/egulatee/pulumi-spring-cloud-config/issues/37)
* Merge pull request #38 from egulatee/feature/examples-docs-issue25 ([d3faaac](https://github.com/egulatee/pulumi-spring-cloud-config/commit/d3faaac)), closes [#38](https://github.com/egulatee/pulumi-spring-cloud-config/issues/38)
* Merge pull request #40 from egulatee/test/coverage-80-and-fix-nock-errors-issue39 ([df57293](https://github.com/egulatee/pulumi-spring-cloud-config/commit/df57293)), closes [#40](https://github.com/egulatee/pulumi-spring-cloud-config/issues/40)
* Merge pull request #42 from egulatee/docs/fix-badges-add-codecov-issue41 ([8e729ab](https://github.com/egulatee/pulumi-spring-cloud-config/commit/8e729ab)), closes [#42](https://github.com/egulatee/pulumi-spring-cloud-config/issues/42)
* Merge pull request #45 from egulatee/fix/pulumi-serialization-error-issue44 ([35314d4](https://github.com/egulatee/pulumi-spring-cloud-config/commit/35314d4)), closes [#45](https://github.com/egulatee/pulumi-spring-cloud-config/issues/45)
* Merge pull request #47 from egulatee/feat/semantic-release-automation-issue46 ([e7eaa37](https://github.com/egulatee/pulumi-spring-cloud-config/commit/e7eaa37)), closes [#47](https://github.com/egulatee/pulumi-spring-cloud-config/issues/47)
* Merge pull request #48 from egulatee/fix/ci-workflow-critical-fixes-issue46 ([8469f98](https://github.com/egulatee/pulumi-spring-cloud-config/commit/8469f98)), closes [#48](https://github.com/egulatee/pulumi-spring-cloud-config/issues/48)
* Merge pull request #8 from egulatee/feature/phase0-repository-setup-issue2 ([dd323c8](https://github.com/egulatee/pulumi-spring-cloud-config/commit/dd323c8)), closes [#8](https://github.com/egulatee/pulumi-spring-cloud-config/issues/8)
* Merge pull request #9 from egulatee/dependabot/npm_and_yarn/eslint-config-prettier-10.1.8 ([daaecd4](https://github.com/egulatee/pulumi-spring-cloud-config/commit/daaecd4)), closes [#9](https://github.com/egulatee/pulumi-spring-cloud-config/issues/9)
* feat: implement automated semantic-release workflow for zero-touch releases ([f02a3d6](https://github.com/egulatee/pulumi-spring-cloud-config/commit/f02a3d6)), closes [#46](https://github.com/egulatee/pulumi-spring-cloud-config/issues/46)
* feat: implement comprehensive client tests for Phase 2.2 ([0e70dcc](https://github.com/egulatee/pulumi-spring-cloud-config/commit/0e70dcc)), closes [#18](https://github.com/egulatee/pulumi-spring-cloud-config/issues/18)
* feat: implement comprehensive Phase 1 core provider functionality ([261f646](https://github.com/egulatee/pulumi-spring-cloud-config/commit/261f646)), closes [#3](https://github.com/egulatee/pulumi-spring-cloud-config/issues/3)
* feat: implement test infrastructure foundation for Phase 2.1 ([5e60fa6](https://github.com/egulatee/pulumi-spring-cloud-config/commit/5e60fa6)), closes [#17](https://github.com/egulatee/pulumi-spring-cloud-config/issues/17)
* feat: setup phase 0 repository infrastructure ([7a45f7f](https://github.com/egulatee/pulumi-spring-cloud-config/commit/7a45f7f)), closes [#2](https://github.com/egulatee/pulumi-spring-cloud-config/issues/2) [#7](https://github.com/egulatee/pulumi-spring-cloud-config/issues/7) [#1](https://github.com/egulatee/pulumi-spring-cloud-config/issues/1)
* docs: fix npm badge and add codecov coverage badge ([91a20cf](https://github.com/egulatee/pulumi-spring-cloud-config/commit/91a20cf)), closes [#41](https://github.com/egulatee/pulumi-spring-cloud-config/issues/41)
* docs: implement Phase 3.1 - examples and comprehensive documentation ([c5e9123](https://github.com/egulatee/pulumi-spring-cloud-config/commit/c5e9123)), closes [#25](https://github.com/egulatee/pulumi-spring-cloud-config/issues/25)
* test: implement comprehensive provider tests for Phase 2.3 ([be6e5f0](https://github.com/egulatee/pulumi-spring-cloud-config/commit/be6e5f0)), closes [#19](https://github.com/egulatee/pulumi-spring-cloud-config/issues/19)
* test: implement comprehensive resource tests for Phase 2.4 ([754b9cd](https://github.com/egulatee/pulumi-spring-cloud-config/commit/754b9cd)), closes [#20](https://github.com/egulatee/pulumi-spring-cloud-config/issues/20)
* test: increase coverage thresholds to 80% and fix nock compatibility issues ([9af01fe](https://github.com/egulatee/pulumi-spring-cloud-config/commit/9af01fe)), closes [#39](https://github.com/egulatee/pulumi-spring-cloud-config/issues/39)
* chore(deps-dev): Bump @commitlint/cli from 19.8.1 to 20.1.0 ([177049d](https://github.com/egulatee/pulumi-spring-cloud-config/commit/177049d))
* chore(deps-dev): Bump @types/node from 22.19.0 to 24.10.0 ([05f5423](https://github.com/egulatee/pulumi-spring-cloud-config/commit/05f5423))
* chore(deps-dev): Bump eslint-config-prettier from 9.1.2 to 10.1.8 ([0797c17](https://github.com/egulatee/pulumi-spring-cloud-config/commit/0797c17))
* chore(deps-dev): Bump nock from 13.5.6 to 14.0.10 ([6c90f2a](https://github.com/egulatee/pulumi-spring-cloud-config/commit/6c90f2a))
* chore: lower coverage threshold to 0% for Phase 0 ([8207edb](https://github.com/egulatee/pulumi-spring-cloud-config/commit/8207edb)), closes [#4](https://github.com/egulatee/pulumi-spring-cloud-config/issues/4)

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

> **Note**: Starting with the next release, this changelog is automatically generated by [semantic-release](https://github.com/semantic-release/semantic-release) from conventional commit messages. See [Issue #46](https://github.com/egulatee/pulumi-spring-cloud-config/issues/46) for details.

### Pre-Release Development (0.x)

#### Added
- Initial project setup with TypeScript configuration
- Smart diffing implementation for efficient configuration fetching
- Automatic secret detection based on property key patterns
- Basic Authentication support for Spring Cloud Config Server
- Property source filtering (e.g., Vault-only)
- Configurable timeout support
- Debug mode for verbose logging
- HTTPS enforcement option
- Comprehensive README with usage examples
- CI/CD workflows for testing and publishing
- Commitlint and Husky for code quality
- Jest testing framework with coverage reporting
- ESLint and Prettier for code style enforcement
- Automated semantic-release workflow for zero-touch releases

## [0.1.0] - TBD

Initial release

### Features
- Pulumi Dynamic Provider for Spring Cloud Config Server integration
- Smart diffing to only fetch configuration when inputs change
- Automatic secret detection and marking
- Basic Authentication support
- Property source filtering
- Configurable timeouts
- TypeScript support with full type definitions
- Debug mode for troubleshooting

### Requirements
- Node.js >= 18.0.0
- Pulumi >= 3.0.0
- Spring Cloud Config Server >= 2.3.0

[Unreleased]: https://github.com/egulatee/pulumi-spring-cloud-config/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/egulatee/pulumi-spring-cloud-config/releases/tag/v0.1.0
