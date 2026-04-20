const USER_KEY = 'user';
const TOKEN_KEY = 'token';

export function getAuthToken() {
  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
}

export function getTokenPayload() {
  return null;
}

export function getStoredUser() {
  return sessionStorage.getItem(USER_KEY) || localStorage.getItem(USER_KEY);
}

export function hasStoredSession() {
  return Boolean(getStoredUser());
}

export function setAuthSession(_token: string | null | undefined, user: unknown) {
  if (typeof _token === 'string' && _token.length > 0) {
    sessionStorage.setItem(TOKEN_KEY, _token);
    localStorage.setItem(TOKEN_KEY, _token);
  } else if (_token === null) {
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
  }
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function updateStoredUser(user: unknown) {
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuthSession() {
  sessionStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem('token');
  localStorage.removeItem(USER_KEY);
}
