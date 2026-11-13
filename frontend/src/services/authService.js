import { fetchApi } from './api';

const authListeners = new Set();

export function addAuthListener(callback) {
  authListeners.add(callback);
  return () => authListeners.delete(callback);
}

function notifyAuthListeners(user) {
  authListeners.forEach((cb) => {
    try {
      cb(user);
    } catch (e) {
      console.error('Error in auth listener:', e);
    }
  });
}

export function getCurrentUser() {
  try {
    const userStr = localStorage.getItem('kivora_user');
    return userStr ? JSON.parse(userStr) : null;
  } catch {
    return null;
  }
}

export const authService = {
  login: async (email, password) => {
    const data = await fetchApi('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (data.access_token) {
      localStorage.setItem('kivora_token', data.access_token);
      const user = data.user || {
        id: data.user_id,
        email: data.email,
        role: data.role,
      };
      localStorage.setItem('kivora_user', JSON.stringify(user));
      notifyAuthListeners(user);
    }
    return data;
  },

  register: async (payload) => {
    const data = await fetchApi('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (data.access_token) {
      localStorage.setItem('kivora_token', data.access_token);
      const user = data.user || {
        id: data.user_id,
        email: data.email,
        role: data.role,
      };
      localStorage.setItem('kivora_user', JSON.stringify(user));
      notifyAuthListeners(user);
    }
    return data;
  },

  verifyOtp: async (email, otpCode) => {
    const data = await fetchApi('/api/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ email, otp_code: otpCode }),
    });
    if (data.access_token) {
      localStorage.setItem('kivora_token', data.access_token);
      const user = data.user || {
        id: data.user_id,
        email: data.email,
        role: data.role,
      };
      localStorage.setItem('kivora_user', JSON.stringify(user));
      notifyAuthListeners(user);
    }
    return data;
  },

  resendOtp: async (email) => {
    return fetchApi('/api/auth/resend-otp', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  forgotPassword: async (email) => {
    return fetchApi('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  resetPassword: async (email, otpCode, newPassword) => {
    return fetchApi('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        email,
        otp_code: otpCode,
        new_password: newPassword,
      }),
    });
  },

  getMe: async () => {
    const user = await fetchApi('/api/auth/me');
    if (user) {
      localStorage.setItem('kivora_user', JSON.stringify(user));
      notifyAuthListeners(user);
    }
    return user;
  },

  logout: () => {
    localStorage.removeItem('kivora_token');
    localStorage.removeItem('kivora_user');
    notifyAuthListeners(null);
  },

  getStoredUser: () => {
    return getCurrentUser();
  },

  getOAuthStatus: async () => {
    return fetchApi('/api/auth/oauth/status').catch(() => ({
      google: { configured: false },
      github: { configured: false },
    }));
  },

  getOAuthAuthorizeUrl: async (provider, role = 'CREATOR') => {
    return fetchApi(`/api/auth/oauth/${provider}/authorize?role=${role}`);
  },

  handleOAuthToken: async (token) => {
    if (!token) return null;
    localStorage.setItem('kivora_token', token);
    const user = await fetchApi('/api/auth/me');
    if (user) {
      localStorage.setItem('kivora_user', JSON.stringify(user));
      notifyAuthListeners(user);
    }
    return user;
  },
  changePassword: async (currentPassword, newPassword) => {
    return fetchApi('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
      }),
    });
  },
};

export default authService;
