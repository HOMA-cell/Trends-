module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2022: true,
  },
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  ignorePatterns: [
    "node_modules/",
    "supabase/",
    ".git/",
  ],
  globals: {
    requestIdleCallback: "readonly",
    cancelIdleCallback: "readonly",
  },
  extends: ["eslint:recommended"],
  rules: {
    "no-unused-vars": [
      "warn",
      {
        args: "none",
        ignoreRestSiblings: true,
      },
    ],
    "no-console": "off",
  },
};
