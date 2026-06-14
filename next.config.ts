import type { NextConfig } from "next";

// Sicherheits-Header für alle Routen. Kamera/Mikrofon bleiben für Foto-/
// Sprachaufnahme auf der eigenen Origin erlaubt; alles andere wird gesperrt.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
  // Browser ignorieren HSTS über http (z. B. lokal), erzwingen es über https.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    return [
      { source: "/projects", destination: "/c/franz/projects", permanent: false },
      { source: "/projects/:path*", destination: "/c/franz/projects/:path*", permanent: false },
    ];
  },
};

export default nextConfig;
