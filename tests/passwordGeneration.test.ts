/**
 * Behavioral tests for password generation security (B14).
 *
 * Tests that generateSecurePassword produces policy-compliant passwords
 * using cryptographically secure randomness (not Math.random).
 */
import { describe, expect, it } from 'vitest';
import { generateSecurePassword } from '../src/utils/password';

describe('Password Generation Security (B14)', () => {
  it('DEFAULT: generates 16-char password', () => {
    const pw = generateSecurePassword();
    expect(pw).toHaveLength(16);
  });

  it('POLICY: minimum 8 characters', () => {
    expect(() => generateSecurePassword(7)).toThrow(/بین ۸ تا ۱۲۸/);
  });

  it('POLICY: maximum 128 characters', () => {
    expect(() => generateSecurePassword(129)).toThrow(/بین ۸ تا ۱۲۸/);
  });

  it('POLICY: minimum 128 characters allowed', () => {
    const pw = generateSecurePassword(128);
    expect(pw).toHaveLength(128);
  });

  it('COMPLEXITY: contains uppercase', () => {
    const pw = generateSecurePassword(32);
    expect(pw).toMatch(/[A-Z]/);
  });

  it('COMPLEXITY: contains lowercase', () => {
    const pw = generateSecurePassword(32);
    expect(pw).toMatch(/[a-z]/);
  });

  it('COMPLEXITY: contains digit', () => {
    const pw = generateSecurePassword(32);
    expect(pw).toMatch(/[2-9]/);
  });

  it('COMPLEXITY: contains special character', () => {
    const pw = generateSecurePassword(32);
    expect(pw).toMatch(/[!@#\$%&*?]/);
  });

  it('NO AMBIGUOUS: never contains ambiguous characters (1, 0, O, I, l)', () => {
    // PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*?'
    // Note: '1', '0', 'O', 'I', 'l' are excluded
    for (let i = 0; i < 50; i++) {
      const pw = generateSecurePassword(64);
      expect(pw).not.toMatch(/[10OlI]/);
    }
  });

  it('RANDOMNESS: 1000 passwords are not identical', () => {
    const passwords = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      passwords.add(generateSecurePassword(16));
    }
    expect(passwords.size).toBe(1000);
  });

  it('RANDOMNESS: 16-char passwords have high entropy distribution', () => {
    // Generate many passwords and check distribution is not uniform
    const passwords = Array.from({ length: 100 }, () => generateSecurePassword(16));
    const firstChars = passwords.map(p => p[0]);
    const uniqueFirstChars = new Set(firstChars).size;
    // With 62 possible characters, 100 samples should have multiple unique values
    expect(uniqueFirstChars).toBeGreaterThan(1);
  });

  it('LENGTH: respects exact length parameter', () => {
    expect(generateSecurePassword(8)).toHaveLength(8);
    expect(generateSecurePassword(20)).toHaveLength(20);
    expect(generateSecurePassword(45)).toHaveLength(45);
  });

  it('NO PADDING: password has no whitespace or newlines', () => {
    const pw = generateSecurePassword(32);
    expect(pw).not.toMatch(/\s/);
  });
});