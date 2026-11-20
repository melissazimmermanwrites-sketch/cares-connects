import { describe, expect, it } from 'vitest';
import { applyMarkdownAction } from './markdown-actions';

describe('applyMarkdownAction', () => {
  it('wraps the selection and keeps it selected', () => {
    const edit = applyMarkdownAction('make this bold', 5, 9, 'bold');
    expect(edit.text).toBe('make **this** bold');
    expect(edit.text.slice(edit.selectionStart, edit.selectionEnd)).toBe('this');
  });

  it('inserts selected placeholder text when nothing is selected', () => {
    const edit = applyMarkdownAction('', 0, 0, 'italic');
    expect(edit.text).toBe('_italic text_');
    expect(edit.text.slice(edit.selectionStart, edit.selectionEnd)).toBe('italic text');
  });

  it('builds a link and selects the address to replace', () => {
    const edit = applyMarkdownAction('see here', 4, 8, 'link');
    expect(edit.text).toBe('see [here](https://)');
    expect(edit.text.slice(edit.selectionStart, edit.selectionEnd)).toBe('https://');
  });

  it('prefixes every selected line', () => {
    expect(applyMarkdownAction('one\ntwo\nthree', 0, 7, 'bullets').text).toBe('- one\n- two\nthree');
    expect(applyMarkdownAction('one\ntwo', 0, 7, 'numbers').text).toBe('1. one\n2. two');
    expect(applyMarkdownAction('a\nsay this\nb', 4, 4, 'quote').text).toBe('a\n> say this\nb');
    expect(applyMarkdownAction('title', 2, 2, 'heading').text).toBe('## title');
  });
});
