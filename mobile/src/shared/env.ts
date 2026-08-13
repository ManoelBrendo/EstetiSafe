declare const process: {
  env?: Record<string, string | undefined>
}

export const mobileEnv = {
  apiUrl: process.env?.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:3000',
  token: process.env?.EXPO_PUBLIC_LAPPUI_TOKEN || '',
}
