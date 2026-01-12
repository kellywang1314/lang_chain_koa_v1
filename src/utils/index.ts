/**
 * 兼容旧版 Node：为 Array.prototype 增加 toReversed
 * @returns {void}
 */
export function patchArrayToReversed(): void {
    const arrayProto = Array.prototype as any;
    if (!arrayProto.toReversed) {
        Object.defineProperty(arrayProto, 'toReversed', {
            value: function toReversed(this: any[]) {
                return this.slice().reverse();
            },
            writable: true,
            configurable: true,
            enumerable: false
        });
    }
}