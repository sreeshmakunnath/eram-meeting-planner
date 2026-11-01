/** @type {import('next').NextConfig} */
const nextConfig = {
  // ws must not be bundled: the bundler stubs its optional `bufferutil` and ws then crashes on `bufferUtil.mask`.
  serverExternalPackages: ["pg", "@neondatabase/serverless", "ws", "bcryptjs", "exceljs"],
  // Emails embed the logo read from disk; make sure Vercel ships it with the server functions.
  outputFileTracingIncludes: { "/**": ["./public/eram-workforce-logo-dark-bg-800w.png"] },
  experimental: {
    serverActions: { bodySizeLimit: "6mb" }, // Excel import uploads
  },
};
export default nextConfig;
