import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ApiError } from './auth/api';
import App from './App';
import './app.css';
import { getApiUrl } from './config/env';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: {
              retry: (count, error) =>
                !(error instanceof ApiError && error.status < 500) && count < 2,
            },
          },
        })
      }
    >
      <BrowserRouter>
        <App apiUrl={getApiUrl()} />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
