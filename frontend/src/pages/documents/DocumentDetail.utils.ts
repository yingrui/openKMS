import type {
  ExampleDocumentConfig,
  LayoutDetItem,
  PageBlock,
  ParsingResult,
} from './DocumentDetail.types';

// Map document id to example folder (folder hash + markdown filename)
export const documentToFolder: Record<string, ExampleDocumentConfig> = {
  '1': {
    folderId: 'da4627b85a2d5dec05cc2dcad281a611a5c6f79bcb8fd1ecfa2f34f19b552871',
    markdownFile: 'tmpau_x_tty.md',
  },
  '2': {
    folderId: 'f3b3be345bf2df8979f2491ca9466e078e4fd1d6a216611faa8566e4c44d474b',
    markdownFile: 'tmpp2p37481.md',
  },
};

const LARGE_DOCUMENT_MARKDOWN_THRESHOLD = 200_000;
const LARGE_DOCUMENT_PAGE_IMAGE_THRESHOLD = 80;

export function shouldStartInLargeDocumentMode(
  result: ParsingResult | null | undefined,
  markdown: string | null | undefined
): boolean {
  const pageImageCount = Array.isArray(result?.layout_det_res)
    ? result.layout_det_res.reduce((count, item) => count + (item?.input_img ? 1 : 0), 0)
    : 0;
  return (
    pageImageCount >= LARGE_DOCUMENT_PAGE_IMAGE_THRESHOLD ||
    (markdown?.length ?? 0) >= LARGE_DOCUMENT_MARKDOWN_THRESHOLD
  );
}

export function getPageImageItems(layoutDetRes: LayoutDetItem[] | undefined): LayoutDetItem[] {
  return Array.isArray(layoutDetRes) ? layoutDetRes.filter((item) => item.input_img) : [];
}

export function buildPageBlocks(
  parsingResult: ParsingResult | null | undefined,
  shouldRenderDeferredImages: boolean
): PageBlock[] {
  if (!shouldRenderDeferredImages || !parsingResult?.layout_det_res || !parsingResult.parsing_res_list) {
    return [];
  }

  const list: PageBlock[] = [];
  const parsingList = parsingResult.parsing_res_list;

  const coordMatch = (a: number[], b: number[], tol = 2) =>
    a.length >= 4 && b.length >= 4 &&
    Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol &&
    Math.abs(a[2] - b[2]) <= tol && Math.abs(a[3] - b[3]) <= tol;

  const layout = parsingResult.layout_det_res;
  for (let pi = 0; pi < layout.length; pi++) {
    const item = layout[pi];
    const boxes = item?.boxes ?? [];
    for (let bi = 0; bi < boxes.length; bi++) {
      const box = boxes[bi];
      let coordFlat: number[] | null = null;
      if (Array.isArray(box?.coordinate) && box.coordinate.length >= 4) {
        coordFlat = box.coordinate.slice(0, 4);
      } else if (Array.isArray(box?.polygon_points) && box.polygon_points.length >= 2) {
        const pts = box.polygon_points.flat() as number[];
        const xs = pts.filter((_, i) => i % 2 === 0);
        const ys = pts.filter((_, i) => i % 2 === 1);
        if (xs.length && ys.length) {
          coordFlat = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
        }
      }
      if (!coordFlat) continue;

      let parsingIdx = -1;
      const blockIndex = box?.block_index;
      if (
        typeof blockIndex === 'number' &&
        blockIndex >= 0 &&
        blockIndex < parsingList.length
      ) {
        parsingIdx = blockIndex;
      } else {
        parsingIdx = parsingList.findIndex((p) => {
          const bbox = p.bbox;
          return Array.isArray(bbox) && coordMatch(coordFlat!, bbox as number[]);
        });
      }
      const parsingItem = parsingIdx >= 0 ? parsingList[parsingIdx] : undefined;
      list.push({
        pageIndex: pi,
        coordinate: coordFlat,
        label: box?.label ?? parsingItem?.label ?? 'block',
        parsingItem: parsingItem ?? { label: 'unknown', content: '' },
      });
    }
  }

  return list;
}
