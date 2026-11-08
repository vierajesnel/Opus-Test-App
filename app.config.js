/**
 * Extends app.json at build time. GitHub Pages serves project sites under
 * /<repo>/, so CI sets STARWAKE_BASE_URL for the web export; local
 * development and native builds are unaffected.
 */
module.exports = ({ config }) => {
  const baseUrl = process.env.STARWAKE_BASE_URL;
  if (!baseUrl) return config;
  return { ...config, experiments: { ...config.experiments, baseUrl } };
};
