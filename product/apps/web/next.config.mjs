/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone', transpilePackages: ['@tiktrends/ui', '@tiktrends/core', '@tiktrends/ai', '@tiktrends/db', '@tiktrends/integrations'],
  // La Veille s'appelait `/inspo` · la route est renommée `/veille` pour coller au
  // libellé. Un redirect permanent garde les anciens favoris et liens vivants.
  async redirects() {
    return [
      { source: '/inspo', destination: '/veille', permanent: true },
      { source: '/inspo/:path*', destination: '/veille/:path*', permanent: true },
    ];
  },
};
export default nextConfig;
