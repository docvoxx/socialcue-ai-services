/**
 * Simple smoke test to verify test infrastructure works
 */

describe('Simple Smoke Test', () => {
  it('should pass a basic test', () => {
    expect(1 + 1).toBe(2);
  });

  it('should verify environment variables are set', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });
});
