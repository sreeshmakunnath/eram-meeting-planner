/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // ws must not be bundled: webpack stubs its optional `bufferutil` and ws then crashes on `bufferUtil.mask`.
    serverComponentsExternalPackages: ["pg", "@neondatabase/serverless", "ws", "bcryptjs", "exceljs"],
    serverActions: { bodySizeLimit: "6mb" }, // Excel import uploads
  },
};
export default nextConfig;
