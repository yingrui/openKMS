import { describe, expect, it } from 'vitest';
import {
  AUTHORING_OF_SOURCE,
  backToListPath,
  hasUnpublishedDraft,
} from './functionEditorState';

describe('AUTHORING_OF_SOURCE', () => {
  it('reads the registry value, defaulting to code', () => {
    expect(AUTHORING_OF_SOURCE('logic')).toBe('logic');
    expect(AUTHORING_OF_SOURCE('code')).toBe('code');
    expect(AUTHORING_OF_SOURCE(null)).toBe('code');
    expect(AUTHORING_OF_SOURCE(undefined)).toBe('code');
  });
});

describe('backToListPath', () => {
  it('returns to the list the function belongs to', () => {
    expect(backToListPath('logic')).toBe('/function-editor/logic');
    expect(backToListPath('code')).toBe('/function-editor');
  });
});

describe('hasUnpublishedDraft', () => {
  it('offers publish when the draft is newer than the published version', () => {
    expect(hasUnpublishedDraft(4, 3)).toBe(true);
  });

  it('does not offer publish when the latest draft is already live', () => {
    expect(hasUnpublishedDraft(3, 3)).toBe(false);
  });

  it('treats a never-published function as having something to publish', () => {
    expect(hasUnpublishedDraft(1, null)).toBe(true);
    expect(hasUnpublishedDraft(null, null)).toBe(true);
  });
});
