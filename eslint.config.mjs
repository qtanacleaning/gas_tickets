const nextVitals = await import("eslint-config-next/core-web-vitals")
  .then((m) => (Array.isArray(m.default) ? m.default : [m.default]))
  .catch(() => []);
const nextTs = await import("eslint-config-next/typescript")
  .then((m) => (Array.isArray(m.default) ? m.default : [m.default]))
  .catch(() => []);

export default [
  {
    ignores: [".next/**", "out/**", "build/**", "next-env.d.ts"],
  },
  ...nextVitals,
  ...nextTs,
];
