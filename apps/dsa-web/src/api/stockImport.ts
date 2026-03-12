import apiClient from './index';

// Types matching backend schemas
export interface StockImportItem {
  code: string | null;
  name: string | null;
  confidence: string; // 'high' | 'medium' | 'low'
}

export interface ImageExtractRequest {
  image_data: string;
  mime_type: string;
}

export interface ImageExtractResponse {
  items: StockImportItem[];
  raw_text: string;
}

export interface ParseImportRequest {
  content: string;
  content_type: string; // 'text' | 'csv' | 'excel'
  filename?: string;
}

export interface ParseImportResponse {
  items: StockImportItem[];
}

// API Implementation
export const stockImportApi = {
  /**
   * Extract stocks from image using Vision LLM
   */
  extractFromImage: async (request: ImageExtractRequest): Promise<ImageExtractResponse> => {
    const response = await apiClient.post<ImageExtractResponse>(
      '/api/v1/stocks/extract-from-image',
      request
    );
    return response.data;
  },

  /**
   * Parse stocks from text or file content
   */
  parseImport: async (request: ParseImportRequest): Promise<ParseImportResponse> => {
    const response = await apiClient.post<ParseImportResponse>(
      '/api/v1/stocks/parse-import',
      request
    );
    return response.data;
  },
};
