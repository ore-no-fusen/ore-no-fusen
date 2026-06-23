import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import EndrollMatsuri, { type Supporter } from './EndrollMatsuri';

afterEach(() => {
    cleanup();
});

const supporters: Supporter[] = [
    { name: '最初の応援者', joinedAt: 1704067200000, amount: 1000, comment: '応援しています' },
    { name: 'Second Supporter', joinedAt: 1704153600000 },
    { name: '三人目', joinedAt: 1704240000000 },
];

describe('EndrollMatsuri', () => {
    it('renders with default props without crashing', () => {
        render(<EndrollMatsuri />);

        expect(screen.getByLabelText('応援してくれた人たちの奉納帳')).toBeTruthy();
    });

    it('shows the supporter count from props', () => {
        render(<EndrollMatsuri supporters={supporters} />);

        expect(screen.getAllByText('3人が応援').length).toBeGreaterThan(0);
    });

    it('shows the earliest supporter as a founding member', () => {
        render(<EndrollMatsuri supporters={supporters} />);

        expect(screen.getAllByText('最初の応援者').length).toBeGreaterThan(0);
        expect(screen.getAllByText('創設メンバー').length).toBeGreaterThan(0);
    });

    it('shows supporter amount and comment', () => {
        render(<EndrollMatsuri supporters={supporters} />);

        expect(screen.getAllByText('¥1,000').length).toBeGreaterThan(0);
        expect(screen.getAllByText('応援しています').length).toBeGreaterThan(0);
    });

    it('shows supporter joined date', () => {
        render(<EndrollMatsuri supporters={supporters} />);

        expect(screen.getAllByText('2024/1/1').length).toBeGreaterThan(0);
    });

    it('shows invitation when supporters are empty', () => {
        render(<EndrollMatsuri supporters={[]} />);

        expect(screen.getByText('奉納帳は、まだ まっさらです')).toBeTruthy();
        expect(screen.getByText('あなたが、最初の灯に。')).toBeTruthy();
        expect(screen.getByText('一番乗りの名前は、いちばん大きく・いちばん上に・ずっと。')).toBeTruthy();
    });

    it('shows the heading', () => {
        render(<EndrollMatsuri supporters={supporters} />);

        expect(screen.getByRole('heading', { name: '奉納帳' })).toBeTruthy();
    });
});
