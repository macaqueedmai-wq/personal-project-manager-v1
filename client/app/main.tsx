import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { createQueryClient } from './queryClient';
import '../styles/tokens.css';
import '../styles/global.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('找不到 #root 掛載點');
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={createQueryClient()}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);
