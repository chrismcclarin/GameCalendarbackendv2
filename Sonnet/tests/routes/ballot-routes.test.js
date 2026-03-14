// tests/routes/ballot-routes.test.js
// TDD RED: Tests for ballot route module structure and validators

describe('Ballot route module', () => {
  it('should export an Express router', () => {
    const ballot = require('../../routes/ballot');
    expect(ballot).toBeDefined();
    expect(typeof ballot).toBe('function'); // Express routers are functions
    // Express routers have a .stack property with route layers
    expect(ballot.stack).toBeDefined();
    expect(Array.isArray(ballot.stack)).toBe(true);
  });

  it('should have GET /:eventId route', () => {
    const ballot = require('../../routes/ballot');
    const routes = ballot.stack
      .filter(layer => layer.route)
      .map(layer => ({
        path: layer.route.path,
        methods: Object.keys(layer.route.methods),
      }));
    const getRoute = routes.find(r => r.path === '/:eventId' && r.methods.includes('get'));
    expect(getRoute).toBeDefined();
  });

  it('should have POST /:eventId/options route', () => {
    const ballot = require('../../routes/ballot');
    const routes = ballot.stack
      .filter(layer => layer.route)
      .map(layer => ({
        path: layer.route.path,
        methods: Object.keys(layer.route.methods),
      }));
    const postRoute = routes.find(r => r.path === '/:eventId/options' && r.methods.includes('post'));
    expect(postRoute).toBeDefined();
  });

  it('should have PUT /:eventId/options route', () => {
    const ballot = require('../../routes/ballot');
    const routes = ballot.stack
      .filter(layer => layer.route)
      .map(layer => ({
        path: layer.route.path,
        methods: Object.keys(layer.route.methods),
      }));
    const putRoute = routes.find(r => r.path === '/:eventId/options' && r.methods.includes('put'));
    expect(putRoute).toBeDefined();
  });

  it('should have POST /:eventId/vote route', () => {
    const ballot = require('../../routes/ballot');
    const routes = ballot.stack
      .filter(layer => layer.route)
      .map(layer => ({
        path: layer.route.path,
        methods: Object.keys(layer.route.methods),
      }));
    const voteRoute = routes.find(r => r.path === '/:eventId/vote' && r.methods.includes('post'));
    expect(voteRoute).toBeDefined();
  });

  it('should have POST /:eventId/resolve-tie route', () => {
    const ballot = require('../../routes/ballot');
    const routes = ballot.stack
      .filter(layer => layer.route)
      .map(layer => ({
        path: layer.route.path,
        methods: Object.keys(layer.route.methods),
      }));
    const tieRoute = routes.find(r => r.path === '/:eventId/resolve-tie' && r.methods.includes('post'));
    expect(tieRoute).toBeDefined();
  });
});

describe('Ballot validators', () => {
  it('should export validateBallotOptions', () => {
    const validators = require('../../middleware/validators');
    expect(validators.validateBallotOptions).toBeDefined();
    expect(Array.isArray(validators.validateBallotOptions)).toBe(true);
  });

  it('should export validateBallotVote', () => {
    const validators = require('../../middleware/validators');
    expect(validators.validateBallotVote).toBeDefined();
    expect(Array.isArray(validators.validateBallotVote)).toBe(true);
  });
});

describe('Server mounts ballot routes', () => {
  it('should reference ballot route in server.js', () => {
    const fs = require('fs');
    const path = require('path');
    const serverCode = fs.readFileSync(path.join(__dirname, '../../server.js'), 'utf-8');
    expect(serverCode).toContain("require('./routes/ballot')");
    expect(serverCode).toContain("/api/ballot");
  });
});

describe('Frontend ballotAPI client', () => {
  it('should have ballotAPI export in api.js', () => {
    const fs = require('fs');
    const path = require('path');
    const apiCode = fs.readFileSync(
      path.join(__dirname, '../../../../periodictabletop/src/lib/api.js'),
      'utf-8'
    );
    expect(apiCode).toContain('ballotAPI');
    expect(apiCode).toContain('getBallot');
    expect(apiCode).toContain('setBallotOptions');
    expect(apiCode).toContain('updateBallotOptions');
    expect(apiCode).toContain('toggleVote');
    expect(apiCode).toContain('resolveTie');
  });
});
