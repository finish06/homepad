import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import OidcTestResult from './OidcTestResult';

expect.extend(toHaveNoViolations);

// SPEC-admin-server-settings §7 (0.2.1) — the test sign-in tab's landing.
describe('OidcTestResult', () => {
  it('passed: says so and that the tab can close', async () => {
    const { container } = render(<OidcTestResult result="passed" />);
    expect(screen.getByRole('heading', { name: 'Test sign-in passed.' })).toBeInTheDocument();
    expect(screen.getByText(/You can close this tab/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('failed: says so', () => {
    render(<OidcTestResult result="failed" />);
    expect(screen.getByRole('heading', { name: 'Test sign-in failed.' })).toBeInTheDocument();
  });
});
