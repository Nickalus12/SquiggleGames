const sameAction = (a, b) => a.onClick === b.onClick && a.title === b.title;

const addSheetItems = ({main, moreButtons = []}) => {
    const items = main && main.onClick ? [Object.assign({}, main)] : [];
    const rest = moreButtons.slice().reverse();
    for (const button of rest) {
        if (!button || !button.title) continue;
        const twin = items.find(item => sameAction(item, button));
        if (twin) {
            if (button.img) twin.img = button.img;
            continue;
        }
        items.push(button);
    }
    return items;
};

const fileItems = items => items.filter(item => typeof item.fileInput === 'function');

export {addSheetItems, fileItems};
