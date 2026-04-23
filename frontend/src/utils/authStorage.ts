const USER_KEY = 'user';
const TOKEN_KEY = 'token';

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getTokenPayload() {
  return null;
}

export function getStoredUser() {
  const userJson = localStorage.getItem(USER_KEY);
  if (!userJson) return null;
  try {
    return JSON.parse(userJson);
  } catch (e) {
    return null;
  }
}

export function hasStoredSession() {
  return Boolean(localStorage.getItem(TOKEN_KEY));
}

export function setAuthSession(_token: string | null | undefined, user: unknown) {
  if (typeof _token === 'string' && _token.length > 0) {
    localStorage.setItem(TOKEN_KEY, _token);
  } else if (_token === null) {
    localStorage.removeItem(TOKEN_KEY);
  }
  
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(USER_KEY);
  }
}

export function updateStoredUser(user: unknown) {
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
}

export function clearAuthSession() {
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(TOKEN_KEY);
}
