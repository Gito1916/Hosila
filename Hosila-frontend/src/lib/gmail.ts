/**
 * Gmail API Client
 * Uses Google Identity Services (GIS) for OAuth and Gmail API for reading emails.
 * Client-side only — no server needed.
 */

const GMAIL_SCOPES = 'https://www.googleapis.com/auth/gmail.modify';
const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

// Known OTA sender patterns
const OTA_SENDERS = [
    'noreply@booking.com',
    'no-reply@booking.com',
    'customer.service@booking.com',
    'noreply@airbnb.com',
    'no-reply@airbnb.com',
    'automated@airbnb.com',
    'express@airbnb.com',
];

const OTA_SUBJECT_KEYWORDS = [
    'reservation',
    'booking confirmation',
    'new booking',
    'booking request',
    'reservation confirmed',
    'new reservation',
    'you have a new',
];

export interface GmailTokenInfo {
    accessToken: string;
    expiresAt: number; // timestamp
    email: string;
}

export interface GmailMessage {
    id: string;
    threadId: string;
    snippet: string;
    internalDate: string; // ms timestamp
    payload: {
        headers: Array<{ name: string; value: string }>;
        mimeType: string;
        body?: { data?: string; size: number };
        parts?: Array<{
            mimeType: string;
            body?: { data?: string; size: number };
            parts?: Array<{
                mimeType: string;
                body?: { data?: string; size: number };
            }>;
        }>;
    };
}

// =========================================================================
// Token Management
// =========================================================================

const TOKEN_STORAGE_KEY = 'hotelflow_gmail_token';

export function getStoredToken(): GmailTokenInfo | null {
    try {
        const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
        if (!stored) return null;
        const token = JSON.parse(stored) as GmailTokenInfo;
        // Check if expired (with 5 min buffer)
        if (Date.now() > token.expiresAt - 5 * 60 * 1000) {
            localStorage.removeItem(TOKEN_STORAGE_KEY);
            return null;
        }
        return token;
    } catch {
        return null;
    }
}

function storeToken(token: GmailTokenInfo): void {
    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(token));
}

export function clearToken(): void {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export function isGmailConnected(): boolean {
    return getStoredToken() !== null;
}

// =========================================================================
// Google Identity Services OAuth
// =========================================================================

declare global {
    interface Window {
        google?: {
            accounts: {
                oauth2: {
                    initTokenClient(config: {
                        client_id: string;
                        scope: string;
                        callback: (response: { access_token: string; expires_in: number; error?: string }) => void;
                        error_callback?: (error: { type: string; message: string }) => void;
                    }): {
                        requestAccessToken(): void;
                    };
                    revoke(token: string, callback?: () => void): void;
                };
            };
        };
    }
}

/**
 * Check if Google Identity Services script is loaded
 */
export function isGISLoaded(): boolean {
    return typeof window.google?.accounts?.oauth2 !== 'undefined';
}

/**
 * Sign in with Google and get Gmail access token.
 * Returns the token info or throws an error.
 */
export function signInWithGoogle(): Promise<GmailTokenInfo> {
    return new Promise((resolve, reject) => {
        const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
        if (!clientId) {
            reject(new Error('VITE_GOOGLE_CLIENT_ID not configured'));
            return;
        }

        if (!isGISLoaded()) {
            reject(new Error('Google Identity Services not loaded. Check your internet connection.'));
            return;
        }

        const tokenClient = window.google!.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: GMAIL_SCOPES,
            callback: async (response) => {
                if (response.error) {
                    reject(new Error(`OAuth error: ${response.error}`));
                    return;
                }

                try {
                    // Fetch user's email from the token
                    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                        headers: { Authorization: `Bearer ${response.access_token}` },
                    });
                    const profile = await profileRes.json();

                    const tokenInfo: GmailTokenInfo = {
                        accessToken: response.access_token,
                        expiresAt: Date.now() + response.expires_in * 1000,
                        email: profile.email || 'Unknown',
                    };

                    storeToken(tokenInfo);
                    resolve(tokenInfo);
                } catch (err) {
                    reject(err);
                }
            },
            error_callback: (error) => {
                reject(new Error(`OAuth error: ${error.message}`));
            },
        });

        tokenClient.requestAccessToken();
    });
}

/**
 * Disconnect Gmail — revoke token and clear storage
 */
export function disconnectGmail(): void {
    const token = getStoredToken();
    if (token && isGISLoaded()) {
        try {
            window.google!.accounts.oauth2.revoke(token.accessToken);
        } catch {
            // Ignore revoke errors
        }
    }
    clearToken();
}

