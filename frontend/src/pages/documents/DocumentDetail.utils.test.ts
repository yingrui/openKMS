import { describe, expect, it } from 'vitest';
import {
  buildPageBlocks,
  getPageImageItems,
  shouldStartInLargeDocumentMode,
} from './DocumentDetail.utils';
import type { ParsingResult } from './DocumentDetail.types';

describe('shouldStartInLargeDocumentMode', () => {
  it('returns false for small documents', () => {
    const result: ParsingResult = {
      layout_det_res: [{ input_img: 'page-1.png' }, { input_img: 'page-2.png' }],
    };

    expect(shouldStartInLargeDocumentMode(result, '# Short doc')).toBe(false);
  });

  it('returns true when markdown is very large', () => {
    expect(shouldStartInLargeDocumentMode(null, 'a'.repeat(200_000))).toBe(true);
  });

  it('returns true when page image count hits threshold', () => {
    const result: ParsingResult = {
      layout_det_res: Array.from({ length: 80 }, (_, i) => ({ input_img: `page-${i + 1}.png` })),
    };

    expect(shouldStartInLargeDocumentMode(result, 'small')).toBe(true);
  });
});

describe('getPageImageItems', () => {
  it('filters out layout entries without input images', () => {
    const items = getPageImageItems([
      { input_img: 'page-1.png' },
      {},
      { input_img: 'page-2.png' },
    ]);

    expect(items).toEqual([
      { input_img: 'page-1.png' },
      { input_img: 'page-2.png' },
    ]);
  });
});

describe('buildPageBlocks', () => {
  it('returns no blocks while deferred images are hidden', () => {
    const result: ParsingResult = {
      layout_det_res: [{ boxes: [{ coordinate: [0, 0, 10, 10] }] }],
      parsing_res_list: [{ label: 'title', content: 'Hello', bbox: [0, 0, 10, 10] }],
    };

    expect(buildPageBlocks(result, false)).toEqual([]);
  });

  it('matches parsing items by bbox coordinates', () => {
    const result: ParsingResult = {
      layout_det_res: [
        { boxes: [{ coordinate: [10, 20, 30, 40], label: 'heading' }] },
      ],
      parsing_res_list: [
        { label: 'Heading', content: 'Intro', bbox: [11, 19, 29, 41], image_path: 'crop-1.png' },
      ],
    };

    expect(buildPageBlocks(result, true)).toEqual([
      {
        pageIndex: 0,
        coordinate: [10, 20, 30, 40],
        label: 'heading',
        parsingItem: { label: 'Heading', content: 'Intro', bbox: [11, 19, 29, 41], image_path: 'crop-1.png' },
      },
    ]);
  });

  it('prefers layout box block_index over global coordinate matching', () => {
    const result: ParsingResult = {
      layout_det_res: [
        {
          boxes: [
            {
              coordinate: [100, 100, 200, 200],
              label: 'chart',
              block_index: 1,
            },
          ],
        },
      ],
      parsing_res_list: [
        { label: 'text', content: 'Wrong match', bbox: [101, 101, 199, 199] },
        { label: 'chart', content: 'Chart block', bbox: [500, 500, 600, 600] },
      ],
    };

    expect(buildPageBlocks(result, true)).toEqual([
      {
        pageIndex: 0,
        coordinate: [100, 100, 200, 200],
        label: 'chart',
        parsingItem: { label: 'chart', content: 'Chart block', bbox: [500, 500, 600, 600] },
      },
    ]);
  });

  it('builds coordinates from polygon points and falls back when no parsing item matches', () => {
    const result: ParsingResult = {
      layout_det_res: [
        {
          boxes: [
            {
              polygon_points: [[3, 4], [9, 4], [9, 11], [3, 11]],
            },
          ],
        },
      ],
      parsing_res_list: [],
    };

    expect(buildPageBlocks(result, true)).toEqual([
      {
        pageIndex: 0,
        coordinate: [3, 4, 9, 11],
        label: 'block',
        parsingItem: { label: 'unknown', content: '' },
      },
    ]);
  });
});
