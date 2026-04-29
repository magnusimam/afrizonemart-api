/**
 * Vitest setup — minimal env so the API code paths import without
 * exploding. Tests don't actually hit a DB; they exercise pure
 * domain logic. When we add integration tests we'll point DATABASE_URL
 * at a CI-managed Postgres.
 */
process.env.NODE_ENV ??= 'test';
process.env.JWT_SECRET ??= 'test-jwt-secret-must-be-32-characters-or-more-here';
process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/afrizonemart_test';
process.env.WEB_URL ??= 'http://localhost:3000';
process.env.API_PUBLIC_URL ??= 'http://localhost:4000';
