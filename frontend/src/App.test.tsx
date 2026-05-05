import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from './App';

describe('App', () => {
  it('renders without crashing', async () => {
    render(<App />);
    // Wait for async provider effects (e.g. Auth public-config) so React act warnings do not clutter CI output
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Open Knowledge Management System/i }),
      ).toBeInTheDocument();
    });
  });
});
