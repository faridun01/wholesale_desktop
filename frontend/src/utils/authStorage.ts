const USER_KEY = 'user';
const TOKEN_KEY = 'token';

export function getAuthToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function getTokenPayload() {
  return null;
}

export function getStoredUser() {
  const userJson = sessionStorage.getItem(USER_KEY);
  if (!userJson) return null;
  try {
    return JSON.parse(userJson);
  } catch (e) {
    return null;
  }
}

export function hasStoredSession() {
  return Boolean(sessionStorage.getItem(TOKEN_KEY));
}

export function setAuthSession(_token: string | null | undefined, user: unknown) {
  if (typeof _token === 'string' && _token.length > 0) {
    sessionStorage.setItem(TOKEN_KEY, _token);
  } else if (_token === null) {
    sessionStorage.removeItem(TOKEN_KEY);
  }
  
  if (user) {
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  } else {
    sessionStorage.removeItem(USER_KEY);
  }
}

export function updateStoredUser(user: unknown) {
  if (user) {
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  }
}

export function clearAuthSession() {
  sessionStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}
