/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone', transpilePackages: ['@tiktrends/ui', '@tiktrends/core', '@tiktrends/ai', '@tiktrends/db', '@tiktrends/integrations'] };
export default nextConfig;
