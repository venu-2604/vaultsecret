import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.vaultshop',
  appName: 'vaultshop',
  webDir: 'dist',
  server: {
    url: 'https://74774e43-1386-4e51-8875-3a58acc93031.lovableproject.com?forceHideBadge=true',
    cleartext: true,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
