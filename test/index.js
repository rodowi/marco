const fs = require('fs');
const m = require('../lib/marco');
const readline = require('readline');
const test = require('tape').test;
const split = require('split');
const through = require('through2');

test('lineToJSON', (t) => {
  // GeoJSON lines
  t.deepEqual(m.lineToJSON(''), {});
  t.deepEqual(m.lineToJSON('{'), {});
  t.deepEqual(m.lineToJSON('"type": "FeatureCollection",'), {});
  t.deepEqual(m.lineToJSON(''), {});
  t.deepEqual(m.lineToJSON('"features": ['), {});
  t.deepEqual(m.lineToJSON(']'), {});
  t.deepEqual(m.lineToJSON('}'), {});

  // Random cases
  t.deepEqual(m.lineToJSON(null), {});
  t.deepEqual(m.lineToJSON('foo'), {});

  // Expected object creation
  t.deepEqual(m.lineToJSON('{"foo": "bar"}'), { foo: "bar" });
  t.deepEqual(m.lineToJSON('{"foo": "bar"},'), { foo: "bar" });
  t.deepEqual(m.lineToJSON('{"foo": "bar"}, '), { foo: "bar" });

  t.end();
});

test('matchInReadStream', (t) => {
  t.plan(7);

  var rl = readline.createInterface({
    input: fs.createReadStream(__dirname + '/fixtures/states.json')
  });

  var match = (obj) => (obj.geometry && obj.geometry.type == 'Polygon');
  m.matchInReadStream(match, rl, function (err, data) {
    t.false(err);
    t.equal(data.geometry.type, 'Polygon');
    t.equal(data.type, 'Feature');
    t.equal(data.properties.NOM_ENT, 'Baja California');
  });

  rl = readline.createInterface({
    input: fs.createReadStream(__dirname + '/fixtures/states.json')
  });
  match = (obj) => (obj.properties && obj.properties.NOM_ENT == 'Nuevo León');
  m.matchInReadStream(match, rl, function (err, data) {
    t.false(err);
    t.equal(data.geometry.type, 'Polygon');
    t.equal(data.properties.NOM_ENT, 'Nuevo León');
  });
});

test('findState', { skip: process.env.TRAVIS }, (t) => {
  t.plan(24);

  m.findState({ query: 'Aguascalientes' }, function (err, data) {
    t.false(err);
    t.equal(data.properties.NOM_ENT, 'Aguascalientes');
    t.equal(data.geometry.type, 'Polygon');
  });

  m.findState({ query: 'BAJA CALIFORNIA' }, function (err, data) {
    t.false(err);
    t.equal(data.properties.NOM_ENT, 'Baja California');
  });

  m.findState({
    query: 'BAJA CALIFORNIA',
    source: __dirname + '/fixtures/municipalities.json'
  }, function (err, data) {
    t.equal(data, null);
  });

  m.findState({ query: 'Null Island' }, function (err, data) {
    t.false(err);
    t.false(data);
  });

  // From the COVID database
  const covid = {
    'CHIAPAS': 'Chiapas',
    'CIUDAD DE MÉXICO': 'Distrito Federal',
    'COAHUILA': 'Coahuila de Zaragoza',
    'MÉXICO': 'México',
    'MICHOACÁN': 'Michoacán de Ocampo',
    'SINALOA': 'Sinaloa',
    'QUERETARO': 'Querétaro',
    'VERACRUZ': 'Veracruz de Ignacio de la Llave'
  };

  Object.keys(covid).forEach((query) => {
    m.findState({ query }, function (_, data) {
      t.false(!data, query);
      t.equal(data.properties.NOM_ENT, covid[query]);
    });
  });
});

test('findMunicipality', { skip: process.env.TRAVIS }, (t) => {
  t.plan(5);

  m.findMunicipality({
    query: 'Mexicali',
    source: __dirname + '/fixtures/municipalities.json'
  }, function (err, data) {
    t.false(err);
    t.equal(data.properties.NOM_MUN, 'Mexicali');
    t.equal(data.geometry.type, 'MultiPolygon');
  });

  m.findMunicipality({
    query: 'Null Island',
    source: __dirname + '/fixtures/municipalities.json'
  }, function (err, data) {
    t.false(err);
    t.false(data);
  });
});

function readableStreamFixture() {
  // Simulating pipe from command line
  var Readable = require('stream').Readable;
  var rs = Readable();
  rs._read = () => {
    rs.push('state, population\n');
    rs.push('Baja California, 3315766\n');
    rs.push('Mexicali, 1015766\n');
    rs.push(null);
  };
  return rs;
}

test('toStatePolygon', { skip: process.env.TRAVIS }, (t) => {
  t.plan(2);

  var rs = readableStreamFixture();
  var tr = through((buff, _, next) => {
    var feature = JSON.parse(buff.toString());
    var keys = ['type', 'properties', 'geometry'];
    t.equal(feature.properties.NOM_ENT, 'Baja California');
    t.deepEqual(Object.keys(feature), keys, 'should output a GeoJSON feature');
  });

  rs.pipe(split())
    .pipe(m.toStatePolygon())
    .pipe(tr);
});

test('toMunicipalityPolygon', { skip: process.env.TRAVIS }, (t) => {
  t.plan(2);

  var rs = readableStreamFixture();
  var tr = through((buff, _, next) => {
    var feature = JSON.parse(buff.toString());
    var keys = ['type', 'properties', 'geometry'];
    t.equal(feature.properties.NOM_MUN, 'Mexicali');
    t.deepEqual(Object.keys(feature), keys, 'should output a GeoJSON feature');
  });


  const source = __dirname + '/fixtures/municipalities.json';
  rs.pipe(split())
    .pipe(m.toMunicipalityPolygon({ source }))
    .pipe(tr);
});

test('toFeatureCollection', (t) => {
  t.plan(3);

  var buffer = '{ "foo": 1 }\n{ "bar" : 2 }';
  var fc = m.toFeatureCollection(buffer);

  t.true(fc.match("FeatureCollection"), 'builds a FeatureCollection');
  var obj = JSON.parse(fc);
  t.equal(obj.features.length, 2, 'wraps two features');
  t.equal(obj.features[0].foo, 1, 'haz foo');
});
