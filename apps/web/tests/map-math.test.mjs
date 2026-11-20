import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fitMap, parseCoordinate, worldPixel } from '../app/workspace/documents/[documentId]/map-math.ts';

test('coordinates are read as latitude then longitude and checked for range', () => {
  assert.deepEqual(parseCoordinate('-33.8688, 151.2093'), { lat: -33.8688, lng: 151.2093 });
  assert.deepEqual(parseCoordinate('51.5 -0.12'), { lat: 51.5, lng: -0.12 });
  assert.equal(parseCoordinate('91, 10'), null);
  assert.equal(parseCoordinate('10, 181'), null);
  assert.equal(parseCoordinate('Sydney'), null);
  assert.equal(parseCoordinate(5), null);
  assert.equal(parseCoordinate('1, 2, 3'), null);
});

test('world pixels put the equator and prime meridian at the middle of the map', () => {
  const centre = worldPixel(0, 0, 2);
  assert.equal(Math.round(centre.x), 512); assert.equal(Math.round(centre.y), 512);
  assert.ok(worldPixel(60, 0, 3).y < worldPixel(-60, 0, 3).y, 'north is up');
});

test('a single place gets a close zoom; spread-out places zoom out until they fit', () => {
  assert.equal(fitMap([{ lat: 10, lng: 10 }], 640, 320).zoom, 12);
  const near = fitMap([{ lat: -33.86, lng: 151.2 }, { lat: -33.9, lng: 151.25 }], 640, 320);
  const far = fitMap([{ lat: -33.86, lng: 151.2 }, { lat: 51.5, lng: -0.12 }], 640, 320);
  assert.ok(near.zoom > far.zoom);
  assert.ok(far.zoom >= 0 && far.zoom <= 2);
  const spot = worldPixel(-33.86, 151.2, near.zoom); const other = worldPixel(-33.9, 151.25, near.zoom);
  assert.ok(Math.abs(spot.x - other.x) <= 640 - 90 && Math.abs(spot.y - other.y) <= 320 - 90, 'both points fit with a margin');
});
