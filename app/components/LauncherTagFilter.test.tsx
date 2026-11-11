import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import LauncherTagFilter from './LauncherTagFilter';

let width = 100;
const options = ['仕事をまとめる', '生活', '趣味', '未分類'].map(label => ({ value: label, label }));
const change = vi.fn();
const context = vi.fn();
function Filter({ initial = 'all', english = false }: { initial?: string; english?: boolean }) {
    const [value, setValue] = useState(initial);
    return <LauncherTagFilter options={options} value={value} allValue="all" english={english}
        onChange={next => { change(next); setValue(next); }} onContextMenu={context}>
        <button>＋</button>
    </LauncherTagFilter>;
}
beforeEach(() => {
    width = 100; vi.clearAllMocks();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        const w = this.tagName === 'SPAN' ? (this.textContent?.length ?? 0) * 11 + 20 : width;
        return { width: w, height: 28, x: 0, y: 0, left: 0, top: 0, right: w, bottom: 28, toJSON() {} };
    });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('launcher compact and expanded tag choices', () => {
    it('exposes whole fitting tags only, with All, expansion and management always available', () => {
        render(<Filter />);
        expect(screen.getByRole('button', { name: '仕事をまとめる' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: '生活' })).toBeNull();
        expect(screen.getByRole('button', { name: 'すべて' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'すべてのタグ ▾' }).getAttribute('aria-expanded')).toBe('false');
        expect(screen.getByRole('button', { name: '＋' })).toBeTruthy();
    });
    it('shows all choices in their original order and collapses onto the chosen tag', () => {
        render(<Filter />);
        fireEvent.click(screen.getByRole('button', { name: 'すべてのタグ ▾' }));
        const labels = screen.getAllByRole('button').map(button => button.textContent);
        expect(labels.slice(1, 5)).toEqual(options.map(option => option.label));
        fireEvent.click(screen.getByRole('button', { name: '未分類' }));
        expect(change).toHaveBeenCalledWith('未分類');
        expect(screen.getByRole('button', { name: '未分類' }).getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByRole('button', { name: 'すべてのタグ ▾' })).toBeTruthy();
    });
    it('keeps the selection after the window becomes narrower without changing the filter', () => {
        width = 320; render(<Filter initial="趣味" />);
        width = 35; fireEvent(window, new Event('resize'));
        expect(screen.getByRole('button', { name: '趣味' }).getAttribute('aria-pressed')).toBe('true');
        expect(screen.queryByRole('button', { name: '仕事をまとめる' })).toBeNull();
        expect(change).not.toHaveBeenCalled();
    });
    it('right click preserves expansion and the selection', () => {
        render(<Filter initial="趣味" />);
        fireEvent.click(screen.getByRole('button', { name: 'すべてのタグ ▾' }));
        fireEvent.contextMenu(screen.getByRole('button', { name: '生活' }));
        expect(context).toHaveBeenCalledWith('生活', expect.anything());
        expect(change).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: '折りたたむ ▴' })).toBeTruthy();
    });
    it('Escape collapses the tags without reaching the launcher close handler', () => {
        const parent = vi.fn();
        render(<div onKeyDown={parent}><Filter /></div>);
        fireEvent.click(screen.getByRole('button', { name: 'すべてのタグ ▾' }));
        fireEvent.keyDown(screen.getByRole('button', { name: '生活' }), { key: 'Escape' });
        expect(parent).not.toHaveBeenCalled();
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'すべてのタグ ▾' }));
    });
    it('All also collapses and retains English labels', () => {
        render(<Filter initial="生活" english />);
        fireEvent.click(screen.getByRole('button', { name: 'All tags ▾' }));
        fireEvent.click(screen.getByRole('button', { name: 'All' }));
        expect(change).toHaveBeenCalledWith('all');
        expect(screen.getByRole('button', { name: 'All tags ▾' })).toBeTruthy();
    });
    it('still shows the first tag when a single name is wider than the compact space', () => {
        width = 35; render(<Filter />);
        expect(screen.getByRole('button', { name: '仕事をまとめる' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: '生活' })).toBeNull();
    });
    it('does not advertise tag actions for a choice without a context action', () => {
        render(<LauncherTagFilter options={options} value="未分類" allValue="all" english={false}
            onChange={change} onContextMenu={context} actionTitle={value => value === '未分類' ? undefined : '右クリック'} />);
        expect(screen.getByRole('button', { name: '未分類' }).title).toBe('未分類');
        fireEvent.click(screen.getByRole('button', { name: 'すべてのタグ ▾' }));
        expect(screen.getByRole('button', { name: '生活' }).title).toContain('右クリック');
    });
});
