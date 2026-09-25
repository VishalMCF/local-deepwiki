import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from './lib/theme';
import { AskView } from './pages/AskView';
import { Landing } from './pages/Landing';
import { RepoWiki } from './pages/RepoWiki';

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 10_000 } },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/repo/:slug/chat" element={<AskView />} />
            <Route path="/repo/:slug/chat/:threadId" element={<AskView />} />
            <Route path="/repo/:slug" element={<RepoWiki />} />
            <Route path="/repo/:slug/:pageSlug" element={<RepoWiki />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
