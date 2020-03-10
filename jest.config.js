
module.exports = {
  preset: 'jest-puppeteer',
  bail: 1,
  testRegex: './*\\.e2e\\.tsx?$',
  transform: {
		"^.+\\.tsx?$": "ts-jest",
  },
  moduleNameMapper: {
    "^.+\\.module\\.(css|sass|scss)$": "identity-obj-proxy",
  },
};
