type QueuedRequest<T> = { value: T; receivedAt: number };

export class FreshRequestQueue<T> {
    private readonly items: QueuedRequest<T>[] = [];

    constructor(
        private readonly maxSize: number,
        private readonly maxAgeMs: number,
    ) {}

    push(value: T, receivedAt: number): boolean {
        this.discardExpired(receivedAt);
        if (this.items.length >= this.maxSize) return false;
        this.items.push({ value, receivedAt });
        return true;
    }

    take(now: number): T | undefined {
        this.discardExpired(now);
        return this.items.shift()?.value;
    }

    private discardExpired(now: number) {
        while (this.items.length > 0 && now - this.items[0].receivedAt > this.maxAgeMs) {
            this.items.shift();
        }
    }
}
