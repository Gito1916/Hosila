import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'light' | 'dark';

interface ThemeState {
    theme: Theme;
    toggleTheme: () => void;
    setTheme: (theme: Theme) => void;
}

export const useThemeStore = create<ThemeState>()(
    persist(
        (set, get) => ({
            theme: 'dark', // Default to dark mode

            toggleTheme: () => {
                const newTheme = get().theme === 'dark' ? 'light' : 'dark';
                set({ theme: newTheme });
                applyTheme(newTheme);
            },

            setTheme: (theme: Theme) => {
                set({ theme });
                applyTheme(theme);
            },
        }),
        {
            name: 'hotelflow-theme',
            onRehydrateStorage: () => (state) => {
                // Apply theme on app load
                if (state) {
                    applyTheme(state.theme);
                }
            },
        }
    )
);

// Apply theme to document
function applyTheme(theme: Theme) {
    const root = document.documentElement;

    if (theme === 'light') {
        root.classList.add('light-mode');
        root.classList.remove('dark-mode');
    } else {
        root.classList.add('dark-mode');
        root.classList.remove('light-mode');
    }
}

// Initialize theme on module load
if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('hotelflow-theme');
    if (stored) {
        try {
            const data = JSON.parse(stored);
            if (data.state?.theme) {
                applyTheme(data.state.theme);
            }
        } catch {
            // Default to dark
            applyTheme('dark');
        }
    }
}
