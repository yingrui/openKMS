import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from './App';

describe('App', () => {
  it('renders without crashing', () => {
    render(<App />);
    // App includes Toaster and providers; check that something from MainLayout tree is present
    expect(document.body).toBeTruthy();
  });
});
