export function sleep(time: number) {
    return new Promise((resolve) => setTimeout(resolve, time));
}

export type AsyncTask = () => Promise<void>;

export class AsyncQueue {
    private queue: AsyncTask[] = [];

    enqueue(task: AsyncTask) {
        this.queue.push(task);
        this.work();
    }

    private workOngoing = false;
    private async work() {
        if (this.workOngoing) return;
        this.workOngoing = true;
        while (this.queue.length) {
            const task = this.queue.shift();
            if (task) await task();
        }
        this.workOngoing = false;
    }
}
