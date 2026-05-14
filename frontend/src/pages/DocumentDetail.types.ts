export interface ParsingResultItem {
  label: string;
  content: string;
  bbox?: number[];
  image_path?: string;
}

export interface LayoutBox {
  coordinate?: number[];
  polygon_points?: number[][] | [number, number][];
  label?: string;
  block_index?: number;
}

export interface LayoutDetItem {
  _images?: { res?: string };
  input_img?: string;
  boxes?: LayoutBox[];
}

export interface SpreadsheetSheet {
  name: string;
  rows: string[][];
  truncated_rows?: boolean;
  truncated_cols?: boolean;
  /** Mind map (`.xmind`) sheet metadata when `document_kind` is `mindmap`. */
  topic_count?: number;
}

export interface ParsingResult {
  file_hash?: string;
  parsing_res_list?: ParsingResultItem[];
  layout_det_res?: LayoutDetItem[];
  document_kind?: string;
  sheets?: SpreadsheetSheet[];
  /** Mind map attachment list from backend when `document_kind` is `mindmap`. */
  attachments?: { path: string; size_bytes?: number }[];
  error?: string;
}

export interface PageBlock {
  pageIndex: number;
  coordinate: number[];
  label: string;
  parsingItem: ParsingResultItem;
}

export interface ExampleDocumentConfig {
  folderId: string;
  markdownFile: string;
}
