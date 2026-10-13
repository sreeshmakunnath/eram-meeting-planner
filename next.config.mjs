/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverComponentsExternalPackages: ["pg", "bcryptjs"] },
};
export default nextConfig;
