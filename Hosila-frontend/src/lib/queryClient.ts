import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 5 * 1000, // 5 seconds — quick revalidation for responsive UI
            gcTime: 5 * 60 * 1000, // 5 minutes (formerly cacheTime)
            retry: 2,
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
        },
        mutations: {
            retry: 1,
        },
    },
});
