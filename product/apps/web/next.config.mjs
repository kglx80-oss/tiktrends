/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone', transpilePackages: ['@tiktrends/ui', '@tiktrends/core', '@tiktrends/ai', '@tiktrends/db'] };
export default nextConfig;
