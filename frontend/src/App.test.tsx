import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from './App';

describe('App', () => {
  // A whole-app smoke render: the entire route tree and every provider. 5s is enough alone and not always
  // enough when the suite runs the other 230 tests beside it — the budget is explicit rather than lucky.
  it('renders without crashing', async () => {
    render(<App />);
    // Wait for async provider effects (e.g. Auth public-config) so React act warnings do not clutter CI output
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Open Knowledge Management System/i }),
      ).toBeInTheDocument();
    });
  }, 20_000);
});
