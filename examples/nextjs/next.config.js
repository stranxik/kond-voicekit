const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@kond.studio/voicekit"],
  turbopack: {
    root: path.join(__dirname),
  },
};

module.exports = nextConfig;
