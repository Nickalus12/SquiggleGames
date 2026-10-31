const defaultObserver = () => (typeof IntersectionObserver === 'undefined' ? null : IntersectionObserver);

const installHiddenStageDraw = (renderer, {Observer = defaultObserver()} = {}) => {
    if (!renderer || renderer.sqHiddenDraw || !Observer || !renderer.canvas) return () => {};
    let visible = true;
    const observer = new Observer(entries => {
        const last = entries[entries.length - 1];
        if (last) visible = last.isIntersecting;
    });
    observer.observe(renderer.canvas);
    const draw = renderer.draw;
    renderer.draw = function (...args) {
        const wanted = renderer._snapshotCallbacks && renderer._snapshotCallbacks.length > 0;
        if (!visible && !wanted) return null;
        return draw.apply(this, args);
    };
    renderer.sqHiddenDraw = {
        get visible () {
            return visible;
        }
    };
    return () => {
        observer.disconnect();
        renderer.draw = draw;
        renderer.sqHiddenDraw = null;
    };
};

export {installHiddenStageDraw};
