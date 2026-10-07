module.exports = {
  root: true,
  env: { browser: true, es2021: true },
  extends: [
    "eslint:recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
  ],
  ignorePatterns: ["dist", ".eslintrc.cjs"],
  parserOptions: { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } },
  settings: { react: { version: "18.3" } },
  plugins: ["react-refresh"],
  rules: {
    "react/react-in-jsx-scope": "off",
    "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
  },
};
