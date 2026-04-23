module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
  },
  extends: ['eslint:recommended'],
  parserOptions: {
    ecmaVersion: 'latest',
  },
  rules: {
    'no-unused-vars': 'off',
    'no-irregular-whitespace': ['error', {
      skipStrings: true,
      skipComments: true,
      skipTemplates: true,
      skipRegExps: true,
    }],
  },
}