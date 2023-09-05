module.exports = {
  extends: [
    './node_modules/dts-cli/conf/eslint-config-react-app/index.js',
    './node_modules/eslint-config-prettier/index.js',
    'plugin:prettier/recommended',
  ],
  settings: {
    react: {
      version: '999.999.999',
    },
  },
  ignorePatterns: ['node_modules/', 'dist/'],
};
