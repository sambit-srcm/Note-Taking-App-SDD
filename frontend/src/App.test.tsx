import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import App from './App';

describe('App', () => {
  afterEach(cleanup);

  it('renders the Notes heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Notes' })).toBeInTheDocument();
  });

  it('renders the shared API contract status', () => {
    render(<App />);
    expect(screen.getByText('API contract: ok')).toBeInTheDocument();
  });
});