// =========================================================================
// Gmail API — Fetch Emails
// =========================================================================

async function gmailFetch<T>(endpoint: string, token: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${GMAIL_API_BASE}${endpoint}`, {
        ...options,
        headers: { Authorization: `Bearer ${token}`, ...options?.headers },
    });

    if (!res.ok) {
        if (res.status === 401) {
            clearToken();
            throw new Error('Gmail session expired. Please reconnect.');
        }
        const error = await res.json().catch(() => ({ error: { message: res.statusText } }));
        throw new Error(`Gmail API error: ${error.error?.message || res.statusText}`);
    }

    return res.json();
}

/**
 * Build a Gmail search query for OTA booking emails
 */
function buildOTASearchQuery(afterDate?: Date): string {
    // Search for emails from known OTA senders
    const senderQuery = OTA_SENDERS.map(s => `from:${s}`).join(' OR ');

    // Add subject keywords
    const subjectQuery = OTA_SUBJECT_KEYWORDS.map(k => `subject:"${k}"`).join(' OR ');

    let query = `is:unread (${senderQuery}) AND (${subjectQuery})`;

    if (afterDate) {
        // Gmail uses YYYY/MM/DD format for after:
        const dateStr = `${afterDate.getFullYear()}/${String(afterDate.getMonth() + 1).padStart(2, '0')}/${String(afterDate.getDate()).padStart(2, '0')}`;
        query += ` after:${dateStr}`;
    }

    return query;
}

/**
 * Fetch OTA booking emails from Gmail.
 * @param afterDate - Only fetch emails after this date
 * @param maxResults - Maximum number of emails to fetch (default 20)
 */
export async function fetchOTAEmails(afterDate?: Date, maxResults = 20): Promise<GmailMessage[]> {
    const token = getStoredToken();
    if (!token) throw new Error('Not connected to Gmail');

    const query = buildOTASearchQuery(afterDate);
    const encodedQuery = encodeURIComponent(query);

    // List matching message IDs
    const listResponse = await gmailFetch<{
        messages?: Array<{ id: string; threadId: string }>;
        resultSizeEstimate: number;
    }>(`/messages?q=${encodedQuery}&maxResults=${maxResults}`, token.accessToken);

    if (!listResponse.messages || listResponse.messages.length === 0) {
        return [];
    }

    // Fetch full content for each message
    const messages: GmailMessage[] = [];
    for (const msg of listResponse.messages) {
        try {
            const fullMessage = await gmailFetch<GmailMessage>(
                `/messages/${msg.id}?format=full`,
                token.accessToken
            );
            messages.push(fullMessage);
        } catch (err) {
            console.warn(`Failed to fetch message ${msg.id}:`, err);
        }
    }

    return messages;
}

/**
 * Extract the HTML body from a Gmail message
 */
export function extractEmailBody(message: GmailMessage): string {
    const { payload } = message;

    // Try to get HTML body
    const htmlBody = findMimePart(payload, 'text/html');
    if (htmlBody) return decodeBase64Url(htmlBody);

    // Fall back to plain text
    const textBody = findMimePart(payload, 'text/plain');
    if (textBody) return decodeBase64Url(textBody);

    return '';
}

/**
 * Get a header value from a Gmail message
 */
export function getHeader(message: GmailMessage, name: string): string {
    const header = message.payload.headers.find(
        h => h.name.toLowerCase() === name.toLowerCase()
    );
    return header?.value || '';
}

/**
 * Mark a Gmail message as read (remove UNREAD label)
 */
export async function markAsRead(messageId: string): Promise<void> {
    const token = getStoredToken();
    if (!token) throw new Error('Not connected to Gmail');

    await gmailFetch(
        `/messages/${messageId}/modify`,
        token.accessToken,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
        }
    );
}

// =========================================================================
// Helpers
// =========================================================================

function findMimePart(
    part: GmailMessage['payload'] | NonNullable<GmailMessage['payload']['parts']>[0],
    mimeType: string
): string | null {
    if (part.mimeType === mimeType && part.body?.data) {
        return part.body.data;
    }

    if ('parts' in part && part.parts) {
        for (const child of part.parts) {
            const found = findMimePart(child, mimeType);
            if (found) return found;
        }
    }

    return null;
}

function decodeBase64Url(data: string): string {
    // Gmail uses URL-safe base64 encoding
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    try {
        return decodeURIComponent(
            atob(base64)
                .split('')
                .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                .join('')
        );
    } catch {
        // Fallback for non-UTF8 content
        return atob(base64);
    }
}
