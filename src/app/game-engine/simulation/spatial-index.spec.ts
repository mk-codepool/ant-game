import { SpatialIndex, type SpatialEntity } from './spatial-index';

interface TestEntity extends SpatialEntity {
  name: string;
}

describe('SpatialIndex', () => {
  it('queries entities by radius and bounds', () => {
    const index = new SpatialIndex<TestEntity>(10);
    const a = { id: 1, name: 'a', position: { x: 5, y: 5 } };
    const b = { id: 2, name: 'b', position: { x: 25, y: 5 } };
    const c = { id: 3, name: 'c', position: { x: 60, y: 60 } };

    index.insert(a);
    index.insert(b);
    index.insert(c);

    expect(index.queryRadius(5, 5, 21).map((entity) => entity.id).sort()).toEqual([1, 2]);
    expect(index.queryBounds(0, 30, 0, 10).map((entity) => entity.id).sort()).toEqual([1, 2]);
  });

  it('updates and removes entities without leaving stale bucket entries', () => {
    const index = new SpatialIndex<TestEntity>(10);
    const entity = { id: 1, name: 'a', position: { x: 5, y: 5 } };

    index.insert(entity);
    const oldPosition = { ...entity.position };
    entity.position = { x: 105, y: 105 };
    index.update(entity, oldPosition);

    expect(index.queryRadius(5, 5, 10)).toEqual([]);
    expect(index.queryRadius(105, 105, 10).map((item) => item.id)).toEqual([1]);

    index.remove(entity.id);
    expect(index.queryRadius(105, 105, 10)).toEqual([]);
  });
});
