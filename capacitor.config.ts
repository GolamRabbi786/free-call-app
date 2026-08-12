import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.freecall.app",
  appName: "Free Call",
  webDir: "dist",
  server: {
    // https scheme keeps the WebView a secure context so getUserMedia
    // (camera + microphone) works for WebRTC calls.
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
