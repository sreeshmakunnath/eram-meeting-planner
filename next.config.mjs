/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // ws must not be bundled: webpack stubs its optional `bufferutil` and ws then crashes on `bufferUtil.mask`.
    serverComponentsExternalPackages: ["pg", "@neondatabase/serverless", "ws", "bcryptjs", "exceljs"],
    serverActions: { bodySizeLimit: "6mb" }, // Excel import uploads
    // Emails embed the logo read from disk; make sure Vercel ships it with the server functions.
    outputFileTracingIncludes: { "/**": ["./public/eram-workforce-logo-dark-bg-800w.png"] },
  },
};
export default nextConfig;
