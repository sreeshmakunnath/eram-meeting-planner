/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["pg", "bcryptjs", "exceljs"],
    serverActions: { bodySizeLimit: "6mb" }, // Excel import uploads
  },
};
export default nextConfig;
