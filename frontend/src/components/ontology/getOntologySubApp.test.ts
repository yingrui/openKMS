import { describe, expect, it } from 'vitest';
import { getOntologySubApp, isFunctionEditorWorkspacePath } from './getOntologySubApp';

describe('isFunctionEditorWorkspacePath', () => {
  it('treats a function id as the editor', () => {
    expect(isFunctionEditorWorkspacePath('/function-editor/new')).toBe(true);
    expect(isFunctionEditorWorkspacePath('/function-editor/fn-123')).toBe(true);
  });

  it('keeps list routes out — they need the rail and the page gutter', () => {
    // `logic` once matched "[^/]+", so the list rendered full-bleed with no rail.
    expect(isFunctionEditorWorkspacePath('/function-editor/logic')).toBe(false);
    expect(isFunctionEditorWorkspacePath('/function-editor')).toBe(false);
    expect(isFunctionEditorWorkspacePath('/function-editor/logic/new')).toBe(false);
  });
});

describe('getOntologySubApp', () => {
  it('routes both editor menus to the function-editor rail', () => {
    expect(getOntologySubApp('/function-editor')).toBe('function-editor');
    expect(getOntologySubApp('/function-editor/logic')).toBe('function-editor');
    expect(getOntologySubApp('/function-editor/fn-123')).toBe('function-editor');
  });
});
