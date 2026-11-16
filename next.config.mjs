/** @type {import('next').NextConfig} */
const nextConfig = {
  // ws must not be bundled: the bundler stubs its optional `bufferutil` and ws then crashes on `bufferUtil.mask`.
  serverExternalPackages: ["pg", "@neondatabase/serverless", "ws", "bcryptjs", "exceljs"],
  // Emails and Excel exports embed the logo read from disk; make sure Vercel ships it with the server functions.
  outputFileTracingIncludes: { "/**": ["./public/eram-workforce-logo-dark-bg-800w.png", "./public/eram-workforce-logo-400w.png"] },
  // Browser hardening: no framing (clickjacking), no MIME sniffing, no full URLs sent to other sites.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
  experimental: {
    serverActions: { bodySizeLimit: "6mb" }, // Excel import uploads
  },
};
export default nextConfig;
