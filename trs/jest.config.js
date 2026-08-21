module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  roots: ['<rootDir>/apps', '<rootDir>/libs'],
  testRegex: '.*\\.(spec|e2e-spec)\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  moduleNameMapper: {
    '^@app/adapter-kit$': '<rootDir>/libs/adapter-kit/src',
    '^@app/adapter-kit/(.*)$': '<rootDir>/libs/adapter-kit/src/$1',
    '^@app/adapter-did-web$': '<rootDir>/libs/adapter-did-web/src',
    '^@app/adapter-trusted-list$': '<rootDir>/libs/adapter-trusted-list/src',
    '^@app/adapter-registrar$': '<rootDir>/libs/adapter-registrar/src',
    '^@app/jws$': '<rootDir>/libs/jws/src',
    '^@app/cache$': '<rootDir>/libs/cache/src',
  },
  testEnvironment: 'node',
};
